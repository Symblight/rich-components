const STATUS_IDLE = "idle";
const STATUS_LOADING = "loading";
const STATUS_LOADED = "loaded";
const STATUS_ERROR = "error";

const ROOT_KEY = Symbol("root");

/** Drives `dataSource`-based loading: `loadRoot()` populates the top level, `maybeLoad(item)` is called on every expand. */
export class DataSourceController {
  /** @type {Map<PropertyKey | typeof ROOT_KEY, string>} */
  #status = new Map();
  /** In-flight loads, so a disconnect or a `dataSource` swap can mark them stale instead of
   * letting a late response mutate DOM that's gone (or been replaced) by the time it resolves.
   * @type {Map<PropertyKey | typeof ROOT_KEY, AbortController>} */
  #controllers = new Map();

  /**
   * @param {import("../base/tree-view.js").TvxTreeView} host
   * @param {import("./roving-focus-controller.js").RovingFocusController} focus
   */
  constructor(host, focus) {
    this.host = host;
    this.focus = focus;
  }

  /** No-ops unless a `dataSource` is configured and the root hasn't loaded yet. Uses `.items` as the root batch if set, otherwise fetches via `getTreeItems()`. */
  async loadRoot() {
    if (!this.host.dataSource) return;
    if ((this.#status.get(ROOT_KEY) ?? STATUS_IDLE) !== STATUS_IDLE) return;

    const initialItems = this.host.items;
    if (initialItems && initialItems.length > 0) {
      this.#status.set(ROOT_KEY, STATUS_LOADED);
      this.#applyChildrenCount(initialItems);
      return;
    }

    this.#status.set(ROOT_KEY, STATUS_LOADING);
    const controller = new AbortController();
    this.#controllers.set(ROOT_KEY, controller);
    const placeholder = this.#insertRootPlaceholder();
    this.host.announce("Loading…");

    /** @type {import("../components/tree-item/tree-item.js").TvxTreeItem[] | undefined} */
    let items;
    try {
      items = await this.host.dataSource.getTreeItems();
    } catch (error) {
      if (!controller.signal.aborted) {
        this.#status.set(ROOT_KEY, STATUS_ERROR);
        this.#notifyLoadError(null, error);
      }
      placeholder.remove();
      return;
    } finally {
      this.#controllers.delete(ROOT_KEY);
    }
    // Host disconnected, or `dataSource` was swapped out, while the fetch was in flight — this
    // response is stale, don't let it clobber whatever loaded (or is loading) in its place.
    if (controller.signal.aborted) return;

    placeholder.remove();
    this.#status.set(ROOT_KEY, STATUS_LOADED);
    this.#applyChildrenCount(items ?? []);
    this.host.items = items ?? [];

    this.host.dispatchEvent(
      new CustomEvent("tvx-children-loaded", {
        detail: { key: null, node: null, items: items ?? [] },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Called on a `dataSource` property change: a already-settled root is reset so `loadRoot()`
   * fetches fresh from the new source; a first-ever assignment (root still idle/loading) is left
   * alone so this doesn't abort the load that's already in flight for it. */
  handleDataSourceChange() {
    const rootStatus = this.#status.get(ROOT_KEY) ?? STATUS_IDLE;
    if (rootStatus === STATUS_LOADED || rootStatus === STATUS_ERROR) this.reset();
    this.loadRoot();
  }

  /** Aborts every in-flight load and clears all status, so a swapped-in `dataSource` starts clean. */
  reset() {
    this.dispose();
    this.#status.clear();
  }

  /** Aborts every in-flight load without touching status — call on host disconnect. */
  dispose() {
    for (const controller of this.#controllers.values()) controller.abort();
    this.#controllers.clear();
  }

  /** No-ops unless `item` is an unloaded group; decides whether a fetch is actually needed.
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item */
  maybeLoad(item) {
    if (!item.hasChildren || !this.host.dataSource) return;
    if (item._subTreeEl?.querySelector(":scope > tvx-tree-item")) return;
    if ((this.#status.get(item.key ?? "") ?? STATUS_IDLE) !== STATUS_IDLE) return;
    this.#load(item);
  }

  /** @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item */
  async #load(item) {
    this.#status.set(item.key, STATUS_LOADING);
    const controller = new AbortController();
    this.#controllers.set(item.key, controller);
    const knownCount = typeof item.childCount === "number";
    const message = knownCount ? `Loading ${item.childCount} items.` : "Loading…";
    // A known count gets row-shaped skeletons; unknown falls back to a generic spinner placeholder.
    const placeholder = knownCount
      ? this.#insertSkeleton(item, /** @type {number} */ (item.childCount))
      : this.#insertPlaceholder(item, message);
    this.host.announce(message);

    /** @type {import("../components/tree-item/tree-item.js").TvxTreeItem[] | undefined} */
    let children;
    try {
      children = await this.host.dataSource?.getTreeItems(item);
    } catch (error) {
      if (!controller.signal.aborted) {
        this.#status.set(item.key, STATUS_ERROR);
        this.#notifyLoadError(item, error);
      }
      placeholder.remove();
      return;
    } finally {
      this.#controllers.delete(item.key);
    }
    // Aborted (host disconnected / dataSource swapped) or the item itself is gone from the DOM
    // (e.g. replaced by a fresh `.items` assignment mid-fetch) — this response is stale.
    if (controller.signal.aborted || !item.isConnected) {
      placeholder.remove();
      return;
    }

    // Skeletons are decorative and never a focus stop; only the generic placeholder row can be.
    const focusWasOnPlaceholder =
      !knownCount &&
      this.focus.focusedKey ===
        /** @type {import("../components/tree-item/tree-item.js").TvxTreeItem} */ (placeholder)
          .key;
    placeholder.remove();

    if (!children || children.length === 0) {
      this.#status.set(item.key, STATUS_LOADED);
      item.hasChildren = false;
      item.removeAttribute("aria-expanded");
      item._subTreeEl?.remove();
      item._subTreeEl = null;
      this.host.announce(`${item.label} is empty.`);
      if (focusWasOnPlaceholder) this.focus.focusNode(item);
      return;
    }

    this.#status.set(item.key, STATUS_LOADED);
    this.#applyChildrenCount(children);
    const subTree = item._ensureSubTree();
    for (const childEl of children) subTree.append(childEl);
    if (focusWasOnPlaceholder) this.focus.focusNode(this.host.firstChildItem(item));

    this.host.dispatchEvent(
      new CustomEvent("tvx-children-loaded", {
        detail: { key: item.key, node: item, items: children },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** A `getTreeItems()` rejection — surfaces the failure so the app can show an error state or retry.
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem | null} item `null` for a root-level failure.
   * @param {unknown} error */
  #notifyLoadError(item, error) {
    this.host.dispatchEvent(
      new CustomEvent("tvx-load-error", {
        detail: { key: item?.key ?? null, node: item, error },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Runs `getChildrenCount` once per item in a freshly-landed batch. Exactly `0` means a leaf; anything else makes it a group.
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem[]} items */
  #applyChildrenCount(items) {
    const getChildrenCount = this.host.dataSource?.getChildrenCount;
    if (!getChildrenCount) return;
    for (const item of items) {
      const count = getChildrenCount(item);
      if (count === 0) continue;
      item.hasChildren = true;
      if (typeof count === "number") item.childCount = count;
    }
  }

  /**
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item
   * @param {string} message Reused as the placeholder's own `label`.
   * @returns {import("../components/tree-item/tree-item.js").TvxTreeItem}
   */
  #insertPlaceholder(item, message) {
    const placeholder = /** @type {import("../components/tree-item/tree-item.js").TvxTreeItem} */ (
      document.createElement("tvx-tree-item")
    );
    placeholder.key = `${String(item.key)}__loading`;
    placeholder.label = message;
    placeholder.loading = true;
    placeholder.tabIndex = -1;
    placeholder.setAttribute("aria-disabled", "true");
    item._ensureSubTree().append(placeholder);
    return placeholder;
  }

  /**
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item
   * @param {number} count
   * @returns {import("../components/tree-skeleton/tree-skeleton.js").TvxTreeSkeleton}
   */
  #insertSkeleton(item, count) {
    const skeleton =
      /** @type {import("../components/tree-skeleton/tree-skeleton.js").TvxTreeSkeleton} */ (
        document.createElement("tvx-tree-skeleton")
      );
    skeleton.count = count;
    item._ensureSubTree().append(skeleton);
    return skeleton;
  }

  /** Whole-tree equivalent of `#insertPlaceholder`; appends straight into the host's light DOM.
   * @returns {import("../components/tree-item/tree-item.js").TvxTreeItem} */
  #insertRootPlaceholder() {
    const placeholder = /** @type {import("../components/tree-item/tree-item.js").TvxTreeItem} */ (
      document.createElement("tvx-tree-item")
    );
    placeholder.key = "__root_loading";
    placeholder.label = "Loading…";
    placeholder.loading = true;
    placeholder.tabIndex = -1;
    placeholder.setAttribute("aria-disabled", "true");
    this.host.append(placeholder);
    return placeholder;
  }
}
