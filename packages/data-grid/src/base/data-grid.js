import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { ContextProvider } from "@lit/context";
import { repeat } from "lit/directives/repeat.js";

import "../components/header-cell/data-grid-header-cell.js";
import "../components/column/data-grid-column.js";
import "../components/cell/data-grid-cell.js";
import "../components/footer/data-grid-footer.js";
import "@symblight/wc-material/progress-linear";
import "@symblight/wc-material/skeleton";

import { dataGridContext } from "./data-grid-context.js";
import { DeclarativeSlotController } from "../controllers/data-grid-declarative-slot-controller.js";
import {
  VirtualizationController,
  estimateRowHeight,
} from "../controllers/data-grid-virtualization-controller.js";
import { PaginationController } from "../controllers/data-grid-pagination-controller.js";
import { RowUpdatesController } from "../controllers/data-grid-row-updates-controller.js";
import { KeyboardNavController } from "../controllers/data-grid-keyboard-nav-controller.js";
import { FocusController } from "../controllers/data-grid-focus-controller.js";
import { ColumnResizeController } from "../controllers/data-grid-column-resize-controller.js";
import { SortController } from "../controllers/data-grid-sort-controller.js";
import { RowSpanController } from "../controllers/data-grid-row-span-controller.js";
import { RowSelectionController } from "../controllers/data-grid-selection-controller.js";
import { DetailPanelController } from "../controllers/data-grid-detail-panel-controller.js";
import { GRID_CHECKBOX_SELECTION_COL_DEF } from "../columns/data-grid-checkbox-column.js";
import { GRID_DETAIL_PANEL_TOGGLE_COL_DEF } from "../columns/data-grid-detail-panel-column.js";
import { buildDataGridContext } from "./data-grid-build-context.js";
import { dataGridProperties } from "./data-grid-properties.js";
import {
  DEFAULT_ROW_HEIGHT,
  DEFAULT_HEADER_HEIGHT,
  DEFAULT_OVERSCAN,
  DEFAULT_PAGE_SIZE_OPTIONS,
  DETAIL_PANEL_ESTIMATED_HEIGHT,
  defaultGetRowId,
} from "./data-grid-constants.js";
import {
  renderHeaderCells,
  renderSkeletonRows,
  renderRow,
} from "./data-grid-render.js";
import styles from "./data-grid.css?inline";

// Forwarding typedefs — the canonical declarations moved to
// data-grid-types.js (see .claude/plans/data-grid-file-split-plan.md Phase
// 1a) purely to shrink this file. Kept here, under the same names, so every
// existing `import("./data-grid.js").DataGridColumn`-style reference
// elsewhere in this package keeps resolving unchanged.
/** @typedef {import("./data-grid-types.js").DataGridColumn} DataGridColumn */
/** @typedef {import("./data-grid-types.js").DataGridCellParams} DataGridCellParams */
/** @typedef {import("./data-grid-types.js").DataGridPaginationModel} DataGridPaginationModel */
/** @typedef {import("./data-grid-types.js").DataGridSortItem} DataGridSortItem */
/** @typedef {import("./data-grid-types.js").DataGridRowUpdate} DataGridRowUpdate */

