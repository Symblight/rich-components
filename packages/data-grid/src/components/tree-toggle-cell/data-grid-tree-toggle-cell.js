import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { ContextConsumer } from "@lit/context";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { classMap } from "lit/directives/class-map.js";

import keyboardArrowRight from "@material-design-icons/svg/outlined/keyboard_arrow_right.svg?raw";

import "@symblight/wc-material/icon-button";
import "@symblight/wc-material/icon";

import { dataGridContext } from "../../base/data-grid-context.js";
import styles from "./data-grid-tree-toggle-cell.css?inline";

/**
 * @tag md-data-grid-tree-toggle-cell
 * @summary The per-row expand/collapse + indentation + label cell rendered
 * by `GRID_TREE_DATA_GROUPING_COL_DEF` when `md-data-grid`'s `treeData` is
 * on. Reads everything through `dataGridContext` by row id (`getRowDepth`,
 * `hasChildren`, `treeDataExpandedGroupIds`, `getGroupingKey`) — the id
 * itself resolved via `_id()` (the node's own `.key`, not `getRowId()` —
 * see that method's own doc comment for why: `row` is a tree node here,
 * and a synthetic auto-generated group has no real fields for `getRowId()`
 * to read at all). Renders no toggle icon at all (just indentation + label)
 * for a row with no children, matching `md-data-grid-detail-toggle-cell`'s
 * own "nothing to act on, no affordance" precedent. Composed internally —
 * not intended to be used standalone.
 */
@customElement("md-data-grid-tree-toggle-cell")
export class MdDataTreeToggleCell extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    row: { attribute: false },
    column: { attribute: false },
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

    /** @type {import("../../base/data-grid.js").DataGridColumn | undefined} */
    this.column = undefined;

    /** @type {number} */
    this.rowIndex = 0;

    /**
     * The `.key` of the row this cell was bound to as of the last update —
     * compared against the incoming row's `.key` in `willUpdate()` to tell
     * a genuine toggle (same row, `expanded` actually changed) apart from
     * this element getting rebound to a *different* row that happens to
     * have a different expand state. The latter happens constantly: the
     * row `repeat()` in `md-data-grid`'s `render()` is keyed by slot
     * position, not row identity (see its own doc comment), so collapsing
     * one group shifts every row below it into different slots and this
     * same cell instance/DOM node ends up representing a different row.
     * Without this check, `.data-grid-tree-toggle-cell__icon`'s CSS transition
     * animates that incidental state change as if the user had clicked
     * *this* row's toggle, producing a spurious rotate animation on a row
     * nobody interacted with.
     * @private @type {PropertyKey | undefined}
     */
    this._lastId = undefined;

    /** @private */
    this._skipIconTransition = false;

    /** @private */
    this._gridConsumer = new ContextConsumer(this, {
      context: dataGridContext,
      subscribe: true,
    });
  }

  /** @param {import("lit").PropertyValues} changed */
  willUpdate(changed) {
    super.willUpdate(changed);
    if (changed.has("row")) {
      const id = this._id();
      this._skipIconTransition = id !== this._lastId;
      this._lastId = id;
    }
  }

  /**
   * Row identity for this cell's own purposes — the tree node's own `.key`,
   * not `ctx.getRowId(row)`. `row` here is always a tree node (this cell is
   * only ever rendered when `treeData` is on): a real row's node has its
   * real fields merged on, so `.key` and `getRowId(row)` agree; a synthetic
   * auto-generated group has no real fields at all, so `getRowId(row)`
   * would call the consumer's function on an object it was never meant to
   * see. Using `.key` uniformly is correct for both, never just the
   * synthetic case.
   * @private
   * @returns {PropertyKey}
   */
  _id() {
    return /** @type {PropertyKey} */ (
      /** @type {{ key: PropertyKey }} */ (this.row).key
    );
  }

  /**
   * Stops the click from also reaching the row's own `@click` handler (it
   * bubbles there otherwise) — expanding/collapsing a group shouldn't also
   * select it, same reasoning as `md-data-grid-detail-toggle-cell`'s own
   * click handler.
   * @param {MouseEvent} event
   */
  _onToggleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const ctx = this._gridConsumer.value;
    if (!ctx) return;
    ctx.toggleTreeDataGroup(this._id());
  }

  /**
   * The displayed label: `column.valueGetter` when given (same escape
   * hatch every other column already has), otherwise the raw path segment
   * this node was built from — works for a real row or a synthetic group
   * alike, since `TreeController` stamps `groupingKey` on both.
   * @private
   * @param {import("../../base/data-grid-context.js").DataGridContextValue} ctx
   * @param {PropertyKey} id
   * @returns {unknown}
   */
  _label(ctx, id) {
    if (this.column?.valueGetter) {
      return this.column.valueGetter({
        row: this.row,
        column: this.column,
        rowIndex: this.rowIndex,
        value: undefined,
      });
    }
    return ctx.getGroupingKey(id) ?? "";
  }

  /**
   * Indentation is set imperatively (mirrors `md-data-grid-cell` setting
   * `style.gridColumn`/`style.height` the same way) rather than templated —
   * depth comes from a context lookup, not a declared reactive property, so
   * there's no `changed` map entry to gate on; recomputing unconditionally
   * on every update is cheap and idempotent.
   * @param {import("lit").PropertyValues} changed
   */
  updated(changed) {
    super.updated(changed);
    const ctx = this._gridConsumer.value;
    const depth = ctx ? ctx.getRowDepth(this._id()) : 0;
    this.style.paddingInlineStart = `calc(var(--md-data-grid-tree-indent, 20px) * ${depth})`;
    // Consumed for this render already (read by render() below to decide
    // whether to suppress the icon's rotate transition) — clear it so a
    // later update caused by an actual toggle on this same row (no row-id
    // change) animates normally again.
    this._skipIconTransition = false;
  }

  render() {
    const ctx = this._gridConsumer.value;
    if (!ctx) return nothing;

    const id = this._id();
    const expandable = ctx.hasChildren(id);
    const expanded = expandable && ctx.treeDataExpandedGroupIds.has(id);

    return html`
      ${
        expandable
          ? html`
              <md-icon-button
                class="data-grid-tree-toggle-cell__button"
                aria-label=${expanded ? "Collapse group" : "Expand group"}
                aria-expanded=${expanded}
                @click=${this._onToggleClick}
              >
                <md-icon
                  class=${classMap({
                    "data-grid-tree-toggle-cell__icon": true,
                    "data-grid-tree-toggle-cell__icon_expanded": expanded,
                    "data-grid-tree-toggle-cell__icon_no-transition":
                      this._skipIconTransition,
                  })}
                >
                  ${unsafeSVG(keyboardArrowRight)}
                </md-icon>
              </md-icon-button>
            `
          : html`<span class="data-grid-tree-toggle-cell__spacer"></span>`
      }
      <span class="data-grid-tree-toggle-cell__label"
        >${this._label(ctx, id)}</span
      >
    `;
  }
}
