import { findIndexTree } from "../core/index-tree.js";

/**
 * Owns the selected-key set. Single mode tracks exactly one key (aria-current). Multi mode is a
 * `Set<PropertyKey>` with MUI-style row selection for a plain click/Ctrl/Shift — mirroring
 * `RowSelectionController` in `@symblight/data-grid`: a plain click replaces the selection with
 * just that item, Ctrl/Cmd+click toggles one item into/out of the selection additively, and
 * Shift+click (or Shift+ArrowUp/Down) extends/shrinks the selection relative to the last-clicked
 * item (the "anchor") — see `#shiftRange()` for the merge-vs-replace distinction that matters
 * there. `checkboxSelection` on a branch item is the one path that isn't flat — see
 * `computeCascadingSelection()`/`selectCascading()`, mirroring `TreeController` in `data-grid`'s
 * `treeData` mode.
 */
export class SelectionController {
  /** @type {PropertyKey | null} item shift-range is measured from */
  #anchor = null;

  /** @param {import("../base/tree-view.js").TvxTreeView} host */
  constructor(host) {
    this.host = host;
    /** @type {Set<PropertyKey>} */
    this.selected = new Set();
  }

  /** @param {PropertyKey} key */
  isSelected(key) {
    return this.selected.has(key);
  }

  /** Clears the shift-range anchor. Not required for correctness — the anchor is looked up live
   * by key in current visible order on every shift-click, so it can't go stale — but available for
   * parity with `RowSelectionController.resetAnchor()` should a caller want to force a fresh start. */
  resetAnchor() {
    this.#anchor = null;
  }

  /** Row activation (click or Enter/Space). `modifiers` are ignored outside multi-select.
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item
   * @param {{ ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean }} [modifiers] */
  activate(item, { ctrlKey = false, metaKey = false, shiftKey = false } = {}) {
    if (item.disabled || this.host.disableSelection) return;
    if (!this.host.multiSelect) return this.#applySingle(item, true);

    /** @type {Set<PropertyKey> | null} */
    let next;
    if (shiftKey && this.#anchor !== null) {
      next = this.#shiftRange(item);
      if (!next) return; // no-op — see #shiftRange()
    } else if (ctrlKey || metaKey) {
      next = new Set(this.selected);
      if (next.has(item.key)) next.delete(item.key);
      else next.add(item.key);
      this.#anchor = item.key;
    } else {
      next = new Set([item.key]);
      this.#anchor = item.key;
    }
    this.#commit(next);
  }

  /**
   * Shift-click's range, merged into the existing selection rather than replacing it — matching
   * MUI (and `RowSelectionController._shiftRange()`), which only ever adds/removes the keys in the
   * computed range against a copy of the current selection, never rebuilds the set from scratch. A
   * replace-based version would silently drop anything selected outside the anchor-to-clicked span
   * (an earlier Ctrl-click, or a previous unrelated shift gesture).
   *
   * Two modes, chosen by whether the just-clicked item is already selected:
   * - **Not selected (growing)**: adds every visible item between the anchor and the clicked item
   *   (inclusive) to the selection.
   * - **Already selected (shrinking)**: removes items between the anchor and one item *short* of
   *   the clicked item — deliberately excluding the clicked item itself from the removal, so
   *   shift-clicking an already-selected item never deselects that exact item, only backs the
   *   range off beyond it. Shift-clicking the anchor item itself (nothing left to back off) is
   *   therefore a no-op — signaled by returning `null`.
   *
   * The anchor advances to the clicked item after every shift-click (not just plain/Ctrl clicks),
   * so a following shift-click extends/shrinks relative to *this* click, not the original one —
   * also matching MUI. Disabled items are skipped on both sides (never added, and never need
   * removing since `activate()` never lets them into the selection in the first place).
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} targetItem
   * @returns {Set<PropertyKey> | null} `null` means no-op, nothing to apply */
  #shiftRange(targetItem) {
    const order = [...this.host.visibleItems()];
    const anchorIndex = order.findIndex((candidate) => candidate.key === this.#anchor);
    const targetIndex = order.indexOf(targetItem);
    if (anchorIndex === -1 || targetIndex === -1) return null;

    const growing = !this.selected.has(targetItem.key);
    if (!growing && anchorIndex === targetIndex) return null;

    const endIndex = growing
      ? targetIndex
      : anchorIndex > targetIndex
        ? targetIndex + 1
        : targetIndex - 1;
    const [start, end] =
      anchorIndex < endIndex ? [anchorIndex, endIndex] : [endIndex, anchorIndex];

    const next = new Set(this.selected);
    for (let i = start; i <= end; i++) {
      const candidate = order[i];
      if (candidate.disabled) continue;
      if (growing) next.add(candidate.key);
      else next.delete(candidate.key);
    }
    this.#anchor = targetItem.key;
    return next;
  }

