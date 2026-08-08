import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { ContextConsumer } from "@lit/context";

import "@symblight/wc-material/checkbox";

import { dataGridContext } from "../../base/data-grid-context.js";
import styles from "./data-grid-checkbox-cell.css?inline";

/**
 * @tag md-data-grid-checkbox-cell
 * @summary The per-row checkbox rendered by `GRID_CHECKBOX_SELECTION_COL_DEF`
 * when `md-data-grid`'s `checkboxSelection` is on. Reads/writes selection
 * through `dataGridContext` — reused as-is by `md-data-grid-cell`'s generic
 * `renderCell` mechanism, so this is just an ordinary custom column, not a
 * special case baked into the grid itself. `md-checkbox`'s own default
 * touch-target padding (`0.688rem` on every side, on top of its `1.125rem`
 * visual box) is trimmed down via an inline style — it isn't exposed as a
 * `--md-checkbox-*` custom property, and left as-is it doesn't fit inside
 * `GRID_CHECKBOX_SELECTION_COL_DEF`'s narrow column.
 *
 * Under `treeData`, a group row (a synthetic auto-generated group, or a
 * real row that's also an ancestor — `ctx.hasChildren(id)` catches both
 * uniformly) shows cascading checked/indeterminate state
 * (`ctx.getTreeDataCheckboxState`) and its click cascades to the whole
 * subtree (`ctx.toggleTreeDataGroupSelection` — not to be confused with
 * `ctx.toggleTreeDataGroup`, which expands/collapses a group instead)
 * rather than the normal single-row toggle. Composed internally — not
 * intended to be used standalone.
 */
@customElement("md-data-grid-checkbox-cell")
export class MdDataGridCheckboxCell extends LitElement {
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
   * Row identity for the checkbox column's own purposes — `ctx.getRowId`
   * normally, but under `treeData` the rendered `row` is a tree node
   * (real fields merged on for a real row, nothing at all for a synthetic
   * group), so identity comes from the node's own `.key` instead. Correct
   * for a real row too, not just a synthetic one, since `TreeController`
   * already resolved a real row's `.key` to `getRowId(row)`.
   * @private
   * @param {import("../../base/data-grid-context.js").DataGridContextValue} ctx
   * @returns {PropertyKey}
   */
  _id(ctx) {
    return ctx.treeData
      ? /** @type {PropertyKey} */ (
          /** @type {{ key: PropertyKey }} */ (this.row).key
        )
      : ctx.getRowId(this.row);
  }

  /**
   * A checkbox click on an ordinary row always toggles just that row
   * into/out of the selection additively (like Ctrl/Cmd-click), never
   * replaces the whole selection with just this row the way a plain row
   * click does — checking one box while others are already checked
   * shouldn't uncheck them. Shift-click still range-selects, matching the
   * row-click behavior it shares its underlying `select()` call with.
   *
   * A click on a *group* row (`ctx.hasChildren(id)` — a synthetic group,
   * or a real row that's also an ancestor) cascades to the whole subtree
   * (and propagates upward to ancestors) instead, via
   * `ctx.toggleTreeDataGroupSelection` — ignoring shift/ctrl, which have no
   * defined meaning for a cascading toggle yet (see
   * `MdDataGrid._selectTreeDataGroup()`'s own doc comment).
   *
   * Stops the click from also reaching the row's own `@click` handler (it
   * bubbles there otherwise) and prevents the checkbox's own native
   * toggle — `checked`/`indeterminate` are fully derived from
   * `rowSelectionModel` on the next render, not owned by the checkbox
   * itself.
   * @param {MouseEvent} event
   */
  _onClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const ctx = this._gridConsumer.value;
    if (!ctx) return;

    const id = this._id(ctx);
    if (ctx.treeData && ctx.hasChildren(id)) {
      ctx.toggleTreeDataGroupSelection(id);
      return;
    }
    ctx.toggleRowSelection(this.row, this.rowIndex, {
      shiftKey: event.shiftKey,
      ctrlKey: true,
      metaKey: true,
    });
  }

  render() {
    const ctx = this._gridConsumer.value;
    if (!ctx) {
      return html`
        <md-checkbox
          aria-label="Select row"
          @click=${this._onClick}
        ></md-checkbox>
      `;
    }

    const id = this._id(ctx);
    const { checked, indeterminate } =
      ctx.treeData && ctx.hasChildren(id)
        ? ctx.getTreeDataCheckboxState(id)
        : { checked: ctx.rowSelectionModel.has(id), indeterminate: false };

    return html`
      <md-checkbox
        .checked=${checked}
        .indeterminate=${indeterminate}
        aria-label="Select row"
        @click=${this._onClick}
      ></md-checkbox>
    `;
  }
}
