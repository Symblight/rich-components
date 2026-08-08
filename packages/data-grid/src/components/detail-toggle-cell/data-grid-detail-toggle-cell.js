import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { ContextConsumer } from "@lit/context";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { classMap } from "lit/directives/class-map.js";

import keyboardArrowRight from "@material-design-icons/svg/outlined/keyboard_arrow_right.svg?raw";

import "@symblight/wc-material/icon-button";
import "@symblight/wc-material/icon";

import { dataGridContext } from "../../base/data-grid-context.js";
import styles from "./data-grid-detail-toggle-cell.css?inline";

/**
 * @tag md-data-grid-detail-toggle-cell
 * @summary The per-row expand/collapse toggle rendered by
 * `GRID_DETAIL_PANEL_TOGGLE_COL_DEF` when `md-data-grid`'s
 * `getDetailPanelContent` is set. Reads/writes `detailPanelExpandedRowIds`
 * through `dataGridContext` — reused as-is by `md-data-grid-cell`'s generic
 * `renderCell` mechanism, same as `md-data-grid-checkbox-cell`. Renders
 * nothing at all for a row `ctx.hasDetailPanelContent()` says has no detail
 * content — there's nothing to toggle, so no affordance for it either,
 * matching MUI. Composed internally — not intended to be used standalone.
 */
@customElement("md-data-grid-detail-toggle-cell")
export class MdDataDetailToggleCell extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    row: { attribute: false },
    rowIndex: { type: Number },
  };

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  constructor() {
    super();

    /** @type {Record<string, unknown>} */
    this.row = {};

    /** @type {number} */
    this.rowIndex = 0;

    /** @private */
    this._gridConsumer = new ContextConsumer(this, {
      context: dataGridContext,
      subscribe: true,
    });
  }

  /**
   * Stops the click from also reaching the row's own `@click` handler (it
   * bubbles there otherwise) — expanding/collapsing a row's detail panel
   * shouldn't also select it, same reasoning as the checkbox cell's own
   * click handler.
   * @param {MouseEvent} event
   */
  _onClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const ctx = this._gridConsumer.value;
    if (!ctx) return;
    ctx.toggleDetailPanel(ctx.getRowId(this.row));
  }

  render() {
    const ctx = this._gridConsumer.value;
    if (!ctx || !ctx.hasDetailPanelContent(this.row, this.rowIndex)) {
      return nothing;
    }
    const expanded = ctx.detailPanelExpandedRowIds.has(ctx.getRowId(this.row));

    return html`
      <md-icon-button
        aria-label=${expanded ? "Hide details for row" : "Show details for row"}
        aria-expanded=${expanded}
        @click=${this._onClick}
      >
        <md-icon
          class=${classMap({
            "data-grid-detail-toggle-cell__icon": true,
            "data-grid-detail-toggle-cell__icon_expanded": expanded,
          })}
        >
          ${unsafeSVG(keyboardArrowRight)}
        </md-icon>
      </md-icon-button>
    `;
  }
}