  /** Explicit set/unset for a single item — shared by the public `setItemSelection()` API and a
   * checkbox click. In multi mode this only touches `item` itself (no cascade); in single mode it
   * selects (or, if already selected, deselects) exactly that item.
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item
   * @param {boolean} selected */
  setSelected(item, selected) {
    if (item.disabled || this.host.disableSelection) return;
    if (!this.host.multiSelect) return this.#applySingle(item, selected);
    const next = new Set(this.selected);
    if (selected) next.add(item.key);
    else next.delete(item.key);
    this.#anchor = item.key;
    this.#commit(next);
  }

  /** @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item @param {boolean} selected */
  #applySingle(item, selected) {
    if (selected) this.selected = new Set([item.key]);
    else if (this.selected.has(item.key)) this.selected = new Set();
    else return; // already not selected — nothing changed
    this.#anchor = item.key;
    this.#apply();
    this.#notify();
  }

  /** @param {Set<PropertyKey>} next
   * @param {import("../core/index-tree.js").IndexTree<unknown>} [indexTree] Reused by `#apply()`
   * when the caller already built one (e.g. `selectCascading()`), instead of rebuilding it. */
  #commit(next, indexTree) {
    this.selected = next;
    this.#apply(indexTree);
    this.#notify();
  }

  /**
   * Full next `selected` Set for a checkbox click on branch `key` — cascades down (the whole
   * subtree is added/removed together, same all-selected? shrink : grow decision `toggleAllIds()`
   * in `data-grid`'s `RowSelectionController` uses for its own wholesale replace, applied here to
   * just this one subtree) and up (from `key`'s parent to the root, each ancestor's own key joins
   * the selection once every one of its direct children is selected, and leaves it otherwise) —
   * mirrors `TreeController.computeCascadingSelection()` in `data-grid`. Pure — returns a new Set,
   * never mutates `this.selected`.
   * @param {PropertyKey} key
   * @param {import("../core/index-tree.js").IndexTree<unknown>} indexTree
   * @returns {Set<PropertyKey>}
   */
  computeCascadingSelection(key, indexTree) {
    const node = findIndexTree(indexTree, key);
    if (!node) return new Set(this.selected);

    const next = new Set(this.selected);
    this.#toggleSubtree(node, next);
    this.#cascadeAncestors(node, next);
    return next;
  }

  /** Adds/removes every id in `node`'s subtree (itself included) together — all-selected? shrink : grow.
   * @param {import("../core/index-tree.js").IndexTree<unknown>} node
   * @param {Set<PropertyKey>} next mutated in place */
  #toggleSubtree(node, next) {
    const ids = [...node].map((n) => /** @type {PropertyKey} */ (n.key));
    const allSelected = ids.length > 0 && ids.every((id) => this.selected.has(id));
    for (const id of ids) {
      if (allSelected) next.delete(id);
      else next.add(id);
    }
  }

  /** From `node`'s parent up to (not including) the synthetic root, adds an ancestor once every one
   * of its direct children is in `next`, removes it otherwise.
   * @param {import("../core/index-tree.js").IndexTree<unknown>} node
   * @param {Set<PropertyKey>} next mutated in place */
  #cascadeAncestors(node, next) {
    let ancestor = node.parent;
    while (ancestor && ancestor.parent) {
      const childKeys = [...ancestor.children.values()].map(
        (child) => /** @type {PropertyKey} */ (child.key),
      );
      const allChildrenSelected = childKeys.length > 0 && childKeys.every((k) => next.has(k));
      const ancestorKey = /** @type {PropertyKey} */ (ancestor.key);
      if (allChildrenSelected) next.add(ancestorKey);
      else next.delete(ancestorKey);
      ancestor = ancestor.parent;
    }
  }

  /** Checkbox-driven cascading select/deselect for a branch item — the checkbox-click counterpart
   * to `setSelected()`, which stays flat (single item, no cascade) for a leaf.
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item
   * @param {import("../core/index-tree.js").IndexTree<unknown>} indexTree */
  selectCascading(item, indexTree) {
    if (item.disabled || this.host.disableSelection) return;
    this.#commit(this.computeCascadingSelection(item.key, indexTree), indexTree);
  }

  /** Reflects `this.selected` onto every live item's `.selected`/`.indeterminate`/`aria-current`.
   * Under `checkboxSelection`, a branch's `.selected`/`.indeterminate` are derived fresh from its
   * subtree every render (not read straight off `this.selected`'s own membership) — mirrors
   * `TreeController.getCheckboxState()` in `data-grid`, so checking every descendant individually
   * (never the branch's own checkbox) still shows that branch as checked, not stuck indeterminate.
   * @param {import("../core/index-tree.js").IndexTree<unknown>} [indexTree] */
  #apply(indexTree) {
    const states = this.host.checkboxSelection
      ? this.#computeCheckboxStates(indexTree ?? this.host.buildIndexTree())
      : null;
    for (const item of this.host.allItems()) {
      if (states && item.hasChildren) {
        const state = states.get(item.key);
        item.selected = !!state?.checked;
        item.indeterminate = !!state?.indeterminate;
      } else {
        item.selected = this.selected.has(item.key);
        item.indeterminate = false;
      }
      if (!this.host.multiSelect && item.selected) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
    }
  }

  /** One bottom-up pass over `indexTree`, computing every branch's `{ checked, indeterminate }`
   * against `this.selected` in one O(n) walk — `checked` when every id in its subtree (itself
   * included) is a member, `indeterminate` when only some are.
   * @param {import("../core/index-tree.js").IndexTree<unknown>} indexTree
   * @returns {Map<PropertyKey, { checked: boolean, indeterminate: boolean }>} */
  #computeCheckboxStates(indexTree) {
    const states = new Map();
    /** @param {import("../core/index-tree.js").IndexTree<unknown>} node
     * @returns {{ total: number, selected: number }} */
    const walk = (node) => {
      let total = node.key !== null ? 1 : 0;
      let selectedCount = node.key !== null && this.selected.has(node.key) ? 1 : 0;
      for (const [, child] of node.children) {
        const counts = walk(child);
        total += counts.total;
        selectedCount += counts.selected;
      }
      if (node.key !== null) {
        states.set(node.key, {
          checked: total > 0 && selectedCount === total,
          indeterminate: selectedCount > 0 && selectedCount < total,
        });
      }
      return { total, selected: selectedCount };
    };
    walk(indexTree);
    return states;
  }

  /** Re-applies selected state after the tree shape changes (e.g. a reorder) — the selected-key
   * set itself doesn't depend on tree structure, so this just re-syncs the (possibly moved) DOM
   * nodes' `.selected`/`aria-current`. */
  refresh() {
    this.#apply();
  }

  /** Replaces the selected set from an external `selectedItems` write (uncontrolled-with-sync, like `items`).
   * @param {Iterable<PropertyKey>} keys */
  syncFromExternal(keys) {
    this.selected = new Set(keys);
    this.#anchor = null;
    this.#apply();
    this.#notify();
  }

  #notify() {
    this.host.dispatchEvent(
      new CustomEvent("tvx-selection-change", {
        detail: { selectedItems: new Set(this.selected) },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
