import { emit } from "../core/emit.js";

/** A branch reporting a huge child count still shows at most this many skeleton rows. */
const MAX_SKELETON_ROWS = 8;

/**
 * @typedef {object} TreeNode
 * @property {PropertyKey} id
 * @property {any} item
 * @property {PropertyKey | null} parentId
 * @property {PropertyKey[] | null} childIds `null` while a lazy branch's children aren't loaded
 * @property {string} [label] set by `updateItemLabel`; wins over `getItemLabel` until the next `.items`
 * @property {number | undefined} childCount `dataSource.getChildrenCount()`, asked once when the node is added
 */

/**
 * One rendered line: a real item, or a placeholder shown while a branch loads.
 * @typedef {object} TreeRow
 * @property {"item" | "loading" | "skeleton"} kind
 * @property {PropertyKey} key unique row key (the item id for items)
 * @property {PropertyKey} id item id (for placeholders: the loading branch)
 * @property {number} level 1-indexed depth
 * @property {number} posinset
 * @property {number} setsize
 */

/**
 * The tree's state: nodes by id, expanded/loading branches, and `rows` — the flat list of visible
 * lines that gets rendered. Every change rebuilds `rows` and re-renders the host.
 */
export class TreeModelController {
  /** @type {Map<PropertyKey, TreeNode>} */
  nodes = new Map();
  /** @type {PropertyKey[]} */
  rootIds = [];
  /** @type {Set<PropertyKey>} */
  expanded = new Set();
  /** Branches being fetched; `null` = the root. @type {Set<PropertyKey | null>} */
  loading = new Set();
  /** @type {TreeRow[]} */
  rows = [];
  /** @type {Map<PropertyKey, number>} */
  #rowIndex = new Map();
  /** Bumped when nodes are added or moved (not on expand/collapse), so selection knows to recount. */
  structureVersion = 0;

  /**
   * @param {import("../base/tree-view.js").TvxTreeView} host
   * @param {(id: PropertyKey) => void} onExpand called for every newly expanded branch (lazy loading)
   */
  constructor(host, onExpand) {
    this.host = host;
    this.onExpand = onExpand;
  }

  // ─── items ───

  /** @param {any[]} items */
  setItems(items) {
    this.nodes.clear();
    this.rootIds = this.#addNodes(items, null);
    this.structureVersion++;
    this.#refresh();
    this.#loadExpandedBranches();
  }

  /** @param {PropertyKey} id
   * @param {any[]} items */
  setChildren(id, items) {
    const node = this.nodes.get(id);
    if (!node) return;
    node.childIds = this.#addNodes(items, id);
    if (items.length === 0) this.expanded.delete(id); // turned out to be a leaf
    this.structureVersion++;
    this.#refresh();
    this.#loadExpandedBranches();
  }

