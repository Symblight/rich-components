const DEFAULT_MIN_WIDTH = 40;

/** @param {MouseEvent} event */
function preventClick(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

/**
 * Owns drag-to-resize for column headers. `md-data-grid-header-cell` performs
 * the raw pointer mechanics (setPointerCapture, pointermove/up) and calls
 * into this controller through `dataGridContext` — the same channel
 * `setCellFocus` already uses — rather than a dedicated event bus.
 *
 * Dragging a column's right-edge handle trades width with its immediate
 * right neighbor — the dragged column grows/shrinks and the neighbor
 * shrinks/grows by exactly the same amount, so the grid's total width never
 * changes (the classic spreadsheet resize model). Each column's own
 * min/max still bounds how far the trade can go; if one side hits its
 * limit first, the drag delta is capped there for both sides so the pair's
 * combined width stays exactly constant.
 *
 * While dragging, width changes are applied directly to the header/row DOM
 * (bypassing `host.columns`) rather than through Lit's normal reactive
 * update — mutating a `state: true` array property on every `pointermove`
 * would re-run `render()` and re-diff the header plus every visible row for
 * a change that's purely cosmetic until the drag ends. `host.columns` is
 * only actually mutated once, in `endColumnResize()`, which is the single
 * point where the resize is committed and Lit's normal render takes back
 * over (its own diff will happily overwrite whatever we set directly).
 */
export class ColumnResizeController {
  /**
   * @param {import("../base/data-grid.js").MdDataGrid} host
   * @param {{ onResizeStateChange?: () => void }} [options]
   *   `onResizeStateChange` fires synchronously from `startColumnResize()`/
   *   `endColumnResize()` (drag start/end — never on every `pointermove`,
   *   which paints directly to the DOM and deliberately bypasses Lit for
   *   perf, same as `resizingColumnField` itself). Mirrors
   *   `FocusController`'s `onFocusChange` option exactly: `resizingColumnField`
   *   isn't a Lit reactive property, so the host uses this to rebuild the
   *   shared context immediately rather than waiting for a tracked-property
   *   update that a resize drag never actually triggers on its own.
   */
  constructor(host, options = {}) {
    this.host = host;
    this._onResizeStateChange = options.onResizeStateChange;

    /** @private */
    this._dragging = false;
    /** @private */
    this._resizeColIndex = -1;
    /** @private */
    this._partnerColIndex = -1;
    /** @private */
    this._startX = 0;
    /** @private */
    this._startWidth = 0;
    /** @private */
    this._startPartnerWidth = 0;
    /** @private */
    this._pendingWidth = 0;
    /** @private */
    this._pendingPartnerWidth = 0;

    /**
     * The `field` of whichever column is currently being dragged, or
     * `undefined` when no resize is in progress — read through
     * `dataGridContext` (`ctx.resizingColumnField`) by anything that wants
     * to react to a resize in progress, e.g. a custom `renderCell`
     * suppressing its own hover affordance mid-drag. Mirrors MUI X's
     * `resizingColumnField` grid-state field.
     * @type {string | undefined}
     */
    this.resizingColumnField = undefined;
  }

  /**
   * @param {import("../base/data-grid.js").DataGridColumn} column
   * @param {number} resizeColIndex
   * @returns {boolean}
   */
  isResizable(column, resizeColIndex) {
    if (this.host.disableColumnResize) return false;
    if (column.resizable === false) return false;
    // A trade needs a right-hand neighbor to trade with — matches why the
    // last column never gets a handle.
    return resizeColIndex < this.host._columns.length - 1;
  }

  /**
   * @param {number} resizeColIndex
   * @param {number} clientX
   */
  startColumnResize(resizeColIndex, clientX) {
    this._dragging = true;
    this._resizeColIndex = resizeColIndex;
    this._partnerColIndex = resizeColIndex + 1;
    this._startX = clientX;
    this._startWidth = this._measureWidth(resizeColIndex);
    this._startPartnerWidth = this._measureWidth(this._partnerColIndex);
    this._pendingWidth = this._startWidth;
    this._pendingPartnerWidth = this._startPartnerWidth;

    this.resizingColumnField = this.host._columns[resizeColIndex]?.field;
    this._onResizeStateChange?.();
    this.host.requestUpdate();

    // Pinned on <body> rather than relying on the handle's own CSS :hover
    // cursor — once setPointerCapture is active, a fast drag can easily
    // move the pointer off the handle's thin hit-area mid-gesture, and the
    // cursor should stay col-resize for the whole drag regardless.
    document.body.style.cursor = "col-resize";

    // A "click" always fires right after pointerup on the same target —
    // including a plain click-without-drag on the handle itself — and
    // would otherwise bubble out of the separator into the header's own
    // click-to-sort listener. Swallow it in the capture phase; removed
    // (in endColumnResize) via setTimeout rather than immediately, since
    // click dispatch happens synchronously and this listener needs to
    // still be attached when it fires.
    document.addEventListener("click", preventClick, true);

    this._dispatchResizeEvent("start", this._startWidth);
  }

  /** @param {number} clientX */
  resizeColumn(clientX) {
    if (!this._dragging) return;
    const width = this._previewWidth(clientX);
    this._dispatchResizeEvent("resize", width);
  }

  /** @param {number} clientX */
  endColumnResize(clientX) {
    if (!this._dragging) return;
    const width = this._previewWidth(clientX);
    this._commitWidth();
    this._dispatchResizeEvent("end", width);
    this._dragging = false;
    this._resizeColIndex = -1;
    this._partnerColIndex = -1;
    this.resizingColumnField = undefined;
    this._onResizeStateChange?.();
    this.host.requestUpdate();
    document.body.style.removeProperty("cursor");
    setTimeout(
      () => document.removeEventListener("click", preventClick, true),
      0,
    );
  }

  /**
   * A column's current rendered width. Reads `column.width` directly when
   * it's set — it's already authoritative (matches the DOM, since any
   * prior drag is fully committed before a new one can start) and avoids
   * re-parsing computed grid-template-columns. Only actually measures the
   * DOM for a flexible (no explicit `width`) column, where nothing else
   * tracks its current rendered size.
   * @private
   * @param {number} colIndex
   * @returns {number}
   */
  _measureWidth(colIndex) {
    const column = this.host._columns[colIndex];
    if (typeof column?.width === "number") return column.width;

    const header = this.host.renderRoot?.querySelector(".data-grid__header");
    const tracks = header
      ? getComputedStyle(header).gridTemplateColumns.split(" ")
      : [];
    const measured = Number.parseFloat(tracks[colIndex] ?? "");
    return Number.isFinite(measured) ? measured : DEFAULT_MIN_WIDTH;
  }

  /**
   * Computes the clamped trade for the current pointer position and paints
   * it straight onto the header + currently-rendered row elements. Doesn't
   * touch `host.columns` — see the class doc comment.
   * @private
   * @param {number} clientX
   * @returns {number} the dragged column's new width
   */
  _previewWidth(clientX) {
    const column = this.host._columns[this._resizeColIndex];
    const partner = this.host._columns[this._partnerColIndex];

    const min = column.minWidth ?? DEFAULT_MIN_WIDTH;
    const max = column.maxWidth ?? Infinity;
    const partnerMin = partner.minWidth ?? DEFAULT_MIN_WIDTH;
    const partnerMax = partner.maxWidth ?? Infinity;

    // Bound the raw pointer delta so *both* columns stay within their own
    // min/max while the pair's combined width stays exactly constant —
    // whichever side would hit its limit first caps the trade for both.
    const deltaMin = Math.max(
      min - this._startWidth,
      this._startPartnerWidth - partnerMax,
    );
    const deltaMax = Math.min(
      max - this._startWidth,
      this._startPartnerWidth - partnerMin,
    );
    const rawDelta = clientX - this._startX;
    const delta = Math.min(Math.max(rawDelta, deltaMin), deltaMax);

    const width = Math.round(this._startWidth + delta);
    const partnerWidth = Math.round(this._startPartnerWidth - delta);
    this._pendingWidth = width;
    this._pendingPartnerWidth = partnerWidth;

    const previewColumns = this.host._columns.map((col, index) => {
      if (index === this._resizeColIndex) return { ...col, width };
      if (index === this._partnerColIndex)
        return { ...col, width: partnerWidth };
      return col;
    });
    const gridTemplateColumns =
      this.host._virtualization.gridTemplateColumns(previewColumns);
    const scrollbarWidth = this.host._virtualization.scrollbarWidth;
    const headerGridTemplateColumns = scrollbarWidth
      ? `${gridTemplateColumns} ${scrollbarWidth}px`
      : gridTemplateColumns;

    const header = /** @type {HTMLElement | null | undefined} */ (
      this.host.renderRoot?.querySelector(".data-grid__header")
    );
    if (header) header.style.gridTemplateColumns = headerGridTemplateColumns;

    this.host.renderRoot?.querySelectorAll(".data-grid__row").forEach((row) => {
      /** @type {HTMLElement} */ (row).style.gridTemplateColumns =
        gridTemplateColumns;
    });

    return width;
  }

  /**
   * The single point during a drag where `host.columns` actually changes —
   * triggers one normal Lit re-render, which reconciles away whatever
   * `_previewWidth()` painted directly onto the DOM. `_resizeColIndex`/
   * `_partnerColIndex` are indices into `host._columns` (every synthetic
   * column `_columns` itself prepends — checkbox, and whatever a subclass
   * like `MdDataGridTree` adds via `_withLeadingColumns()`, plus master-
   * detail toggle) — `host.columns` itself never includes any of those, so
   * writing back means shifting the index down by however many of them are
   * actually prepended right now, rather than accidentally baking one of
   * them permanently into the public array. Derived structurally
   * (`host._columns.length - host.columns.length`) rather than re-summing
   * each individual flag here — this has to track `_columns`' own
   * composition exactly, and re-deriving it structurally means it can never
   * drift out of sync with `_columns` again (one of this grid's own past
   * bugs: this offset originally only counted the checkbox column
   * one-flag-at-a-time, so as soon as a second/third prepended column was
   * added, a drag on the first real column silently resized the second
   * instead — a structural count can't repeat that class of bug).
   * @private
   */
  _commitWidth() {
    const width = this._pendingWidth;
    const partnerWidth = this._pendingPartnerWidth;
    const offset = this.host._columns.length - this.host.columns.length;
    this.host.columns = this.host.columns.map((col, index) => {
      const mergedIndex = index + offset;
      if (mergedIndex === this._resizeColIndex) return { ...col, width };
      if (mergedIndex === this._partnerColIndex)
        return { ...col, width: partnerWidth };
      return col;
    });
  }

  /**
   * @private
   * @param {"start" | "resize" | "end"} phase
   * @param {number} width
   */
  _dispatchResizeEvent(phase, width) {
    const column = this.host._columns[this._resizeColIndex];
    this.host.dispatchEvent(
      new CustomEvent("md-data-grid-column-resize", {
        detail: {
          field: column?.field,
          colIndex: this._resizeColIndex,
          width,
          phase,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