/**
 * @tag md-data-grid
 * @summary Virtualized Material Design 3 data grid.
 *
 * `columns` and `rows` are set imperatively
 * (`document.querySelector("md-data-grid").rows = [...]`) — not light-DOM
 * children. Two light-DOM slots exist as declarative overrides of otherwise
 * internal rendering: `slot="empty-label"` (optional content shown instead
 * of the default "No rows" text when there are no rows to display) and
 * `slot="footer"` (optional content that replaces the internal, pagination-
 * driven `md-data-grid-footer` entirely — native `<slot>` fallback-content
 * semantics mean whatever's slotted in wins outright, regardless of
 * `paginationModel`/`hidePagination`). Internally composes
 * `md-data-grid-header-cell`, `md-data-grid-cell`, and `md-data-grid-footer`.
 *
 * This class is an orchestration layer: virtualization, pagination, row
 * updates, and keyboard nav each live in their own Reactive Controller
 * (`data-grid-*-controller.js`). Cross-controller wiring (resetting scroll
 * on page change, clamping the page when `rows` changes) happens only in
 * `updated()` below — the controllers don't know about each other.
 *
 * Deliberately tree-agnostic: `<md-data-grid-tree>` (`data-grid-tree.js`)
 * extends this class to add hierarchical rows, rather than that behavior
 * being an opt-in flag baked in here — see `_withLeadingColumns()`/
 * `_sortedRows`/`_contextDependencies()`/`_selectionResetDependencies()`
 * below for the exact extension points that split relies on. This keeps
 * `TreeController` and its column/cell code out of every consumer's bundle
 * unless they actually import `data-grid-tree.js`.
 */
@customElement("md-data-grid")
export class MdDataGrid extends LitElement {
  static properties = dataGridProperties;

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  constructor() {
    super();

    /** @private @type {DataGridColumn[]} */
    this._columnsValue = [];

    /** @type {Record<string, unknown>[]} */
    this.rows = [];

    /** @type {number | "auto"} */
    this.rowHeight = DEFAULT_ROW_HEIGHT;

    /** @type {number} */
    this.headerHeight = DEFAULT_HEADER_HEIGHT;

    /** @type {number} */
    this.overscan = DEFAULT_OVERSCAN;

    /** @type {(row: Record<string, unknown>) => string | number} */
    this.getRowId = defaultGetRowId;

    /** @type {((row: Record<string, unknown>, rowIndex: number) => string) | undefined} */
    this.getRowClassName = undefined;

    /** @type {DataGridPaginationModel | undefined} */
    this.paginationModel = undefined;

    /** @type {"client" | "server"} */
    this.paginationMode = "client";

    /** @type {number[]} */
    this.pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS;

    /** @type {number | undefined} */
    this.rowCount = undefined;

    /** @type {DataGridSortItem[]} */
    this.sortModel = [];

    /** @type {boolean} */
    this.rowSpanning = false;

    /** @type {boolean} */
    this.loading = false;

    /** @type {Set<PropertyKey>} */
    this.rowSelectionModel = new Set();

    /** @type {boolean} */
    this.hidePagination = false;

    /** @type {boolean} */
    this.disableCellHighlight = false;

    /** @type {boolean} */
    this.disableColumnResize = false;

    /** @type {boolean} */
    this.disableColumnSorting = false;

    /** @type {boolean} */
    this.disableMultipleRowSelection = false;

    /** @type {boolean} */
    this.disableRowSelectionOnClick = false;

    /** @type {boolean} */
    this.checkboxSelection = false;

    /**
     * @type {((params: { row: Record<string, unknown>, rowIndex: number }) => unknown) | undefined}
     */
    this.getDetailPanelContent = undefined;

    /** @type {Set<PropertyKey>} */
    this.detailPanelExpandedRowIds = new Set();

    // Not @private: data-grid-build-context.js reads these directly as an
    // internal sibling module — see §15 of the data-grid plan.
    this._virtualization = new VirtualizationController(this);
    this._pagination = new PaginationController(this);
    this._rowUpdates = new RowUpdatesController(this);
    this._focus = new FocusController(this, {
      // focus state isn't a Lit reactive property, so willUpdate()'s
      // property-changed gate can't see it change — rebuild the context
      // immediately instead of waiting for the next tracked-property update.
      onFocusChange: () =>
        this._gridContextProvider.setValue(buildDataGridContext(this)),
    });
    this._keyboardNav = new KeyboardNavController(this);
    this._columnResize = new ColumnResizeController(this, {
      // resizingColumnField isn't a Lit reactive property either — same
      // reasoning as _focus's onFocusChange above, fired only on drag
      // start/end, never per pointermove (see the controller's own doc
      // comment on why per-move state deliberately bypasses Lit).
      onResizeStateChange: () =>
        this._gridContextProvider.setValue(buildDataGridContext(this)),
    });
    this._sort = new SortController(this);
    this._rowSpan = new RowSpanController(this);
    this._selection = new RowSelectionController(this);
    this._detailPanel = new DetailPanelController(this);
    this._declarativeColumns = new DeclarativeSlotController(this, {
      selector: "md-data-grid-column",
      hostProperty: "columns",
      toValue: (el) =>
        /** @type {import("../components/column/data-grid-column.js").MdDataGridColumn} */ (
          el
        ).toColumnDef(),
      changeEvent: "md-data-grid-column-change",
    });

    // Not @private (see the controllers above) — MdDataGridTree's own
    // constructor (data-grid-tree.js) rebuilds context once more after
    // setting its own fields, since this initial build runs before they
    // exist yet.
    this._gridContextProvider = new ContextProvider(this, {
      context: dataGridContext,
    });
    this._gridContextProvider.setValue(buildDataGridContext(this));
  }