  /** Expanded branches whose children aren't loaded yet (e.g. after a new `.items`) get fetched. */
  #loadExpandedBranches() {
    for (const id of this.expanded) {
      if (this.nodes.get(id)?.childIds === null && this.hasChildren(id)) this.onExpand(id);
    }
  }

  /** @param {any[]} items
   * @param {PropertyKey | null} parentId
   * @returns {PropertyKey[]} */
  #addNodes(items, parentId) {
    return items.map((item) => {
      const id = this.host.getItemId(item);
      const children = this.host.getItemChildren(item);
      /** @type {TreeNode} */
      const node = { id, item, parentId, childIds: null, childCount: undefined };
      this.nodes.set(id, node);
      if (children?.length) node.childIds = this.#addNodes(children, id);
      else node.childCount = this.host.dataSource?.getChildrenCount(item);
      return id;
    });
  }

  /** @param {PropertyKey} id */
  item(id) {
    return this.nodes.get(id)?.item;
  }

  /** @param {PropertyKey | null} parentId
   * @returns {PropertyKey[]} */
  childIds(parentId) {
    if (parentId === null) return this.rootIds;
    return this.nodes.get(parentId)?.childIds ?? [];
  }

  /** @param {PropertyKey} id
   * @returns {PropertyKey | null} */
  parentId(id) {
    return this.nodes.get(id)?.parentId ?? null;
  }

  /** @param {PropertyKey} id */
  label(id) {
    const node = this.nodes.get(id);
    if (!node) return "";
    return node.label ?? String(this.host.getItemLabel(node.item) ?? "");
  }

  /** @param {PropertyKey} id
   * @param {string} label */
  setLabel(id, label) {
    const node = this.nodes.get(id);
    if (!node) return;
    node.label = label;
    this.host.requestUpdate();
  }

  /** @param {PropertyKey} id */
  isDisabled(id) {
    const node = this.nodes.get(id);
    return !!node && !!this.host.isItemDisabled(node.item);
  }

  /** Loaded children decide; an unloaded lazy branch uses its `childCount` (`0` = leaf).
   * @param {PropertyKey} id */
  hasChildren(id) {
    const node = this.nodes.get(id);
    if (!node) return false;
    if (node.childIds) return node.childIds.length > 0;
    return !!this.host.dataSource && node.childCount !== 0;
  }

  /** @param {PropertyKey} id */
  childCount(id) {
    return this.nodes.get(id)?.childCount;
  }

  /** `id` and all its loaded descendants.
   * @param {PropertyKey} id
   * @returns {IterableIterator<PropertyKey>} */
  *subtree(id) {
    yield id;
    for (const childId of this.childIds(id)) yield* this.subtree(childId);
  }

  /** @param {PropertyKey} ancestorId
   * @param {PropertyKey} id */
  isAncestor(ancestorId, id) {
    for (let p = this.parentId(id); p !== null; p = this.parentId(p)) {
      if (p === ancestorId) return true;
    }
    return false;
  }

  /** @param {PropertyKey} id */
  position(id) {
    const parentId = this.parentId(id);
    return { parentId, index: this.childIds(parentId).indexOf(id) };
  }

  /** Moves `id` under `parentId` at `index` (counted without `id` itself).
   * @param {PropertyKey} id
   * @param {PropertyKey | null} parentId
   * @param {number} index */
  move(id, parentId, index) {
    const node = this.nodes.get(id);
    if (!node) return;
    const oldSiblings = this.childIds(node.parentId);
    oldSiblings.splice(oldSiblings.indexOf(id), 1);

    let newSiblings = this.rootIds;
    if (parentId !== null) {
      const parent = /** @type {TreeNode} */ (this.nodes.get(parentId));
      parent.childIds ??= [];
      newSiblings = parent.childIds;
    }
    newSiblings.splice(index, 0, id);
    node.parentId = parentId;
    this.structureVersion++;
    this.#refresh();
  }

  // ─── expansion ───

  /** @param {PropertyKey} id */
  isExpanded(id) {
    return this.expanded.has(id) && this.hasChildren(id);
  }

  /** @param {PropertyKey} id */
  toggle(id) {
    if (this.expanded.has(id)) this.collapse(id);
    else this.expand(id);
  }

  /** @param {PropertyKey} id */
  expand(id) {
    if (this.#setExpanded(id, true)) this.#expansionChanged();
  }

  /** @param {PropertyKey} id */
  collapse(id) {
    if (this.#setExpanded(id, false)) this.#expansionChanged();
  }

  /** Expands every loaded branch; lazily loaded children arrive collapsed. */
  expandAll() {
    for (const id of this.nodes.keys()) this.#setExpanded(id, true);
    this.#expansionChanged();
  }

  collapseAll() {
    for (const id of [...this.expanded]) this.#setExpanded(id, false);
    this.#expansionChanged();
  }

  /** Makes exactly `ids` expanded (unknown ids are skipped). @param {Iterable<PropertyKey>} ids */
  setExpandedItems(ids) {
    const next = new Set(ids);
    for (const id of [...this.expanded]) if (!next.has(id)) this.#setExpanded(id, false);
    for (const id of next) this.#setExpanded(id, true);
    this.#expansionChanged();
  }

  /** @param {PropertyKey} id
   * @param {boolean} expanded
   * @returns {boolean} whether anything changed */
  #setExpanded(id, expanded) {
    if (expanded === this.expanded.has(id)) return false;
    if (expanded && !this.hasChildren(id)) return false;
    if (expanded) this.expanded.add(id);
    else this.expanded.delete(id);
    emit(this.host, "tvx-expand-change", { key: id, expanded });
    if (expanded) this.onExpand(id);
    return true;
  }

  #expansionChanged() {
    this.#refresh();
    emit(this.host, "tvx-expansion-change", { expandedItems: new Set(this.expanded) });
  }

  // ─── loading ───

  /** @param {PropertyKey | null} id
   * @param {boolean} loading */
  setLoading(id, loading) {
    if (loading) this.loading.add(id);
    else this.loading.delete(id);
    this.#refresh();
  }

  // ─── rows ───

  /** @param {PropertyKey} id */
  indexOf(id) {
    return this.#rowIndex.get(id) ?? -1;
  }

  /** Item id at a row index; `null` for placeholders. @param {number} index */
  idAt(index) {
    const row = this.rows[index];
    return row?.kind === "item" ? row.id : null;
  }

  /** First item row at `index` or beyond it in `direction`, skipping placeholders.
   * @param {number} index
   * @param {1 | -1} direction */
  itemFrom(index, direction) {
    for (let i = index; i >= 0 && i < this.rows.length; i += direction) {
      const id = this.idAt(i);
      if (id !== null) return id;
    }
    return null;
  }

  #refresh() {
    this.#buildRows();
    this.host.requestUpdate();
  }

  /** Walks expanded branches depth-first into `rows`; a loading branch gets placeholder rows. */
  #buildRows() {
    /** @type {TreeRow[]} */
    const rows = [];
    this.#rowIndex = new Map();

    /** @param {PropertyKey[]} ids
     * @param {number} level */
    const addLevel = (ids, level) => {
      ids.forEach((id, i) => {
        this.#rowIndex.set(id, rows.length);
        rows.push({ kind: "item", key: id, id, level, posinset: i + 1, setsize: ids.length });
        if (!this.isExpanded(id)) return;
        if (this.loading.has(id)) addPlaceholders(id, level + 1);
        else addLevel(this.childIds(id), level + 1);
      });
    };

    /** Skeleton rows when the child count is known, otherwise one spinner row.
     * @param {PropertyKey} id
     * @param {number} level */
    const addPlaceholders = (id, level) => {
      const count = this.childCount(id);
      const kind = typeof count === "number" ? "skeleton" : "loading";
      const total =
        kind === "skeleton" ? Math.min(Math.max(Number(count), 1), MAX_SKELETON_ROWS) : 1;
      for (let i = 0; i < total; i++) {
        rows.push({
          kind,
          key: `\0${kind}:${String(id)}:${i}`,
          id,
          level,
          posinset: i + 1,
          setsize: total,
        });
      }
    };

    if (this.rootIds.length === 0 && this.loading.has(null)) {
      rows.push({
        kind: "loading",
        key: "\0loading:root",
        id: "",
        level: 1,
        posinset: 1,
        setsize: 1,
      });
    }
    addLevel(this.rootIds, 1);
    this.rows = rows;
  }
}
