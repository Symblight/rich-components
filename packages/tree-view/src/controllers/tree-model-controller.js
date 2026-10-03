import { emit } from "../core/emit.js";
import {
  buildIndexTree,
  createEmptyIndexTree,
  findIndexTree,
  isAncestorIndexTree,
  moveIndexTree,
  positionIndexTree,
  setIndexTreeChildren,
  walkIndexTree,
} from "../core/index-tree.js";

/** A branch reporting a huge child count still shows at most this many skeleton rows. */
const MAX_SKELETON_ROWS = 8;

/** @typedef {import("../core/index-tree.js").IndexTree<any>} TreeNode */

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
 * The tree's state: the structure (an `IndexTree` of the consumer's items), expanded/loading
 * branches, and `rows` — the flat list of visible lines that gets rendered. Every change rebuilds
 * `rows` and re-renders the host.
 */
export class TreeModelController {
  /** Synthetic root; a node's `children` is `null` while a lazy branch isn't loaded. @type {TreeNode} */
  tree = createEmptyIndexTree();
  /** @type {Set<PropertyKey>} */
  expanded = new Set();
  /** Branches being fetched; `null` = the root. @type {Set<PropertyKey | null>} */
  loading = new Set();
  /** @type {TreeRow[]} */
  rows = [];
  /** @type {Map<PropertyKey, number>} */
  #rowIndex = new Map();
  /** Set by `updateItemLabel`; wins over `getItemLabel` until the next `.items`. @type {Map<PropertyKey, string>} */
  #labels = new Map();
  /** `dataSource.getChildrenCount()` per unloaded node, asked once when it's added. @type {Map<PropertyKey, number | undefined>} */
  #childCounts = new Map();
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

  get #treeOptions() {
    return { getKey: this.host.getItemId, getChildren: this.host.getItemChildren };
  }

  /** @param {any[]} items */
  setItems(items) {
    this.tree = buildIndexTree(items, this.#treeOptions);
    this.#labels.clear();
    this.#childCounts.clear();
    this.#countChildren(this.tree);
    this.structureVersion++;
    this.#refresh();
    this.#loadExpandedBranches();
  }

  /** @param {PropertyKey} id
   * @param {any[]} items */
  setChildren(id, items) {
    const node = this.node(id);
    if (!node) return;
    for (const descendant of walkIndexTree(node)) {
      if (descendant === node || descendant.key === null) continue;
      this.#labels.delete(descendant.key);
      this.#childCounts.delete(descendant.key);
    }
    setIndexTreeChildren(node, items, this.#treeOptions);
    this.#countChildren(node);
    if (items.length === 0) this.expanded.delete(id); // turned out to be a leaf
    this.structureVersion++;
    this.#refresh();
    this.#loadExpandedBranches();
  }

  /** Asks `dataSource` for the child count of every unloaded node under `node`. @param {TreeNode} node */
  #countChildren(node) {
    const dataSource = this.host.dataSource;
    for (const descendant of walkIndexTree(node)) {
      if (descendant.children === null && descendant.key !== null) {
        this.#childCounts.set(descendant.key, dataSource?.getChildrenCount(descendant.value));
      }
    }
  }

  /** Expanded branches whose children aren't loaded yet (e.g. after a new `.items`) get fetched. */
  #loadExpandedBranches() {
    for (const id of this.expanded) {
      if (this.node(id)?.children === null && this.hasChildren(id)) this.onExpand(id);
    }
  }

  /** @param {PropertyKey} id */
  node(id) {
    return findIndexTree(this.tree, id);
  }

  /** @param {PropertyKey} id */
  has(id) {
    return this.tree.byKey.has(id);
  }

  /** Whether a branch's children are in the tree (a lazy one's arrive on expand). @param {PropertyKey} id */
  isLoaded(id) {
    return !!this.node(id)?.children;
  }

  /** No root items yet. */
  get empty() {
    return !this.tree.children?.length;
  }

  /** @param {PropertyKey} id */
  item(id) {
    return this.node(id)?.value;
  }

  /** @param {PropertyKey | null} parentId
   * @returns {PropertyKey[]} */
  childIds(parentId) {
    const parent = parentId === null ? this.tree : this.node(parentId);
    return parent?.children?.map((child) => /** @type {PropertyKey} */ (child.key)) ?? [];
  }

  /** @param {PropertyKey} id
   * @returns {PropertyKey | null} */
  parentId(id) {
    return this.node(id)?.parent?.key ?? null;
  }

  /** @param {PropertyKey} id */
  label(id) {
    const node = this.node(id);
    if (!node) return "";
    return this.#labels.get(id) ?? String(this.host.getItemLabel(node.value) ?? "");
  }

  /** @param {PropertyKey} id
   * @param {string} label */
  setLabel(id, label) {
    if (!this.has(id)) return;
    this.#labels.set(id, label);
    this.host.requestUpdate();
  }

  /** @param {PropertyKey} id */
  isDisabled(id) {
    const node = this.node(id);
    return !!node && !!this.host.isItemDisabled(node.value);
  }

  /** Loaded children decide; an unloaded lazy branch uses its `childCount` (`0` = leaf).
   * @param {PropertyKey} id */
  hasChildren(id) {
    const node = this.node(id);
    if (!node) return false;
    if (node.children) return node.children.length > 0;
    return !!this.host.dataSource && this.#childCounts.get(id) !== 0;
  }

  /** @param {PropertyKey} id */
  childCount(id) {
    return this.#childCounts.get(id);
  }

  /** @param {PropertyKey} ancestorId
   * @param {PropertyKey} id */
  isAncestor(ancestorId, id) {
    const ancestor = this.node(ancestorId);
    const node = this.node(id);
    return !!ancestor && !!node && isAncestorIndexTree(ancestor, node);
  }

  /** @param {PropertyKey} id */
  position(id) {
    const node = this.node(id);
    const { parent, index } = node ? positionIndexTree(node) : { parent: null, index: -1 };
    return { parentId: parent?.key ?? null, index };
  }

  /** Moves `id` under `parentId` at `index` (counted without `id` itself).
   * @param {PropertyKey} id
   * @param {PropertyKey | null} parentId
   * @param {number} index */
  move(id, parentId, index) {
    const node = this.node(id);
    const parent = parentId === null ? this.tree : this.node(parentId);
    if (!node || !parent || !moveIndexTree(node, parent, index)) return;
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
    for (const id of this.tree.byKey.keys()) this.#setExpanded(id, true);
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

    /** @param {TreeNode[]} nodes
     * @param {number} level */
    const addLevel = (nodes, level) => {
      nodes.forEach((node, i) => {
        const id = /** @type {PropertyKey} */ (node.key);
        this.#rowIndex.set(id, rows.length);
        rows.push({ kind: "item", key: id, id, level, posinset: i + 1, setsize: nodes.length });
        if (!this.isExpanded(id)) return;
        if (this.loading.has(id)) addPlaceholders(id, level + 1);
        else addLevel(node.children ?? [], level + 1);
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

    if (this.empty && this.loading.has(null)) {
      rows.push({
        kind: "loading",
        key: "\0loading:root",
        id: "",
        level: 1,
        posinset: 1,
        setsize: 1,
      });
    }
    addLevel(this.tree.children ?? [], 1);
    this.rows = rows;
  }
}
