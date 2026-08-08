import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { ContextConsumer } from "@lit/context";

import "@symblight/wc-material/checkbox";

import { dataGridContext } from "../../base/data-grid-context.js";
import styles from "./data-grid-checkbox-header.css?inline";

/**
 * @tag md-data-grid-checkbox-header
 * @summary The header "select all" checkbox rendered by
 * `GRID_CHECKBOX_SELECTION_COL_DEF` when `md-data-grid`'s
 * `checkboxSelection` is on. Selects/clears every row in the whole
 * dataset (`ctx.rows` — `host.rows`, or under `treeData` every tree node,
 * real and synthetic alike; see `buildDataGridContext`), not just the
 * current page — matching MUI's own default. Renders nothing when
 * `disableMultipleRowSelection` is set — a "select all" affordance doesn't
 * make sense when only one row can ever be selected. Composed internally —
 * not intended to be used standalone.
 */
@customElement("md-data-grid-checkbox-header")
export class MdDataGridCheckboxHeader extends LitElement {
  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  constructor() {
    super();

    /** @private */
    this._gridConsumer = new ContextConsumer(this, {
      context: dataGridContext,
      subscribe: true,
    });
  }

  /** @param {MouseEvent} event */
  _onClick(event) {
    event.preventDefault();
    event.stopPropagation();
    this._gridConsumer.value?.toggleSelectAll();
  }

  render() {
    const ctx = this._gridConsumer.value;
    if (!ctx || ctx.disableMultipleRowSelection) return nothing;

    // Under treeData, ctx.rows is tree nodes (real rows *and* synthetic
    // groups) — a synthetic node has no real fields, so getRowId(row) can't
    // be called on it safely; its identity is its own tree-node .key
    // instead, which TreeController already set to getRowId(row) for a
    // real row anyway, so this is correct for both cases uniformly.
    const ids = ctx.treeData
      ? ctx.rows.map((row) => /** @type {{ key: PropertyKey }} */ (row).key)
      : ctx.rows.map((row) => ctx.getRowId(row));
    const selectedCount = ids.filter((id) =>
      ctx.rowSelectionModel.has(id),
    ).length;
    const allSelected = ids.length > 0 && selectedCount === ids.length;
    const indeterminate = selectedCount > 0 && !allSelected;

    return html`
      <md-checkbox
        .checked=${allSelected}
        .indeterminate=${indeterminate}
        aria-label="Select all rows"
        @click=${this._onClick}
      ></md-checkbox>
    `;
  }
}
