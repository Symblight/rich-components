/**
 * Owns MUI-style row selection for `md-data-grid` — highlighted rows, not
 * checkboxes. Single-row selection is on by default (plain click replaces
 * the selection with just that row); Ctrl/Cmd-click toggles a row into/out
 * of the selection additively; Shift-click extends/shrinks the selection
 * relative to the last-clicked row (the "anchor") — see `_shiftRange()` for
 * the merge-vs-replace distinction that matters there. Both multi-selection
 * mechanisms are opt-out via `host.disableMultipleRowSelection` (a modified
 * click then behaves like a plain click); selecting on click at all is
 * opt-out via `host.disableRowSelectionOnClick`, for rows with their own
 * interactive cell content.
 */
export class RowSelectionController {
  /**
   * `getDataPath` isn't part of `MdDataGrid` itself (it's
   * `MdDataGridTree`-only, see `data-grid-tree.js`) — declared here as an
   * optional intersection rather than widening the import, since this
   * controller is shared by both and only ever reads it defensively
   * (see `_rowId()` below).
   * @param {import("../base/data-grid.js").MdDataGrid & {
   *   getDataPath?: (row: Record<string, unknown>) => PropertyKey[] | undefined,
   * }} host
   */
  constructor(host) {
    this.host = host;

    /** @private @type {number | null} row index shift-range is measured from */
    this._anchorIndex = null;
  }

  /**
   * Clears the shift-range anchor — call whenever row order can change
   * (sorting, a new `rows` array) so a later shift-click can't silently
   * range-select against a position that now means something else.
   */
  resetAnchor() {
    this._anchorIndex = null;
  }

  /**
   * @param {Record<string, unknown>} row
   * @returns {boolean}
   */
  isSelected(row) {
    return this.host.rowSelectionModel.has(this._rowId(row));
  }

  /**
   * Row identity for selection purposes — `host.getRowId(row)` normally,
   * but under `MdDataGridTree` with `getDataPath` set the rendered `row` is
   * a tree node (real fields merged on for a real row, or nothing at all
   * for a synthetic auto-generated group), so identity comes from the
   * node's own `.key` instead: `TreeController` already resolved that to
   * `getRowId(row)` for a real row and a deterministic synthetic id
   * otherwise, so this is simply correct for a real row too, not just a
   * synthetic one — never calls the consumer's `getRowId` on an object it
   * was never meant to see.
   * @private
   * @param {Record<string, unknown>} row
   * @returns {PropertyKey}
   */
  _rowId(row) {
    const host = this.host;
    return host.getDataPath
      ? /** @type {PropertyKey} */ (
          /** @type {{ key: PropertyKey }} */ (row).key
        )
      : host.getRowId(row);
  }

  /**
   * Applies a row click to the selection per the modifier keys held, sets
   * `host.rowSelectionModel` to the result, and dispatches
   * `md-data-grid-row-selection-model-change`.
   * @param {Record<string, unknown>} row
   * @param {number} rowIndex
   * @param {{ shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean }} modifiers
   * @param {Record<string, unknown>[]} rows the exact rows about to render (post-sort, post-pagination) — shift-range is measured over this order
   */
  select(row, rowIndex, modifiers, rows) {
    const host = this.host;
    const id = this._rowId(row);
    const multiEnabled = !host.disableMultipleRowSelection;

    /** @type {Set<PropertyKey> | null} */
    let next;
    if (modifiers.shiftKey && multiEnabled && this._anchorIndex !== null) {
      next = this._shiftRange(rowIndex, rows);
      if (!next) return; // no-op — see _shiftRange()
    } else if ((modifiers.ctrlKey || modifiers.metaKey) && multiEnabled) {
      next = new Set(host.rowSelectionModel);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      this._anchorIndex = rowIndex;
    } else {
      next = new Set([id]);
      this._anchorIndex = rowIndex;
    }

    this._apply(next);
  }

