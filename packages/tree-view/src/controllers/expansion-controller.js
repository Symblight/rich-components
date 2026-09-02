import { ContextProvider } from "@lit/context";
import { toggledItemsContext } from "../base/toggled-items-context.js";

/** Orchestrates expand/collapse; mirrors state into a context `Map` for light-DOM content that can't see attribute changes directly. */
export class ExpansionController {
  /**
   * @param {import("../base/tree-view.js").TvxTreeView} host
   * @param {import("./data-source-controller.js").DataSourceController} loading
   */
  constructor(host, loading) {
    this.host = host;
    this.loading = loading;
    this._provider = new ContextProvider(host, {
      context: toggledItemsContext,
      initialValue: new Map(),
    });
  }

  /** @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item */
  toggle(item) {
    if (item.expanded) this.collapse(item);
    else this.expand(item);
  }

  /** @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item */
  expand(item) {
    if (!item.hasChildren || item.expanded) return;
    this.#setExpanded(item, true);
    this.loading.maybeLoad(item);
    this.#notifyExpansionChange();
  }

  /** @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item */
  collapse(item) {
    if (!item.expanded) return;
    this.#setExpanded(item, false);
    this.#notifyExpansionChange();
  }

  /** Expands every branch, walking the tree via `host.buildIndexTree()`. */
  expandAll() {
    for (const node of this.host.buildIndexTree()) {
      if (node.key === null) continue; // synthetic root, not a real item
      const item = /** @type {import("../components/tree-item/tree-item.js").TvxTreeItem} */ (
        node.value
      );
      if (item.hasChildren && !item.expanded) {
        this.#setExpanded(item, true);
        this.loading.maybeLoad(item);
      }
    }
    this.#notifyExpansionChange();
  }

  /** @see expandAll */
  collapseAll() {
    for (const node of this.host.buildIndexTree()) {
      if (node.key === null) continue; // synthetic root, not a real item
      const item = /** @type {import("../components/tree-item/tree-item.js").TvxTreeItem} */ (
        node.value
      );
      if (item.expanded) this.#setExpanded(item, false);
    }
    this.#notifyExpansionChange();
  }

  /** Replaces expanded state from an external `expandedItems` write (uncontrolled-with-sync, like `items`);
   * only affects items currently mounted in the DOM — async-loaded descendants not yet fetched can't be
   * reflected until they exist.
   * @param {Iterable<PropertyKey>} keys */
  syncFromExternal(keys) {
    const next = new Set(keys);
    for (const item of this.host.allItems()) {
      if (next.has(item.key) && item.hasChildren && !item.expanded) {
        this.#setExpanded(item, true);
        this.loading.maybeLoad(item);
      } else if (!next.has(item.key) && item.expanded) {
        this.#setExpanded(item, false);
      }
    }
    this.#notifyExpansionChange();
  }

  /** Live Set of every currently expanded item's key, scanning the current DOM.
   * @returns {Set<PropertyKey>} */
  getExpandedKeys() {
    const set = new Set();
    for (const item of this.host.allItems()) if (item.expanded) set.add(item.key);
    return set;
  }

  /**
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item
   * @param {boolean} expanded
   */
  #setExpanded(item, expanded) {
    item.expanded = expanded;
    this.#setToggled(item.key, expanded);
    this.#notify(item);
  }

  /**
   * @param {PropertyKey} key
   * @param {boolean} expanded
   */
  #setToggled(key, expanded) {
    const map = new Map(this._provider.value);
    map.set(key, expanded);
    this._provider.setValue(map);
  }

  /** @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item */
  #notify(item) {
    this.host.dispatchEvent(
      new CustomEvent("tvx-expand-change", {
        detail: { key: item.key, expanded: item.expanded },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Whole-tree counterpart to `#notify()`, for controlled binding via `expandedItems`. */
  #notifyExpansionChange() {
    this.host.dispatchEvent(
      new CustomEvent("tvx-expansion-change", {
        detail: { expandedItems: this.getExpandedKeys() },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
