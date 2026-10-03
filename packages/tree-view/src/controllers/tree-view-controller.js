import { ContextEvent } from "@lit/context";

import { treeViewContext } from "../context/tree-view-context.js";
import { TREE_VIEW_API_DEFAULTS } from "../api/tree-view-api-defaults.js";
import { TREE_VIEW_INTERNALS } from "../api/keys.js";

/** @import { ReactiveController, ReactiveControllerHost } from "lit" */
/** @import { TvxTreeViewApi, TvxTreeViewNamespace } from "../types/api.js" */
/** @typedef {import("../base/tree-view.js").TvxTreeView} TvxTreeView */
/** @typedef {TvxTreeView | (() => TvxTreeView | null | undefined)} TreeViewTarget */

/**
 * Connects a consumer's own Lit element to a `<tvx-tree-view>`: its API namespaces plus reactive
 * state that re-renders the host when — and only when — something it read changes.
 *
 * A sibling tree (the usual toolbar case) is passed as `target`, an element or a getter re-run on
 * every host update. Without `target`, the nearest ancestor `<tvx-tree-view>` is used.
 * @implements {ReactiveController}
 */
export class TreeViewController {
  /** @type {ReactiveControllerHost & HTMLElement} */
  #host;
  /** @type {TreeViewTarget | undefined} */
  #target;
  /** @type {TvxTreeView | undefined} */
  #tree;
  /** @type {EventTarget | undefined} */
  #changes;
  /** @type {(() => void) | undefined} */
  #unsubscribe;
  /** Namespaces read since the last update finished. @type {Set<TvxTreeViewNamespace>} */
  #reads = new Set();
  /** Namespaces read during the last full update cycle. @type {Set<TvxTreeViewNamespace>} */
  #tracked = new Set();

  /**
   * @param {ReactiveControllerHost & HTMLElement} host
   * @param {TreeViewTarget} [target]
   */
  constructor(host, target) {
    this.#host = host;
    this.#target = target;
    host.addController(this);
  }

  hostConnected() {
    if (this.#target) {
      this.#resolveTarget();
      return;
    }
    this.#request();
    // a host defined before tvx-tree-view loses its first request — ask again once it exists
    if (!this.#tree) {
      customElements.whenDefined("tvx-tree-view").then(() => {
        if (!this.#tree && this.#host.isConnected) this.#request();
      });
    }
  }

  hostUpdate() {
    if (typeof this.#target === "function") this.#resolveTarget();
  }

  hostUpdated() {
    this.#tracked = this.#reads;
    this.#reads = new Set();
  }

  hostDisconnected() {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#setTree(undefined);
  }

  /** Whether an upgraded `<tvx-tree-view>` was found. */
  get connected() {
    return !!this.#changes;
  }

  get expansion() {
    return this.#facade("expansion");
  }

  get selection() {
    return this.#facade("selection");
  }

  get nodes() {
    return this.#facade("nodes");
  }

  get editing() {
    return this.#facade("editing");
  }

  get navigation() {
    return this.#facade("navigation");
  }

  get loading() {
    return this.#facade("loading");
  }

  /** @returns {Set<PropertyKey>} */
  get selectedItems() {
    return this.#read("selection").get();
  }

  /** @returns {Set<PropertyKey>} */
  get expandedItems() {
    return this.#read("expansion").get();
  }

  /** The row holding the Tab stop. @returns {PropertyKey | null} */
  get focusedItem() {
    return this.#read("navigation").getFocused();
  }

  /** @returns {PropertyKey | null} */
  get editedItem() {
    return this.#read("editing").getEdited();
  }

  /** The root or any branch is loading through `dataSource`. */
  get isLoading() {
    this.#reads.add("loading");
    return !!this.#tree?.[TREE_VIEW_INTERNALS]?.isAnyLoading();
  }

  /**
   * The tree's namespace, or the no-op defaults before a tree is found or upgraded.
   * @template {TvxTreeViewNamespace} N
   * @param {N} ns
   * @returns {TvxTreeViewApi[N]}
   */
  #facade(ns) {
    return (this.#changes && this.#tree?.[ns]) || TREE_VIEW_API_DEFAULTS[ns];
  }

  /**
   * Tracked read — the host re-renders when this namespace changes.
   * @template {TvxTreeViewNamespace} N
   * @param {N} ns
   * @returns {TvxTreeViewApi[N]}
   */
  #read(ns) {
    this.#reads.add(ns);
    return this.#facade(ns);
  }

  #resolveTarget() {
    const target = typeof this.#target === "function" ? this.#target() : this.#target;
    this.#setTree(target ?? undefined);
  }

  #request() {
    this.#host.dispatchEvent(
      new ContextEvent(
        treeViewContext,
        this.#host,
        (tree, unsubscribe) => {
          if (unsubscribe !== this.#unsubscribe) {
            this.#unsubscribe?.();
            this.#unsubscribe = unsubscribe;
          }
          this.#setTree(tree);
        },
        true,
      ),
    );
  }

  /** @param {TvxTreeView | undefined} tree */
  #setTree(tree) {
    if (tree === this.#tree) return;
    this.#tree = tree;
    this.#listen(tree?.[TREE_VIEW_INTERNALS]?.changes);
    // a target passed before tvx-tree-view is defined isn't upgraded yet
    if (tree && !this.#changes) {
      customElements.whenDefined("tvx-tree-view").then(() => {
        if (this.#tree === tree) this.#listen(tree[TREE_VIEW_INTERNALS]?.changes);
      });
    }
  }

  /** @param {EventTarget | undefined} changes */
  #listen(changes) {
    if (changes === this.#changes) return;
    this.#changes?.removeEventListener("change", this.#onChange);
    this.#changes = changes;
    changes?.addEventListener("change", this.#onChange);
    this.#host.requestUpdate();
  }

  /** @param {Event} event */
  #onChange = (event) => {
    const { namespace } = /** @type {CustomEvent<{namespace: TvxTreeViewNamespace}>} */ (event)
      .detail;
    if (this.#tracked.has(namespace) || this.#reads.has(namespace)) this.#host.requestUpdate();
  };
}
