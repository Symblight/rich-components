/**
 * One entry of `buildRenderItems()`'s output — either a real data row
 * (rendered exactly as before this feature existed) or a synthetic,
 * full-width "detail" row injected right after an expanded row that has
 * content. `rowIndex` on a `"detail"` item is its *owning* row's index, not
 * a row index of its own — a detail item is never a target for
 * selection/keyboard-nav/row-span, all of which stay entirely unaware this
 * kind of item exists (see the controller-level doc comment below for why).
 * @typedef {{ kind: "row", row: Record<string, unknown>, rowIndex: number }} DetailPanelRowItem
 * @typedef {{ kind: "detail", row: Record<string, unknown>, rowIndex: number, content: unknown }} DetailPanelDetailItem
 * @typedef {DetailPanelRowItem | DetailPanelDetailItem} DetailPanelRenderItem
 */

/**
 * The subset of `md-data-grid` a `DetailPanelController` actually needs —
 * not the full element, just what owning expand state and building the
 * render-items list requires (mirrors `TreeControllerHost`).
 * @typedef {EventTarget & {
 *   getRowId: (row: Record<string, unknown>) => PropertyKey,
 *   getDetailPanelContent?: (params: { row: Record<string, unknown>, rowIndex: number }) => unknown,
 *   detailPanelExpandedRowIds: Set<PropertyKey>,
 * }} DetailPanelControllerHost
 */

/**
 * Owns master-detail expand/collapse state for `md-data-grid` —
 * `detailPanelExpandedRowIds`, mutated the same `_apply()`-then-dispatch
 * shape `RowSelectionController` uses for `rowSelectionModel` — plus
 * `buildRenderItems()`, which is the one place a data row's index and its
 * position in the rendered/virtualized list are allowed to diverge.
 *
 * Every other controller (`RowSelectionController`, `RowSpanController`,
 * `KeyboardNavController`, `FocusController`) keeps operating on plain data
 * `rowIndex` — position in `effectiveRows`, completely unaware detail rows
 * exist — by design: a detail row has no columns, so letting it participate
 * in cell-index arithmetic would break arrow-key nav, shift-range selection,
 * and row-span run detection for no benefit. Only virtualization (which has
 * to actually lay out and scroll to *rendered* items, detail rows included)
 * needs the expanded list `buildRenderItems()` produces, and only
 * `scrollToRow()`/`ensureRowVisible()` need the `rowIndexToVirtualIndex` map
 * that comes with it, to translate a data `rowIndex` into a scroll target
 * once anything above it may have shifted everything below.
 */
export class DetailPanelController {
  /** @param {DetailPanelControllerHost} host */
  constructor(host) {
    this.host = host;
  }

  /**
   * @param {Record<string, unknown>} row
   * @param {number} rowIndex
   * @returns {unknown} whatever `host.getDetailPanelContent` returns — a
   *   Lit `TemplateResult`, a string, or `undefined`/`null` when this row
   *   has nothing to show. `undefined` when `getDetailPanelContent` itself
   *   is unset (master-detail not in use at all).
   */
  getContent(row, rowIndex) {
    return this.host.getDetailPanelContent?.({ row, rowIndex });
  }

  /**
   * Whether `row` should get a toggle icon at all — read by
   * `md-data-grid-detail-toggle-cell` for every rendered row, expanded or not.
   * @param {Record<string, unknown>} row
   * @param {number} rowIndex
   * @returns {boolean}
   */
  hasContent(row, rowIndex) {
    return this.getContent(row, rowIndex) != null;
  }

  /** @param {PropertyKey} id */
  isExpanded(id) {
    return this.host.detailPanelExpandedRowIds.has(id);
  }

  /** @param {PropertyKey} id */
  toggle(id) {
    const next = new Set(this.host.detailPanelExpandedRowIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this._apply(next);
  }

  /** @param {Set<PropertyKey>} ids */
  setExpanded(ids) {
    this._apply(new Set(ids));
  }

  /**
   * @private
   * @param {Set<PropertyKey>} next
   */
  _apply(next) {
    this.host.detailPanelExpandedRowIds = next;
    this.host.dispatchEvent(
      new CustomEvent("md-data-grid-detail-panel-expanded-row-ids-change", {
        detail: new Set(next),
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Expands `rows` (the exact post-sort, post-pagination list about to
   * render — same contract as `RowSpanController.computeSpans()`) into the
   * flat list virtualization actually renders: every data row, plus one
   * `"detail"` item right after each expanded row that has content — rows
   * expanded but with no content (or expanded before `getDetailPanelContent`
   * was ever set) contribute nothing extra, same as MUI. Content is computed
   * here, once, and carried on the item rather than recomputed at render
   * time — `getContent()` isn't called a second time for the same row.
   *
   * `rowIndexToVirtualIndex[rowIndex]` gives that data row's position in
   * `items` — built in the same pass so callers needing both (`data-grid.js`
   * `render()`) don't pay for two separate walks over `rows`.
   * @param {Record<string, unknown>[]} rows
   * @returns {{ items: DetailPanelRenderItem[], rowIndexToVirtualIndex: number[] }}
   */
  buildRenderItems(rows) {
    /** @type {DetailPanelRenderItem[]} */
    const items = [];
    /** @type {number[]} */
    const rowIndexToVirtualIndex = new Array(rows.length);

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      rowIndexToVirtualIndex[rowIndex] = items.length;
      items.push({ kind: "row", row, rowIndex });

      if (!this.host.getDetailPanelContent) continue;
      if (!this.isExpanded(this.host.getRowId(row))) continue;
      const content = this.getContent(row, rowIndex);
      if (content == null) continue;
      items.push({ kind: "detail", row, rowIndex, content });
    }

    return { items, rowIndexToVirtualIndex };
  }
}
