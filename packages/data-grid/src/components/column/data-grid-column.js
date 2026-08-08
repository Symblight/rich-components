import { LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import styles from "./data-grid-column.css?inline";

/** @typedef {import("../../base/data-grid.js").DataGridColumn} DataGridColumn */
/** @typedef {import("../../base/data-grid.js").DataGridCellParams} DataGridCellParams */

/**
 * Converter for `resizable`/`sortable`/`rowSpannable` — these need THREE
 * states (unset, `true`, `false`), not the usual boolean-attribute two
 * (present/absent), because `DataGridColumn`'s own fields are optional
 * booleans that default to `true` downstream when omitted (e.g.
 * `SortController.isSortable()`'s `column.sortable !== false`) — a plain
 * `type: Boolean` property can't distinguish "not specified, inherit the
 * default" from "explicitly false", it can only ever be `true` or `false`.
 * Same convention ARIA attributes use (`aria-hidden="true"|"false"`, not
 * presence) for the same reason.
 * @type {import("lit").ComplexAttributeConverter<boolean | undefined>}
 */
const tristateBooleanConverter = {
  fromAttribute: (value) => (value === null ? undefined : value !== "false"),
  toAttribute: (value) => (value === undefined ? null : String(value)),
};

/**
 * @tag md-data-grid-column
 * @summary Declarative column definition for `md-data-grid` — a light-DOM
 * child, never itself rendered (`:host { display: none; }`), that carries
 * the same fields as a `DataGridColumn` object as attributes:
 *
 * ```html
 * <md-data-grid
 *   ${ref((el) => { grid = el; })}
 * >
 *   <md-data-grid-column field="name" header-name="Name" width="140" sortable resizable></md-data-grid-column>
 *   <md-data-grid-column field="email" header-name="Email"></md-data-grid-column>
 * </md-data-grid>
 * ```
 *
 * Only `DataGridColumn`'s serializable fields have an attribute — the
 * function-valued ones (`renderCell`, `valueGetter`, `renderHeader`,
 * `rowSpanValueGetter`) can't be expressed as HTML text at all, so they're
 * declared `attribute: false` and set imperatively, the same escape hatch
 * every other non-serializable web-component API uses:
 *
 * ```js
 * document.querySelector('md-data-grid-column[field="status"]').renderCell =
 *   ({ row }) => html`<span class="pill">${row.status}</span>`;
 * ```
 *
 * `cellClassName`/`headerClassName` are dual-mode in `DataGridColumn`
 * itself (`string | (params) => string`) — declared here as plain string
 * attributes for the common case, but assigning a function to the property
 * directly works too: Lit only applies the declared `type`/`converter`
 * when converting FROM a parsed attribute, never to a value assigned
 * directly in JS, so `.cellClassName = (params) => "..."` is not blocked
 * by the `String` declaration.
 *
 * `toColumnDef()` is the only thing that reads this element's state — it
 * doesn't participate in rendering, focus, keyboard nav, or any other
 * `md-data-grid` concern itself; wiring it into `md-data-grid`'s own
 * `columns` is a later phase, not this one.
 */
@customElement("md-data-grid-column")
export class MdDataGridColumn extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    field: {},
    headerName: { attribute: "header-name" },
    width: { type: Number },
    minWidth: { type: Number, attribute: "min-width" },
    maxWidth: { type: Number, attribute: "max-width" },
    colSpan: { type: Number, attribute: "col-span" },
    resizable: { converter: tristateBooleanConverter },
    sortable: { converter: tristateBooleanConverter },
    rowSpannable: {
      attribute: "row-spannable",
      converter: tristateBooleanConverter,
    },
    align: {},
    cellClassName: { attribute: "cell-class-name" },
    headerClassName: { attribute: "header-class-name" },
    valueGetter: { attribute: false },
    renderCell: { attribute: false },
    renderHeader: { attribute: false },
    rowSpanValueGetter: { attribute: false },
  };

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  constructor() {
    super();

    /** @type {string} */
    this.field = "";

    /** @type {string | undefined} */
    this.headerName = undefined;

    /** @type {number | undefined} */
    this.width = undefined;

    /** @type {number | undefined} */
    this.minWidth = undefined;

    /** @type {number | undefined} */
    this.maxWidth = undefined;

    /** @type {number | undefined} */
    this.colSpan = undefined;

    /** @type {boolean | undefined} */
    this.resizable = undefined;

    /** @type {boolean | undefined} */
    this.sortable = undefined;

    /** @type {boolean | undefined} */
    this.rowSpannable = undefined;

    /** @type {"left" | "right" | "center" | undefined} */
    this.align = undefined;

    /** @type {string | ((params: DataGridCellParams) => string) | undefined} */
    this.cellClassName = undefined;

    /** @type {string | ((column: DataGridColumn) => string) | undefined} */
    this.headerClassName = undefined;

    /** @type {((params: DataGridCellParams) => unknown) | undefined} */
    this.valueGetter = undefined;

    /** @type {((params: DataGridCellParams) => import("lit").TemplateResult | string | number) | undefined} */
    this.renderCell = undefined;

    /** @type {((column: DataGridColumn) => import("lit").TemplateResult | string) | undefined} */
    this.renderHeader = undefined;

    /** @type {((params: DataGridCellParams) => unknown) | undefined} */
    this.rowSpanValueGetter = undefined;
  }

  /**
   * Tells `md-data-grid` to resync `columns` from its `<md-data-grid-column>`
   * children — fires on every update (including the first), since the grid
   * needs to learn about a brand new column just as much as an edited one.
   * `bubbles: true` so a listener on the grid host catches it regardless of
   * how deep this element sits under it; `composed: false` — it only needs
   * to reach `md-data-grid` itself via light-DOM bubbling, not cross further
   * out into whatever shadow root contains the grid.
   *
   * Structural changes (a column added/removed/reordered) are instead
   * caught by `md-data-grid`'s own `MutationController` observing its
   * `childList` directly — not from here, since an element being removed
   * has already left the tree by the time any of its own lifecycle callbacks
   * could dispatch something for it to bubble through.
   * @param {import("lit").PropertyValues} changed
   */
  updated(changed) {
    super.updated(changed);
    this.dispatchEvent(
      new CustomEvent("md-data-grid-column-change", {
        bubbles: true,
        composed: false,
      }),
    );
  }

  /**
   * This element's current state as a plain `DataGridColumn` object — the
   * shape `md-data-grid` actually consumes (see `GRID_CHECKBOX_SELECTION_COL_DEF`
   * in `data-grid-checkbox-column.js` for another hand-built example of the
   * same shape). Only ever-set fields are included, not `undefined`
   * placeholders — keeps the output identical to a hand-written column
   * literal that simply omitted the field, matching every optional
   * property in the `DataGridColumn` typedef.
   * @returns {DataGridColumn}
   */
  toColumnDef() {
    /** @type {DataGridColumn} */
    const column = { field: this.field };

    if (this.headerName !== undefined) column.headerName = this.headerName;
    // Lit's built-in Number converter turns a *removed* attribute into
    // `null` (not `undefined`) — `!= null` catches both so a column that
    // never had the attribute and one whose attribute was removed after
    // the fact behave identically here.
    if (this.width != null) column.width = this.width;
    if (this.minWidth != null) column.minWidth = this.minWidth;
    if (this.maxWidth != null) column.maxWidth = this.maxWidth;
    if (this.colSpan != null) column.colSpan = this.colSpan;
    if (this.resizable !== undefined) column.resizable = this.resizable;
    if (this.sortable !== undefined) column.sortable = this.sortable;
    if (this.rowSpannable !== undefined)
      column.rowSpannable = this.rowSpannable;
    if (this.align !== undefined)
      column.align = /** @type {"left" | "right" | "center"} */ (this.align);
    if (this.cellClassName) column.cellClassName = this.cellClassName;
    if (this.headerClassName) column.headerClassName = this.headerClassName;
    if (this.valueGetter) column.valueGetter = this.valueGetter;
    if (this.renderCell) column.renderCell = this.renderCell;
    if (this.renderHeader) column.renderHeader = this.renderHeader;
    if (this.rowSpanValueGetter)
      column.rowSpanValueGetter = this.rowSpanValueGetter;

    return column;
  }
}
