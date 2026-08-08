import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { ContextConsumer } from "@lit/context";

import { dataGridContext } from "../../base/data-grid-context.js";
import styles from "./data-grid-cell.css?inline";

/** @typedef {import("../../base/data-grid.js").DataGridColumn} DataGridColumn */

/**
 * @tag md-data-grid-cell
 * @summary One body cell of an `md-data-grid`. The host itself is the
 * rendered/focusable cell (no wrapper div) — `part`/`role` are set once in
 * the constructor, an explicit `grid-column` (from `colIndex`/`colSpan`,
 * not left to auto-placement) is kept in sync in `willUpdate()` (mirrors
 * `md-data-grid-header-cell`), and `tabindex`/the align/highlighted/row-span
 * modifiers are kept in sync in `updated()`
 * (focus state and `rowHeight` both come from a context subscription rather
 * than a declared reactive property, so they can't be targeted by
 * `willUpdate()`'s `changed` map). Composed internally by the grid — not
 * intended to be used standalone.
 */
@customElement("md-data-grid-cell")
export class MdDataCell extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    row: { attribute: false },
    column: { attribute: false },
    rowIndex: { type: Number },
    colIndex: { type: Number },
    colSpan: { type: Number },
    rowSpan: { type: Number },
  };

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  constructor() {
    super();

    /** @type {Record<string, unknown>} */
    this.row = {};

    /** @type {DataGridColumn} */
    this.column = { field: "" };

    /** @type {number} */
    this.rowIndex = 0;

    /** @type {number} */
    this.colIndex = 0;

    /** @type {number} */
    this.colSpan = 1;

    /**
     * Row-spanning owner: a run of `rowSpan` consecutive rows shares one
     * equal value in this column (see `RowSpanController`). Grows this
     * cell to `rowHeight * rowSpan` tall and lets it overflow past its own
     * row's box — the covered rows' cells for this column simply aren't
     * rendered, so there's nothing underneath to clip against.
     * @type {number}
     */
    this.rowSpan = 1;

    /**
     * Class name(s) last applied from `column.cellClassName` — tracked so
     * a changed (or cleared) value can be removed before the new one is
     * added, since `classList` is mutated directly here rather than
     * reconciled from a template.
     * @private @type {string}
     */
    this._appliedCellClassName = "";

    /** @private */
    this._gridConsumer = new ContextConsumer(this, {
      context: dataGridContext,
      subscribe: true,
    });

    this.setAttribute("part", "cell");
    this.setAttribute("role", "gridcell");

    // "focusin"/"focusout" (bubbling + composed), not "focus"/"blur" (neither
    // bubbles nor crosses the shadow boundary): a `renderCell` can put an
    // inner focusable element (e.g. an icon button) in this cell's shadow
    // tree, and per the WAI-ARIA APG grid pattern `focusCell()` below sends
    // DOM focus straight to that inner element, not this host — plain
    // "focus"/"blur" would never fire here for that case since the host
    // itself is never the event target.
    this.addEventListener("focusin", () =>
      this._gridConsumer.value?.setCellFocus(this.rowIndex, this.colIndex),
    );
    this.addEventListener("focusout", () =>
      this._gridConsumer.value?.clearCellFocus(this.rowIndex, this.colIndex),
    );
  }

  /** @returns {unknown} */
  get _value() {
    const { row, column, rowIndex } = this;
    const raw = row[column.field];
    return column.valueGetter
      ? column.valueGetter({ row, column, rowIndex, value: raw })
      : raw;
  }

  /**
   * Imperatively focuses this cell for roving-tabindex keyboard navigation.
   * Per the WAI-ARIA APG grid pattern, delegates to the first inner element
   * a `renderCell` opted into the tab sequence (`tabindex="0"`) — e.g. an
   * icon button — falling back to the cell host itself when there is none.
   */
  focusCell() {
    const target =
      /** @type {HTMLElement | null} */ (
        this.shadowRoot?.querySelector('[tabindex="0"]')
      ) ?? this;
    target.focus();
  }

  /** @param {import("lit").PropertyValues} changed */
  willUpdate(changed) {
    if (changed.has("colIndex") || changed.has("colSpan")) {
      this.style.gridColumn = `${this.colIndex + 1} / span ${this.colSpan}`;
    }
    if (
      (changed.has("rowIndex") || changed.has("colIndex")) &&
      this.matches(":focus-within")
    ) {
      this._gridConsumer.value?.clearCellFocus(
        /** @type {number} */ (changed.get("rowIndex") ?? this.rowIndex),
        /** @type {number} */ (changed.get("colIndex") ?? this.colIndex),
      );
      // Focus may be on this host itself or on an inner element inside its
      // shadow tree (delegated to by focusCell()) — release whichever one
      // actually holds it. Blurring an element that isn't focused is a
      // harmless no-op, so both calls are safe regardless of which applies.
      /** @type {HTMLElement | null} */ (
        this.shadowRoot?.activeElement
      )?.blur();
      this.blur();
    }
  }

  /** @param {import("lit").PropertyValues} changed */
  updated(changed) {
    super.updated(changed);

    const { rowIndex, colIndex, column } = this;
    const focused =
      this._gridConsumer.value?.focusedRegion === "cell" &&
      this._gridConsumer.value?.focusedCell?.rowIndex === rowIndex &&
      this._gridConsumer.value?.focusedCell?.colIndex === colIndex;
    const highlighted =
      focused &&
      this._gridConsumer.value?.hasFocus &&
      !this._gridConsumer.value?.disableCellHighlight;

    this.tabIndex = focused ? 0 : -1;

    const align = column.align ?? "left";
    this.classList.toggle("data-grid-cell_align-right", align === "right");
    this.classList.toggle("data-grid-cell_align-center", align === "center");
    this.classList.toggle("data-grid-cell_highlighted", Boolean(highlighted));

    const cellClassName =
      (typeof column.cellClassName === "function"
        ? column.cellClassName({
            row: this.row,
            column,
            rowIndex,
            value: this._value,
          })
        : column.cellClassName) ?? "";
    if (cellClassName !== this._appliedCellClassName) {
      for (const cls of this._appliedCellClassName.split(" ")) {
        if (cls) this.classList.remove(cls);
      }
      for (const cls of cellClassName.split(" ")) {
        if (cls) this.classList.add(cls);
      }
      this._appliedCellClassName = cellClassName;
    }
    const rowHeight = /** @type {number} */ (
      this._gridConsumer.value?.rowHeight ?? 0
    );
    this.classList.toggle("data-grid-cell_row-span", this.rowSpan > 1);
    this.style.height = this.rowSpan > 1 ? `${rowHeight * this.rowSpan}px` : "";
  }

  render() {
    const { row, column, rowIndex } = this;
    const value = this._value;

    return html`${
      column.renderCell
        ? column.renderCell({ row, column, rowIndex, value })
        : value
    }`;
  }
}