  /** @param {import("lit").PropertyValues} changed */
  firstUpdated(changed) {
    super.firstUpdated(changed);
    this._virtualization.observeViewport();
  }

  /**
   * Property names whose change should rebuild `dataGridContext` in
   * `willUpdate()` below — a hook rather than a hard-coded condition list
   * so `MdDataGridTree` (`data-grid-tree.js`) can extend it with its own
   * property names without this class knowing they exist. Must run before
   * `render()` (not in `updated()`, which runs after it) — a subclass like
   * `MdDataGridTree` that also rebuilds derived state (its tree) in
   * `willUpdate()` needs to do so *before* calling `super.willUpdate()`, so
   * that derived state is current by the time this rebuilds context from it
   * — otherwise the very update that changed it would render one cycle
   * late, against the previous state instead of the new one.
   * @returns {string[]}
   */
  _contextDependencies() {
    return [
      "rowHeight",
      "getRowId",
      "rows",
      "paginationModel",
      "paginationMode",
      "pageSizeOptions",
      "rowCount",
      "disableCellHighlight",
      "rowSelectionModel",
      "disableMultipleRowSelection",
      "detailPanelExpandedRowIds",
      "getDetailPanelContent",
    ];
  }

  /** @param {import("lit").PropertyValues} changed */
  willUpdate(changed) {
    if (this._contextDependencies().some((prop) => changed.has(prop))) {
      this._gridContextProvider.setValue(buildDataGridContext(this));
    }
  }

  /**
   * Property names whose change should reset the shift-range selection
   * anchor in `updated()` below — same hook pattern as
   * `_contextDependencies()` above, for the same reason: `MdDataGridTree`
   * extends this with `treeDataExpandedGroupIds` (expand/collapse changes
   * which index a row lands at in `_effectiveRows`, same as a sort or a
   * rows swap already does) without this class needing to know that
   * property exists.
   * @returns {string[]}
   */
  _selectionResetDependencies() {
    return ["rows", "sortModel"];
  }

  /**
   * All cross-controller wiring lives here — the controllers themselves
   * don't reference each other. See §15 of the data-grid plan.
   * @param {import("lit").PropertyValues} changed
   */
  updated(changed) {
    super.updated(changed);
    if (changed.has("paginationModel")) {
      this._virtualization.resetScroll();
    }
    if (changed.has("rows") && this.paginationModel) {
      // No-op if the current page is still in range.
      this._pagination.setPage(this.paginationModel.page);
    }
    if (this._selectionResetDependencies().some((prop) => changed.has(prop))) {
      // Invalidates any shift-range anchor whenever it's stale.
      this._selection.resetAnchor();
    }
    // Detail-row content is always arbitrary/dynamic height, regardless of
    // whether ordinary rows use a fixed `rowHeight` — needs the same real
    // measurement `rowHeight: "auto"` already gets, whenever the feature's
    // in use at all (cheap to over-trigger: see _measureAutoRows()'s own
    // doc comment on why calling it is a no-op for anything unchanged).
    if (this.rowHeight === "auto" || this.getDetailPanelContent) {
      this._measureAutoRows();
    }
  }

