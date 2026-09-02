/** Owns which item holds the tree's single Tab stop (roving-tabindex pattern). */
export class RovingFocusController {
  /** @type {PropertyKey | null} */
  #focusedKey = null;
  /** Element backing `#focusedKey`, so moving the Tab stop only ever touches the previous and
   * next active item instead of sweeping every item in the tree.
   * @type {import("../components/tree-item/tree-item.js").TvxTreeItem | null} */
  #focusedItem = null;

  /** @param {import("../base/tree-view.js").TvxTreeView} host */
  constructor(host) {
    this.host = host;
  }

  /** @returns {PropertyKey | null} */
  get focusedKey() {
    return this.#focusedKey;
  }

  /** Moves the tree's Tab stop to `item` and focuses it. No-op if `item` is nullish.
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem | null} item */
  focusNode(item) {
    if (!item) return;
    this.#setActive(item);
    // preventScroll: scrollElementIntoView() below handles scrolling explicitly instead.
    item.focus({ preventScroll: true });
    this.host.scrollElementIntoView(item);
  }

  /** Ensures exactly one item is reachable via Tab once the tree has content. */
  ensureInitialFocusable() {
    if (this.#focusedKey !== null && this.host.getItemByKey(this.#focusedKey)) return;
    const first = this.host.firstVisibleItem();
    if (first) this.#setActive(first);
  }

  /** New items default to `tabIndex = -1` on connect (see `TvxTreeItem.connectedCallback()`), so
   * the only item that ever needs correcting off that default is the previously-active one.
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item */
  #setActive(item) {
    if (this.#focusedItem && this.#focusedItem !== item && this.#focusedItem.isConnected) {
      this.#focusedItem.tabIndex = -1;
    }
    item.tabIndex = 0;
    this.#focusedKey = item.key;
    this.#focusedItem = item;
  }
}
