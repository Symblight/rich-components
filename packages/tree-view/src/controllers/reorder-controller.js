import { closestTreeItemParent } from "../components/tree-item/tree-item.js";

/** Performs the tree mutation for a drag-and-drop (or keyboard) reorder; fires a cancelable `tvx-item-position-change` before touching the DOM. */
export class ReorderController {
  /** @param {import("../base/tree-view.js").TvxTreeView} host */
  constructor(host) {
    this.host = host;
  }

  /**
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item
   * @returns {boolean}
   */
  isReorderable(item) {
    if (item.disabled) return false;
    return this.host.isItemReorderable ? this.host.isItemReorderable(item) : true;
  }

  /** @param {{ sourceKey: PropertyKey, targetKey: PropertyKey, zone: "before" | "after" | "into" }} detail */
  handleDrop(detail) {
    // Deferred to next frame — moving DOM synchronously inside pdnd's onDrop leaves its internal
    // "still dragging" state stuck, breaking subsequent drags.
    this.#requestMove(detail.sourceKey, detail.targetKey, detail.zone, { defer: true });
  }

  /** `Alt+ArrowUp`/`Alt+ArrowDown` — moves `item` one position among its current siblings.
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item
   * @param {-1 | 1} direction */
  moveBySibling(item, direction) {
    if (!this.isReorderable(item)) return;
    const siblings = [...(item.parentElement?.children ?? [])].filter(
      (el) => el.tagName === "TVX-TREE-ITEM",
    );
    const index = siblings.indexOf(item);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= siblings.length) return;
    const target = /** @type {import("../components/tree-item/tree-item.js").TvxTreeItem} */ (
      siblings[targetIndex]
    );
    const moved = this.#requestMove(item.key, target.key, direction < 0 ? "before" : "after", {
      defer: false,
    });
    if (moved) this.host._focus.focusNode(item);
  }

  /** Direct `tvx-tree-item` children of `parent`, or the tree's root items when `parent` is `null`.
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem | null} parent
   * @returns {import("../components/tree-item/tree-item.js").TvxTreeItem[]} */
  #siblingsOf(parent) {
    return [...this.host.directChildItems(parent ?? this.host)];
  }

  /** `item`'s current position among its siblings.
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item
   * @returns {{ parentId: PropertyKey | null, index: number }} */
  #positionOf(item) {
    const parent = closestTreeItemParent(item);
    return { parentId: parent?.key ?? null, index: this.#siblingsOf(parent).indexOf(item) };
  }

  /** Where `sourceItem` will land relative to `targetItem`/`zone`, computed before the DOM mutation happens.
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} sourceItem
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} targetItem
   * @param {"before" | "after" | "into"} zone
   * @returns {{ parentId: PropertyKey | null, index: number }} */
  #nextPositionOf(sourceItem, targetItem, zone) {
    if (zone === "into") return { parentId: targetItem.key, index: 0 };
    const parent = closestTreeItemParent(targetItem);
    // Excludes sourceItem from its old spot so a same-parent reorder lands on the right index.
    const siblings = this.#siblingsOf(parent).filter((el) => el !== sourceItem);
    const targetIndex = siblings.indexOf(targetItem);
    return {
      parentId: parent?.key ?? null,
      index: zone === "after" ? targetIndex + 1 : targetIndex,
    };
  }

  /**
   * @param {PropertyKey} sourceKey
   * @param {PropertyKey} targetKey
   * @param {"before" | "after" | "into"} zone
   * @param {{ defer: boolean }} options `defer: true` schedules the DOM mutation on next animation frame.
   * @returns {boolean} whether the move will happen (not vetoed)
   */
  #requestMove(sourceKey, targetKey, zone, { defer }) {
    const sourceItem = this.host.getItemByKey(sourceKey);
    const targetItem = this.host.getItemByKey(targetKey);
    if (!sourceItem || !targetItem || sourceItem === targetItem) return false;
    // Would create a cycle — dragging a node onto (or into a reorder around) its own descendant.
    if (sourceItem.contains(targetItem)) return false;
    if (zone === "into" && !targetItem.hasChildren) return false;

    const oldPosition = this.#positionOf(sourceItem);
    const newPosition = this.#nextPositionOf(sourceItem, targetItem, zone);
    const proceed = this.host.dispatchEvent(
      new CustomEvent("tvx-item-position-change", {
        detail: { key: sourceKey, oldPosition, newPosition },
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
    if (!proceed) return false;

    if (defer) requestAnimationFrame(() => this.#move(sourceItem, targetItem, zone));
    else this.#move(sourceItem, targetItem, zone);
    return true;
  }

  /**
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} sourceItem
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} targetItem
   * @param {"before" | "after" | "into"} zone
   */
  #move(sourceItem, targetItem, zone) {
    if (zone === "before") {
      targetItem.parentElement?.insertBefore(sourceItem, targetItem);
    } else if (zone === "after") {
      targetItem.parentElement?.insertBefore(sourceItem, targetItem.nextElementSibling);
    } else {
      // Children live in the target's own sub-tree, not straight in its default slot.
      targetItem._ensureSubTree().prepend(sourceItem);
    }
    // A move can change depth, so recompute level for the moved subtree.
    for (const item of [sourceItem, ...this.host.allItems(sourceItem)]) {
      item.level = item._computeLevel();
    }
    this.host._selection.refresh();
  }
}