  /**
   * Feeds every currently-rendered row's *real* rendered height back into
   * the virtualizer for `rowHeight: "auto"` (and, independently, for every
   * detail-panel row regardless of `rowHeight` — see the `updated()` call
   * site above) — runs after every update (rather than once), since row
   * divs are DOM-recycled (the row `repeat()` in `render()` below is keyed
   * by slot position, not row identity, so the same node gets rebound to a
   * different row as you scroll instead of remounted) and `measureRow()`
   * re-reads each node's current `data-index` every call, which is what
   * makes it track that rebinding correctly. Cheap to call unconditionally:
   * a row whose measured size hasn't actually changed since last time is a
   * no-op inside `measureRow()` (see its own doc comment) — true for a
   * fixed-height row measured this way too, not just "auto" ones.
   * @private
   */
  _measureAutoRows() {
    const rows = this.renderRoot.querySelectorAll(
      ".data-grid__rows > [data-index]",
    );
    for (const row of rows) {
      this._virtualization.measureRow(row);
    }
  }

  /** @returns {DataGridColumn[]} */
  get columns() {
    return this._columnsValue;
  }

  /**
   * Custom accessor (see `noAccessor: true` above) instead of a plain Lit
   * property — the only place that can catch the exact assignment that
   * conflicts with `<md-data-grid-column>` children, rather than lazily
   * noticing it on some later, unrelated mutation (or never, if none ever
   * happens again). `DeclarativeSlotController.sync()` is the one
   * legitimate writer once declarative children exist; it marks its own
   * writes via `isSyncing` so they don't trip this.
   *
   * On a real conflict, the assignment is rejected outright (not applied
   * even transiently) and replaced with an immediate resync from the DOM —
   * "declarative children are authoritative" needs to be a hard guarantee,
   * not "usually true, unless nothing happens to re-trigger a sync before
   * something reads `columns` again".
   * @param {DataGridColumn[]} value
   */
  set columns(value) {
    if (
      this._declarativeColumns?.hasDeclarativeChildren &&
      !this._declarativeColumns.isSyncing
    ) {
      if (!this._declarativeColumns.warnedAboutConflict) {
        console.warn(
          "<md-data-grid>: `columns` was assigned directly while " +
            "<md-data-grid-column> children are present. The declarative " +
            "children are authoritative and this assignment is being " +
            "rejected — use one approach or the other, not both.",
        );
        this._declarativeColumns.warnedAboutConflict = true;
      }
      this._declarativeColumns.sync();
      return;
    }
    const old = this._columnsValue;
    this._columnsValue = value;
    this.requestUpdate("columns", old);
  }

  /**
   * `columns` with synthetic columns prepended — the actual list rendered
   * (header + every row) and the one every column-index-based controller
   * (resize, keyboard nav) operates against, so these are genuinely columns
   * 0/1/2 rather than a visual overlay bolted on separately. `columns`
   * itself (the public property) is never touched — `ColumnResizeController`
   * writes back to it with these synthetic columns' offset subtracted out
   * again.
   *
   * Composed as three named steps, inside-out — `_withCheckboxColumn` is
   * outermost so checkbox always ends up first (matches MUI's own reading
   * order), `_withLeadingColumns` is a no-op passthrough here and the exact
   * extension point `MdDataGridTree` overrides to insert its grouping
   * column between checkbox and everything else — structural to row
   * identity/hierarchy, hence "leading" rather than appended at the end —
   * `_withDetailToggleColumn` is innermost.
   */
  get _columns() {
    return this._withCheckboxColumn(
      this._withLeadingColumns(this._withDetailToggleColumn(this.columns)),
    );
  }

