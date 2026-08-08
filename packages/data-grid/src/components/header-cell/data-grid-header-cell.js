import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { ContextConsumer } from "@lit/context";

import arrowUpward from "@material-design-icons/svg/outlined/arrow_upward.svg?raw";

import "@symblight/wc-material/icon";
import "../column-separator/data-grid-column-separator.js";
import "../column-title/data-grid-column-title.js";
import { dataGridContext } from "../../base/data-grid-context.js";
import styles from "./data-grid-header-cell.css?inline";

/** @typedef {import("../../base/data-grid.js").DataGridColumn} DataGridColumn */

/**
 * @tag md-data-grid-header-cell
 * @summary One header cell of an `md-data-grid`. The host itself is the
 * positioned/rendered cell (no wrapper div) — `part`/`role` are set once in
 * the constructor, the align modifier class, `column.headerClassName`, and
 * colSpan's `grid-column` style are kept in sync with `column`/`colSpan` in
 * `willUpdate()`, and `tabindex` (roving-tabindex for the `columnHeader`
 * focus region — see `FocusController`) is kept in sync in `updated()`.
 * `sortable`/`sort` reflect as attributes so `:host([sortable])` /
 * `:host([sort="desc"])` drive the pointer cursor and sort-icon styling —
 * clicking-to-sort is wired by `data-grid.js` at the usage site (a plain
 * `@click` listener, same as row clicks), not through `dataGridContext`;
 * this component only renders the current sort state. Keyboard-driven
 * sorting (Enter/Space) and Left/Right/ArrowDown navigation between header
 * cells go through `KeyboardNavController` instead, same as body cells.
 * Composed internally by the grid — not intended to be used standalone.
 */
@customElement("md-data-grid-header-cell")
export class MdDataHeaderCell extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    column: { attribute: false },
    colIndex: { type: Number },
    colSpan: { type: Number },
    resizeColIndex: { type: Number },
    resizable: { type: Boolean },
    sortable: { type: Boolean, reflect: true },
    sort: { type: String, reflect: true },
  };

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  constructor() {
    super();

    /** @type {DataGridColumn} */
    this.column = { field: "" };

    /** @type {number} */
    this.colIndex = 0;

    /** @type {number} */
    this.colSpan = 1;

    /** @type {number} */
    this.resizeColIndex = 0;

    /** @type {boolean} */
    this.resizable = false;

    /** @type {boolean} */
    this.sortable = false;

    /** @type {"asc" | "desc" | undefined} */
    this.sort = undefined;

    /**
     * Class name(s) last applied from `column.headerClassName` — tracked
     * so a changed (or cleared) value can be removed before the new one
     * is added, since `classList` is mutated directly here rather than
     * reconciled from a template.
     * @private @type {string}
     */
    this._appliedHeaderClassName = "";

    /** @private */
    this._gridConsumer = new ContextConsumer(this, {
      context: dataGridContext,
      subscribe: true,
    });

    this.setAttribute("part", "header-cell");
    this.setAttribute("role", "columnheader");

    // No matching "focusout" — unlike md-data-grid-cell's highlight, a header
    // cell's only focused-state visual is the browser's own native :focus
    // outline, which already goes away on blur by itself. See
    // FocusController.setHeaderFocus()'s doc comment for the full reasoning.
    this.addEventListener("focusin", () =>
      this._gridConsumer.value?.setHeaderFocus(this.colIndex),
    );
  }

  /** @param {import("lit").PropertyValues} changed */
  willUpdate(changed) {
    if (changed.has("column")) {
      const align = this.column.align ?? "left";
      this.classList.toggle(
        "data-grid-header-cell_align-right",
        align === "right",
      );
      this.classList.toggle(
        "data-grid-header-cell_align-center",
        align === "center",
      );

      const headerClassName =
        (typeof this.column.headerClassName === "function"
          ? this.column.headerClassName(this.column)
          : this.column.headerClassName) ?? "";
      if (headerClassName !== this._appliedHeaderClassName) {
        for (const cls of this._appliedHeaderClassName.split(" ")) {
          if (cls) this.classList.remove(cls);
        }
        for (const cls of headerClassName.split(" ")) {
          if (cls) this.classList.add(cls);
        }
        this._appliedHeaderClassName = headerClassName;
      }
    }
    if (changed.has("colIndex") || changed.has("colSpan")) {
      // Explicit start (1-based CSS grid line) + span — matches
      // md-data-grid-cell's own placement (see its willUpdate() for the full
      // rationale: a row whose cell for this column is entirely absent
      // from the DOM, not just empty, throws off auto-placement for
      // every following cell in that row). The header itself never omits
      // a cell this way, but placing it identically keeps header and body
      // columns aligned by the same explicit contract rather than one
      // relying on auto-placement and the other not.
      this.style.gridColumn = `${this.colIndex + 1} / span ${this.colSpan}`;
    }
  }

  /** @param {import("lit").PropertyValues} changed */
  updated(changed) {
    super.updated(changed);

    // Depends on dataGridContext (a subscription, not a declared reactive
    // property), so — same as md-data-grid-cell's own focused/highlighted —
    // this is recomputed unconditionally here rather than gated behind
    // willUpdate()'s changed-property check.
    const focused =
      this._gridConsumer.value?.focusedRegion === "columnHeader" &&
      this._gridConsumer.value?.focusedHeaderColIndex === this.colIndex;
    this.tabIndex = focused ? 0 : -1;
  }

  render() {
    const { column } = this;

    return html`
      <md-data-grid-column-title>
        ${
          column.renderHeader
            ? column.renderHeader(column)
            : (column.headerName ?? column.field)
        }
      </md-data-grid-column-title>
      ${
        this.sortable
          ? html`
              <md-icon
                class="data-grid-header-cell__sort-icon"
                part="sort-icon"
              >
                ${unsafeSVG(arrowUpward)}
              </md-icon>
            `
          : nothing
      }
      <md-data-grid-column-separator
        .resizeColIndex=${this.resizeColIndex}
        .resizable=${this.resizable}
      ></md-data-grid-column-separator>
    `;
  }
}
