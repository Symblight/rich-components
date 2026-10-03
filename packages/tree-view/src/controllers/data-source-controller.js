import { emit } from "../core/emit.js";

/** Loads items through `host.dataSource`: the root batch into `.items`, a branch's children on expand. */
export class DataSourceController {
  /** One per in-flight fetch (`null` = the root); aborting drops its late response. @type {Map<PropertyKey | null, AbortController>} */
  #pending = new Map();
  /** @type {(message: string) => void} */
  #announce;

  /**
   * @param {import("../base/tree-view.js").TvxTreeView} host
   * @param {import("./tree-model-controller.js").TreeModelController} model
   * @param {(message: string) => void} announce host seam: screen-reader announcement
   */
  constructor(host, model, announce) {
    this.host = host;
    this.model = model;
    this.#announce = announce;
  }

  /** Fetches the root unless `.items` is already set (then that is the root batch). */
  async loadRoot() {
    if (!this.host.dataSource || this.host.items?.length || this.model.loading.has(null)) return;

    await this.#loadRootItems();
  }

  async #loadRootItems() {
    const items = await this.#fetch(null);
    if (!items) return;
    this.host.items = items;
    emit(this.host, "tvx-children-loaded", { id: null, item: null, items });
  }

  /** Refetches a branch's children, or the root without an id. A collapsed branch is only
   * unloaded — it fetches on the next expand.
   * @param {PropertyKey | null} id */
  async reload(id) {
    if (!this.host.dataSource) return;
    this.#cancel(id);
    if (id === null) return this.#loadRootItems();
    if (!this.model.has(id)) return;
    this.model.unloadChildren(id);
    if (this.model.isExpanded(id)) await this.loadChildren(id);
  }

  /** No-op if the children are already loaded or loading; a failed load is retried on the next expand.
   * @param {PropertyKey} id */
  async loadChildren(id) {
    if (!this.host.dataSource || this.model.loading.has(id)) return;
    if (this.model.isLoaded(id)) return;

    const items = await this.#fetch(id);
    if (!items || !this.model.has(id)) return;
    this.model.setChildren(id, items);
    if (items.length === 0) this.#announce(`${this.model.label(id)} is empty.`);
    else emit(this.host, "tvx-children-loaded", { id, item: this.model.item(id), items });
  }

  /** A new `dataSource`: cancel pending loads and fetch the root again. */
  reset() {
    this.dispose();
    this.loadRoot();
  }

  /** Cancels pending loads and removes their loading rows. */
  dispose() {
    for (const id of [...this.#pending.keys()]) this.#cancel(id);
  }

  /** @param {PropertyKey | null} id */
  #cancel(id) {
    const controller = this.#pending.get(id);
    if (!controller) return;
    controller.abort();
    this.#pending.delete(id);
    this.model.setLoading(id, false);
  }

  /** One `getTreeItems()` call with loading rows + announcements; `null` on error or when cancelled.
   * @param {PropertyKey | null} id
   * @returns {Promise<any[] | null>} */
  async #fetch(id) {
    const controller = new AbortController();
    this.#pending.set(id, controller);
    const { signal } = controller;
    const parent = id === null ? undefined : this.model.item(id);
    const count = id === null ? undefined : this.model.childCount(id);
    this.model.setLoading(id, true);
    this.#announce(typeof count === "number" ? `Loading ${count} items.` : "Loading…");
    try {
      const items = (await this.host.dataSource?.getTreeItems(parent)) ?? [];
      return signal.aborted ? null : items;
    } catch (error) {
      if (!signal.aborted) {
        emit(this.host, "tvx-load-error", { id, item: parent ?? null, error });
      }
      return null;
    } finally {
      // a cancelled load's row was already removed by #cancel(); a newer load may own this id now
      if (!signal.aborted) {
        this.#pending.delete(id);
        this.model.setLoading(id, false);
      }
    }
  }
}