  /**
   * @param {DataGridColumn[]} cols
   * @returns {DataGridColumn[]}
   */
  _withDetailToggleColumn(cols) {
    return this.getDetailPanelContent
      ? [GRID_DETAIL_PANEL_TOGGLE_COL_DEF, ...cols]
      : cols;
  }

  /**
   * No-op in the base class — see `_columns`'s own doc comment. Overridden
   * by `MdDataGridTree` to prepend its grouping/toggle column here.
   * @param {DataGridColumn[]} cols
   * @returns {DataGridColumn[]}
   */
  _withLeadingColumns(cols) {
    return cols;
  }

  /**
   * @param {DataGridColumn[]} cols
   * @returns {DataGridColumn[]}
   */
  _withCheckboxColumn(cols) {
    return this.checkboxSelection
      ? [GRID_CHECKBOX_SELECTION_COL_DEF, ...cols]
      : cols;
  }

  /**
   * `rows` run through the active sort — the shared starting point for
   * pagination/virtualization/keyboard nav below. Overridden wholesale by
   * `MdDataGridTree` for the collapse-aware, hierarchy-preserving
   * flattening of its tree instead — sorting happens *within* each group's
   * own children there, never across the whole tree at once, so the
   * hierarchy itself is never disturbed by `sortModel`.
   */
  get _sortedRows() {
    return this._sort.sortedRows(this.rows);
  }

  /** Sorted rows sliced to the current page (client mode) or passed through as-is (server mode / no pagination). */
  get _effectiveRows() {
    return this._pagination.effectiveRows(this._sortedRows);
  }

  /** @returns {number} */
  get _pageCount() {
    return this._pagination.pageCount;
  }

  /**
   * `undefined` when `getDetailPanelContent` is unset — lets
   * `VirtualizationController` keep using its own plain-`rowHeight` default
   * untouched, exactly as before this feature existed. Only built at all
   * when there's an actual per-index difference to describe.
   * @param {import("../controllers/data-grid-detail-panel-controller.js").DetailPanelRenderItem[]} items
   * @returns {((index: number) => number) | undefined}
   */
  _estimateItemSize(items) {
    if (!this.getDetailPanelContent) return undefined;
    return (index) =>
      items[index]?.kind === "detail"
        ? DETAIL_PANEL_ESTIMATED_HEIGHT
        : estimateRowHeight(this);
  }

  /**
   * `index` is a data row index (position in `_effectiveRows`), same
   * contract as before master-detail existed — translated internally into
   * a virtual/rendered index, since an expanded row anywhere above `index`
   * shifts everything below it by one.
   * @param {number} index
   */
  scrollToRow(index) {
    const { rowIndexToVirtualIndex } = this._detailPanel.buildRenderItems(
      this._effectiveRows,
    );
    this._virtualization.scrollToRow(rowIndexToVirtualIndex[index] ?? index);
  }

  /** @returns {{ row: Record<string, unknown>, rowIndex: number }[]} */
  getVisibleRows() {
    const effectiveRows = this._pagination.effectiveRows(this._sortedRows);
    const { items } = this._detailPanel.buildRenderItems(effectiveRows);
    const { startIndex, endIndex } = this._virtualization.visibleRange(
      items.length,
      this._estimateItemSize(items),
    );
    return items
      .slice(startIndex, endIndex)
      .filter((item) => item.kind === "row")
      .map((item) => ({ row: item.row, rowIndex: item.rowIndex }));
  }

  /** @param {PropertyKey} id */
  toggleDetailPanel(id) {
    this._detailPanel.toggle(id);
  }

  /** @param {Set<PropertyKey>} ids */
  setExpandedDetailPanel(ids) {
    this._detailPanel.setExpanded(ids);
  }

  /** @param {number} page */
  setPage(page) {
    this._pagination.setPage(page);
  }

  /** @param {number} pageSize */
  setPageSize(pageSize) {
    this._pagination.setPageSize(pageSize);
  }

