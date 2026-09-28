import { emit } from "../core/emit.js";

/** Loads items through `host.dataSource`: the root batch into `.items`, a branch's children on expand. */
export class DataSourceController {
  /** Aborted on disconnect / dataSource swap, so late responses are dropped. */
  #abort = new AbortController();

  /**
   * @param {import("../base/tree-view.js").TvxTreeView} host
   * @param {import("./tree-model-controller.js").TreeModelController} model
   */
  constructor(host, model) {
    this.host = host;
    this.model = model;
  }

  /** Fetches the root unless `.items` is already set (then that is the root batch). */
  async loadRoot() {
    if (!this.host.dataSource || this.host.items?.length || this.model.loading.has(null)) return;

    const items = await this.#fetch(null);
    if (!items) return;
    this.host.items = items;
    emit(this.host, "tvx-children-loaded", { key: null, node: null, items });
  }

  /** No-op if the children are already loaded or loading; a failed load is retried on the next expand.
   * @param {PropertyKey} id */
  async loadChildren(id) {
    if (!this.host.dataSource || this.model.loading.has(id)) return;
    if (this.model.nodes.get(id)?.childIds) return;

    const items = await this.#fetch(id);
    if (!items || !this.model.nodes.has(id)) return;
    this.model.setChildren(id, items);
    if (items.length === 0) this.host.announce(`${this.model.label(id)} is empty.`);
    else emit(this.host, "tvx-children-loaded", { key: id, node: this.model.item(id), items });
  }

  /** A new `dataSource`: cancel pending loads and fetch the root again. */
  reset() {
    this.dispose();
    this.loadRoot();
  }

  /** Cancels pending loads and removes their loading rows. */
  dispose() {
    this.#abort.abort();
    this.#abort = new AbortController();
    for (const id of [...this.model.loading]) this.model.setLoading(id, false);
  }

  /** One `getTreeItems()` call with loading rows + announcements; `null` on error or when cancelled.
   * @param {PropertyKey | null} id
   * @returns {Promise<any[] | null>} */
  async #fetch(id) {
    const signal = this.#abort.signal;
    const parent = id === null ? undefined : this.model.item(id);
    const count = id === null ? undefined : this.model.childCount(id);
    this.model.setLoading(id, true);
    this.host.announce(typeof count === "number" ? `Loading ${count} items.` : "Loading…");
    try {
      const items = (await this.host.dataSource?.getTreeItems(parent)) ?? [];
      return signal.aborted ? null : items;
    } catch (error) {
      if (!signal.aborted) {
        emit(this.host, "tvx-load-error", { key: id, node: parent ?? null, error });
      }
      return null;
    } finally {
      // a cancelled load's row was already removed by dispose(); a newer load may own this id now
      if (!signal.aborted) this.model.setLoading(id, false);
    }
  }
}