  /**
   * Shift-click's range, merged into the existing selection rather than
   * replacing it — matching MUI, which only ever adds/removes the ids in
   * the computed range against a copy of the current selection, never
   * rebuilds the model from scratch. A replace-based version would silently
   * drop anything selected outside the anchor-to-clicked span (an earlier
   * Ctrl-click, or a previous unrelated shift gesture).
   *
   * Two modes, chosen by whether the just-clicked row is already selected:
   * - **Not selected (growing)**: adds every row between the anchor and
   *   the clicked row (inclusive) to the selection.
   * - **Already selected (shrinking)**: removes rows between the anchor
   *   and one row *short* of the clicked row — deliberately excluding the
   *   clicked row itself from the removal, so shift-clicking an
   *   already-selected row never deselects that exact row, only backs the
   *   range off beyond it. Shift-clicking the anchor row itself (nothing
   *   left to back off) is therefore a no-op — signaled by returning
   *   `null` — matching MUI's own early return in this case.
   *
   * The anchor advances to the clicked row after every shift-click (not
   * just plain/Ctrl clicks), so a following shift-click extends/shrinks
   * relative to *this* click, not the original one — also matching MUI.
   * @private
   * @param {number} clickedIndex
   * @param {Record<string, unknown>[]} rows the exact rows about to render — shift-range is measured over this order
   * @returns {Set<PropertyKey> | null} `null` means no-op, nothing to apply
   */
  _shiftRange(clickedIndex, rows) {
    const host = this.host;
    const anchorIndex = /** @type {number} */ (this._anchorIndex);
    const clickedId = this._rowId(rows[clickedIndex]);
    const growing = !host.rowSelectionModel.has(clickedId);

    if (!growing && anchorIndex === clickedIndex) return null;

    const endIndex = growing
      ? clickedIndex
      : anchorIndex > clickedIndex
        ? clickedIndex + 1
        : clickedIndex - 1;
    const [start, end] =
      anchorIndex < endIndex
        ? [anchorIndex, endIndex]
        : [endIndex, anchorIndex];

    const next = new Set(host.rowSelectionModel);
    for (let i = start; i <= end; i++) {
      const rangeId = this._rowId(rows[i]);
      if (growing) next.add(rangeId);
      else next.delete(rangeId);
    }

    this._anchorIndex = clickedIndex;
    return next;
  }

  /**
   * Header checkbox "select all": if every row in `rows` is already
   * selected, clears the selection entirely; otherwise selects all of
   * them, replacing the current selection wholesale (rows outside `rows`
   * that were previously selected are dropped, same as MUI). `rows` is
   * meant to be the grid's whole dataset (`host.rows`), not just the
   * current page — matching MUI's own default, "select all" spans every
   * page, not only the one currently visible.
   * @param {Record<string, unknown>[]} rows
   */
  toggleAll(rows) {
    this.toggleAllIds(rows.map((row) => this.host.getRowId(row)));
  }

  /**
   * Id-based counterpart to `toggleAll()` — for callers that already have
   * ids rather than row objects (treeData's "select all" spans real rows
   * *and* synthetic group nodes, which have no row to run through
   * `getRowId()`). Same wholesale-replace semantics.
   * @param {PropertyKey[]} ids
   */
  toggleAllIds(ids) {
    const host = this.host;
    const allSelected =
      ids.length > 0 && ids.every((id) => host.rowSelectionModel.has(id));
    const next = allSelected ? new Set() : new Set(ids);
    this._apply(next);
  }

  /**
   * Replaces `rowSelectionModel` with an already-fully-computed `Set`,
   * verbatim — no toggle/diff logic of its own, unlike `toggleAllIds()`
   * above. For callers that need to compute the exact final membership
   * themselves before applying it in one atomic update — treeData's
   * cascade-down-then-propagate-up selection
   * (`TreeController.computeCascadingSelection()`, called from
   * `data-grid.js`, the one place allowed to know about both that
   * controller and this one) is the one caller today.
   * @param {Set<PropertyKey>} next
   */
  applyIds(next) {
    this._apply(new Set(next));
  }

  /**
   * @private
   * @param {Set<PropertyKey>} next
   */
  _apply(next) {
    const host = this.host;
    host.rowSelectionModel = next;
    host.dispatchEvent(
      new CustomEvent("md-data-grid-row-selection-model-change", {
        detail: new Set(next),
        bubbles: true,
        composed: true,
      }),
    );
  }
}