  /**
   * Applies a batch of row changes without replacing `rows` wholesale.
   *
   * Each entry is matched against existing rows via `getRowId()`:
   * - `{ ...fields, _action: "delete" }` removes the matching row.
   * - `{ ...fields }` (no `_action`) shallow-merges onto the matching row,
   *   or — if no row matches — is inserted as a new row, appended to the end.
   *
   * Entries whose id can't be resolved via `getRowId()` are skipped with a
   * console warning. Dispatches a single `md-data-grid-rows-update` event
   * summarizing the batch.
   * @param {DataGridRowUpdate | DataGridRowUpdate[]} changes
   */
  updateRows(changes) {
    this._rowUpdates.update(changes);
  }

  /**
   * Shift-clicking to range-select rows is also, natively, how a browser
   * extends a text selection — without this, every shift-click after the
   * first drags a text-selection highlight across whatever cell content
   * sits between the anchor row and the clicked one. That selection is
   * made at mousedown (before `click` fires), so it has to be suppressed
   * here, not in `_onRowClick()`; preventing default on `mousedown` blocks
   * the native selection without blocking the click that follows it.
   * @param {MouseEvent} event
   */
  _onRowMouseDown(event) {
    if (event.shiftKey) event.preventDefault();
  }

  /**
   * @param {MouseEvent} event
   * @param {Record<string, unknown>} row
   * @param {number} rowIndex
   * @param {Record<string, unknown>[]} rows the exact rows this click happened against — for shift-range selection
   */
  _onRowClick(event, row, rowIndex, rows) {
    if (!this.disableRowSelectionOnClick) {
      this._handleRowSelectionClick(event, row, rowIndex, rows);
    }
    this.dispatchEvent(
      new CustomEvent("md-data-grid-row-click", {
        detail: { row, rowIndex },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * The actual selection application for a row click — split out from
   * `_onRowClick()` so `MdDataGridTree` can override just this part (a
   * plain row click cascades the same way its checkbox does once
   * checkboxSelection and treeData are both on, falling back to `super()`
   * for its own flat single-row/shift/ctrl highlight-selection otherwise)
   * without duplicating the dispatch-the-click-event part above.
   * @param {MouseEvent} event
   * @param {Record<string, unknown>} row
   * @param {number} rowIndex
   * @param {Record<string, unknown>[]} rows the exact rows this click happened against — for shift-range selection
   */
  _handleRowSelectionClick(event, row, rowIndex, rows) {
    const modifiers = this.checkboxSelection
      ? { shiftKey: event.shiftKey, ctrlKey: true, metaKey: true }
      : event;
    this._selection.select(row, rowIndex, modifiers, rows);
  }

  /**
   * Checkbox-cell click path (via `dataGridContext.toggleRowSelection`).
   * @param {Record<string, unknown>} row
   * @param {number} rowIndex
   * @param {{ shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean }} modifiers
   */
  _toggleRowSelection(row, rowIndex, modifiers) {
    this._selection.select(row, rowIndex, modifiers, this._effectiveRows);
  }

  /** Header checkbox "select all". */
  _toggleSelectAll() {
    this._selection.toggleAll(this.rows);
  }

  /** @param {KeyboardEvent} event */
  _onKeydown(event) {
    const effectiveRows = this._pagination.effectiveRows(this._sortedRows);
    const { items, rowIndexToVirtualIndex } =
      this._detailPanel.buildRenderItems(effectiveRows);
    this._keyboardNav.onKeydown(event, {
      rowCount: effectiveRows.length,
      colCount: this._columns.length,
      // KeyboardNavController deals entirely in plain data rowIndex (it has
      // no reason to know detail rows exist — see DetailPanelController's
      // own doc comment) — translated into a virtual index here, the one
      // point where that has to happen for scrolling to land correctly.
      ensureRowVisible: (rowIndex) =>
        this._virtualization.ensureRowVisible(
          rowIndexToVirtualIndex[rowIndex],
          items.length,
        ),
    });
  }

  render() {
    const columns = this._columns;
    const gridTemplateColumns =
      this._virtualization.gridTemplateColumns(columns);
    const scrollbarWidth = this._virtualization.scrollbarWidth;
    const headerGridTemplateColumns = scrollbarWidth
      ? `${gridTemplateColumns} ${scrollbarWidth}px`
      : gridTemplateColumns;
    const effectiveRows = this._pagination.effectiveRows(this._sortedRows);
    // Detail-panel rows are a rendering/virtualization-only concept — every
    // other index below (rowSpans, selection, sort, pagination) still runs
    // entirely over `effectiveRows`/data rowIndex, never `renderItems`. See
    // DetailPanelController's own doc comment for why that split matters.
    const { items: renderItems } =
      this._detailPanel.buildRenderItems(effectiveRows);
    const estimateItemSize = this._estimateItemSize(renderItems);
    const { startIndex, endIndex, offsetY } = this._virtualization.visibleRange(
      renderItems.length,
      estimateItemSize,
    );
    const visibleItems = renderItems.slice(startIndex, endIndex);
    const totalHeight = this._virtualization.totalSize(
      renderItems.length,
      estimateItemSize,
    );
    const rowSpans = this._rowSpan.computeSpans(effectiveRows);
    const showSkeletonRows = this.loading && effectiveRows.length === 0;
    const showLoadingOverlay = this.loading && effectiveRows.length > 0;
    const skeletonRowHeight =
      typeof this.rowHeight === "number" ? this.rowHeight : DEFAULT_ROW_HEIGHT;

    return html`
      <div class="data-grid" part="root" @keydown=${this._onKeydown}>
        <div
          class="data-grid__header"
          part="header"
          role="row"
          style="grid-template-columns: ${headerGridTemplateColumns}; height: ${
            this.headerHeight
          }px;"
        >
          ${renderHeaderCells(this, columns)}
          ${
            scrollbarWidth
              ? html`<div
                  class="data-grid__header-gutter"
                  part="header-gutter"
                ></div>`
              : nothing
          }
        </div>
        <div class="data-grid__viewport" part="viewport">
          ${
            showLoadingOverlay
              ? html`<md-progress-linear
                  class="data-grid__loading-indicator"
                  part="loading-indicator"
                  aria-label="Loading"
                ></md-progress-linear>`
              : nothing
          }
          ${
            effectiveRows.length === 0
              ? showSkeletonRows
                ? renderSkeletonRows(
                    columns,
                    gridTemplateColumns,
                    skeletonRowHeight,
                  )
                : html`
                    <div class="data-grid__empty-state" part="empty-state">
                      <slot name="empty-label">No rows</slot>
                    </div>
                  `
              : html`
                  <div
                    class="data-grid__spacer"
                    part="spacer"
                    style="height: ${totalHeight}px;"
                  >
                    <div
                      class="data-grid__rows"
                      part="rows"
                      style="transform: translateY(${offsetY}px);"
                    >
                      ${repeat(
                        visibleItems,
                        (_item, i) => i,
                        (item, i) =>
                          renderRow(this, item, startIndex + i, {
                            columns,
                            gridTemplateColumns,
                            effectiveRows,
                            rowSpans,
                          }),
                      )}
                    </div>
                  </div>
                `
          }
          ${
            showLoadingOverlay
              ? html`<div
                  class="data-grid__loading-overlay"
                  part="loading-overlay"
                ></div>`
              : nothing
          }
        </div>
        <slot name="footer">
          ${
            this.paginationModel && !this.hidePagination
              ? html`<md-data-grid-footer
                  exportparts="rows-per-page-label,page-size-select,page-size-option,footer-count,footer-prev,footer-next"
                ></md-data-grid-footer>`
              : nothing
          }
        </slot>
      </div>
    `;
  }
}
