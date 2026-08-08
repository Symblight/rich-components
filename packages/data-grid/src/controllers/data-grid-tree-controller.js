/**
 * Iterating a node (`for...of` / `[...node]`) walks pre-order: itself,
 * then every descendant.
 * @template T
 * @typedef {{
 *   children: Map<PropertyKey, IndexTree<T>>,
 *   parent: IndexTree<T> | null,
 *   key: PropertyKey | null,
 *   readonly size: number,
 *   [Symbol.iterator](): IterableIterator<IndexTree<T>>,
 * }} IndexTree
 */

/**
 * An `IndexTree` node with the row's own fields merged onto it — what
 * `TreeController.build()` actually produces for every row (see
 * `Object.assign(node, row)` below). `createEmptyIndexTree()` itself only
 * returns a plain `IndexTree<T>`, since at that point there's no row to
 * merge in yet. `depth`/`isDataRow` are set on every node in both flat and
 * treeData mode (uniform shape — see `TreeController.build()`'s own doc
 * comment), so rendering code can read them unconditionally.
 * @template T
 * @typedef {IndexTree<T> & T & { depth: number, isDataRow: boolean, groupingKey?: PropertyKey }} IndexTreeNode
 */

/**
 * Sentinel key for the tree's root node — never a real row id, so code can
 * always tell "this is the root" apart from "this is a row" by comparing
 * `node.key` against it (mirrors MUI's `GRID_ROOT_GROUP_ID`).
 */
export const DATA_GRID_ROOT_GROUP_ID = "__data_grid_root_group__";

/**
 * Reserved prefix for a synthetic (auto-generated) group node's `.key` —
 * same sentinel-style convention as `DATA_GRID_ROOT_GROUP_ID` above. A
 * synthetic group is a path segment with no real row of its own (e.g.
 * `['Fruit','Apple']`/`['Fruit','Orange']` with nothing at `['Fruit']`
 * itself) — the common case for treeData, not an edge case.
 */
const SYNTHETIC_GROUP_ID_PREFIX = "__data_grid_group__";

/**
 * Deterministic id for a synthetic group node, derived purely from its path
 * prefix — same prefix always produces the same id regardless of row array
 * order, which is what keeps `treeDataExpandedGroupIds`/`rowSelectionModel`
 * entries valid across rebuilds (sorting, `updateRows()`, etc.). JSON-encoded
 * rather than joined with a separator (e.g. `"/"`) to avoid ambiguity
 * between e.g. `["a/b","c"]` and `["a","b/c"]`. Always a `string`, so it can
 * never collide with a real numeric row id under `Set`/`Map`'s
 * `SameValueZero` equality.
 * @param {PropertyKey[]} pathPrefix
 * @returns {string}
 */
function syntheticGroupId(pathPrefix) {
  return `${SYNTHETIC_GROUP_ID_PREFIX}${JSON.stringify(pathPrefix)}`;
}

/**
 * Creates an empty tree node. A node doubles as the row it represents once
 * built — `TreeController.build()` copies the row's own fields directly
 * onto the node (`Object.assign(node, row)`), turning it into an
 * `IndexTreeNode<T>`. That's what makes `for...of node` / `[...node]`
 * already a flat array of that node and its descendants, pre-order, with
 * no separate flatten step: iterating a row IS iterating the rows nested
 * under it.
 * @template T
 * @returns {IndexTree<T>}
 */
export function createEmptyIndexTree() {
  return {
    children: new Map(),
    parent: null,
    key: null,
    [Symbol.iterator]: function* iterate() {
      yield this;
      for (const [, child] of this.children) yield* child;
    },
    get size() {
      return [...this[Symbol.iterator]()].length;
    },
  };
}

/**
 * The subset of `md-data-grid` a `TreeController` actually needs — not the
 * full element, just what building a tree out of its rows requires.
 * `getDataPath` gates the hierarchical build path (see `build()`);
 * `treeDataExpandedGroupIds` is owned/mutated by this controller the same
 * way `DetailPanelController` owns `detailPanelExpandedRowIds`.
 * @typedef {EventTarget & {
 *   rows: Record<string, unknown>[],
 *   getRowId: (row: Record<string, unknown>) => PropertyKey,
 *   getDataPath?: (row: Record<string, unknown>) => PropertyKey[] | undefined,
 *   treeDataExpandedGroupIds: Set<PropertyKey>,
 * }} TreeControllerHost
 */

/**
 * Owns the row hierarchy for `md-data-grid` as an `IndexTree`, and
 * `treeDataExpandedGroupIds` (mutated the same `_apply()`-then-dispatch
 * shape `RowSelectionController`/`DetailPanelController` already use).
 *
 * Two build modes, dispatched by `build()`:
 * - **Flat** (`host.getDataPath` unset): every row is a direct child of the
 *   root, one level deep, keyed by `getRowId()` — today's original
 *   behavior, byte-for-byte, zero regression risk for non-tree grids.
 * - **Hierarchical** (`host.getDataPath` set): each row's
 *   `getDataPath(row)` array is walked segment by segment, building a real
 *   tree. A path segment with no row of its own becomes a synthetic group
 *   node (see `syntheticGroupId()`) — the common case (folder/category
 *   grouping), not an edge case.
 *
 * Not yet wired into `md-data-grid`'s rendering pipeline
 * (`_columns`/`_sortedRows`/`_effectiveRows` still operate on `host.rows`
 * directly) — that wiring, plus the grouping-column cell component, is
 * follow-up work. This controller is usable and independently tested on its
 * own ahead of that.
 */
export class TreeController {
  /** @param {TreeControllerHost} host */
  constructor(host) {
    this.host = host;

    /** @type {IndexTree<Record<string, unknown>>} */
    this.tree = createEmptyIndexTree();
    this.tree.key = DATA_GRID_ROOT_GROUP_ID;

    /** @private @type {Map<PropertyKey, IndexTreeNode<Record<string, unknown>>>} */
    this._byKey = new Map();
  }

  /** @param {PropertyKey} id */
  isExpanded(id) {
    return this.host.treeDataExpandedGroupIds.has(id);
  }

  /** @param {PropertyKey} id */
  toggleExpanded(id) {
    const next = new Set(this.host.treeDataExpandedGroupIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this._apply(next);
  }

  /** @param {Set<PropertyKey>} ids */
  setExpanded(ids) {
    this._apply(new Set(ids));
  }

  /**
   * @private
   * @param {Set<PropertyKey>} next
   */
  _apply(next) {
    this.host.treeDataExpandedGroupIds = next;
    this.host.dispatchEvent(
      new CustomEvent("md-data-grid-tree-data-expanded-group-ids-change", {
        detail: new Set(next),
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * (Re)builds the tree from `rows`, replacing whatever tree existed
   * before. Dispatches to the flat or hierarchical build depending on
   * `host.getDataPath` — the two paths share no code, so turning it on/off
   * can't partially apply either one's behavior.
   * @param {Record<string, unknown>[]} [rows]
   * @returns {IndexTree<Record<string, unknown>>} the new root — also
   * available afterwards via `this.tree`
   */
  build(rows = this.host.rows) {
    return this.host.getDataPath
      ? this._buildHierarchical(rows)
      : this._buildFlat(rows);
  }

  /**
   * Original flat behavior: every row a direct child of the root, one
   * level deep, keyed by `getRowId()`. Also populates `_byKey` (see
   * `getNode()`) and stamps uniform `depth`/`isDataRow` fields so a node's
   * shape doesn't depend on which build mode produced it.
   * @private
   * @param {Record<string, unknown>[]} rows
   * @returns {IndexTree<Record<string, unknown>>}
   */
  _buildFlat(rows) {
    const root = createEmptyIndexTree();
    root.key = DATA_GRID_ROOT_GROUP_ID;
    const byKey = new Map();

    for (const row of rows) {
      const id = this.host.getRowId(row);
      const node = /** @type {IndexTreeNode<Record<string, unknown>>} */ (
        createEmptyIndexTree()
      );
      Object.assign(node, row);
      node.parent = root;
      node.key = id;
      node.depth = 0;
      node.isDataRow = true;
      root.children.set(id, node);
      byKey.set(id, node);
    }

    this.tree = root;
    this._byKey = byKey;
    return root;
  }

  /**
   * Builds a real hierarchy from each row's `getDataPath(row)` — a trie
   * keyed by raw path *segment* at each level (`parent.children`, the
   * `IndexTree` structure that already exists — no new data structure), so
   * two rows sharing a group naturally land under the same node regardless
   * of which one is processed first.
   *
   * A node's public `.key` is a *separate* identity from the segment it's
   * stored under: `getRowId(row)` when a real row's path terminates exactly
   * there, otherwise a deterministic `syntheticGroupId()`. Keeping these
   * distinct is what makes the "synthetic placeholder later claimed by a
   * real row" case (below) work without ever re-keying `parent.children`.
   *
   * Order-independent by construction: a node's final identity depends only
   * on *whether some row's path ever terminates exactly there*, never on
   * *which row arrives first*. The only mutating transitions are "create"
   * (first touch, as either a passthrough placeholder or a real row) and
   * "upgrade" (a later real row claims a position an earlier row only
   * passed through) — passthrough never touches an existing node's identity,
   * and a node is never downgraded once real. So `['Fruit']` (real) landing
   * before or after `['Fruit','Apple']` (real) produces the identical tree
   * either way.
   * @private
   * @param {Record<string, unknown>[]} rows
   * @returns {IndexTree<Record<string, unknown>>}
   */
  _buildHierarchical(rows) {
    const getDataPath =
      /** @type {(row: Record<string, unknown>) => PropertyKey[] | undefined} */ (
        this.host.getDataPath
      );
    const root = /** @type {IndexTreeNode<Record<string, unknown>>} */ (
      createEmptyIndexTree()
    );
    root.key = DATA_GRID_ROOT_GROUP_ID;
    root.depth = -1; // so direct children read as depth 0

    /** @type {Map<PropertyKey, IndexTreeNode<Record<string, unknown>>>} */
    const byKey = new Map();

    for (const row of rows) {
      const path = getDataPath(row);
      if (!path || path.length === 0) {
        console.warn(
          "md-data-grid: getDataPath(row) returned an empty path; row excluded from treeData grouping",
          row,
        );
        continue;
      }

      let parent = root;
      for (let depth = 0; depth < path.length; depth++) {
        const segment = path[depth];
        const isLast = depth === path.length - 1;
        let node =
          /** @type {IndexTreeNode<Record<string, unknown>> | undefined} */ (
            parent.children.get(segment)
          );

        if (!node) {
          node = /** @type {IndexTreeNode<Record<string, unknown>>} */ (
            createEmptyIndexTree()
          );
          parent.children.set(segment, node);
          node.parent = parent;
          node.depth = depth;
          if (isLast) {
            Object.assign(node, row);
            // Re-assert reserved fields after Object.assign — a row field
            // literally named parent/depth/key/etc. would otherwise
            // silently corrupt tree bookkeeping.
            node.parent = parent;
            node.depth = depth;
            node.key = this.host.getRowId(row);
            node.isDataRow = true;
            node.groupingKey = segment;
          } else {
            node.key = syntheticGroupId(path.slice(0, depth + 1));
            node.isDataRow = false;
            node.groupingKey = segment;
          }
          byKey.set(/** @type {PropertyKey} */ (node.key), node);
        } else if (isLast) {
          if (node.isDataRow) {
            console.warn(
              "md-data-grid: two rows resolved to the same getDataPath(); the later row was skipped",
              row,
            );
          } else {
            // Upgrade: synthetic placeholder -> real row. `parent.children`
            // needs no change (still keyed by `segment`) — only the node's
            // public key moves; any children already attached keep their
            // `.parent` pointer correct for free, since it's the same node
            // object throughout.
            byKey.delete(/** @type {PropertyKey} */ (node.key));
            Object.assign(node, row);
            node.parent = parent;
            node.depth = depth;
            node.key = this.host.getRowId(row);
            node.isDataRow = true;
            node.groupingKey = segment;
            byKey.set(/** @type {PropertyKey} */ (node.key), node);
          }
        }
        // Passing through an existing node as a non-final segment never
        // touches its identity — just descend.

        parent = node;
      }
    }

    this.tree = root;
    this._byKey = byKey;
    return root;
  }

  /**
   * Flat, pre-order array of every row currently in the tree — real rows
   * *and* synthetic group nodes, regardless of expand/collapse state. The
   * root itself is never included. Deliberately collapse-state-ignorant:
   * this is what "select all" needs, spanning the whole dataset the same
   * way `RowSelectionController.toggleAll()` already operates over
   * `host.rows` rather than the currently-visible/paginated subset.
   * @returns {IndexTreeNode<Record<string, unknown>>[]}
   */
  get rows() {
    return /** @type {IndexTreeNode<Record<string, unknown>>[]} */ (
      [...this.tree].slice(1)
    );
  }

  /**
   * Collapse-aware pre-order walk: every visible row, skipping a node's
   * descendants when it has children but its key isn't in
   * `expandedGroupIds`. In flat mode (no node ever has children) this
   * returns exactly what `.rows` returns.
   * @param {Set<PropertyKey>} expandedGroupIds
   * @returns {IndexTreeNode<Record<string, unknown>>[]}
   */
  visibleRows(expandedGroupIds) {
    /** @type {IndexTreeNode<Record<string, unknown>>[]} */
    const out = [];
    /** @param {IndexTree<Record<string, unknown>>} node */
    const walk = (node) => {
      for (const [, child] of node.children) {
        const childNode =
          /** @type {IndexTreeNode<Record<string, unknown>>} */ (child);
        out.push(childNode);
        if (
          childNode.children.size > 0 &&
          expandedGroupIds.has(/** @type {PropertyKey} */ (childNode.key))
        ) {
          walk(childNode);
        }
      }
    };
    walk(this.tree);
    return out;
  }

  /**
   * Same collapse-aware walk as `visibleRows()`, but sorts each node's own
   * children (via `compareRows`) before recursing into them — hierarchy-
   * preserving sort, applied at every level including top-level groups
   * under the root. `compareRows` may be `null` (nothing actively sorting,
   * same contract as `SortController.createComparator()`) — children then
   * stay in build/insertion order. Sorts a copy of each level's children,
   * never mutating `children`'s own Map order, matching
   * `SortController.sortedRows()`'s own never-mutate-input convention.
   * @param {((a: Record<string, unknown>, b: Record<string, unknown>) => number) | null} compareRows
   * @param {Set<PropertyKey>} expandedGroupIds
   * @returns {IndexTreeNode<Record<string, unknown>>[]}
   */
  sortedVisibleRows(compareRows, expandedGroupIds) {
    /** @type {IndexTreeNode<Record<string, unknown>>[]} */
    const out = [];
    /** @param {IndexTree<Record<string, unknown>>} node */
    const walk = (node) => {
      const children =
        /** @type {IndexTreeNode<Record<string, unknown>>[]} */ ([
          ...node.children.values(),
        ]);
      if (compareRows) children.sort(compareRows);
      for (const childNode of children) {
        out.push(childNode);
        if (
          childNode.children.size > 0 &&
          expandedGroupIds.has(/** @type {PropertyKey} */ (childNode.key))
        ) {
          walk(childNode);
        }
      }
    };
    walk(this.tree);
    return out;
  }

  /**
   * Every id (real or synthetic) in `key`'s subtree, pre-order — the basis
   * for cascading checkbox selection. Includes `key` itself by default,
   * the natural shape for "toggle this group and everything under it."
   * @param {PropertyKey} key
   * @param {{ includeSelf?: boolean }} [options]
   * @returns {PropertyKey[]}
   */
  getDescendantIds(key, { includeSelf = true } = {}) {
    const node = this.getNode(key);
    if (!node) return [];
    /** @type {PropertyKey[]} */
    const ids = [];
    for (const n of node) {
      if (!includeSelf && n === node) continue;
      ids.push(/** @type {PropertyKey} */ (n.key));
    }
    return ids;
  }

  /**
   * Full next `rowSelectionModel` for a checkbox click on `key` (real row
   * or synthetic group) under treeData — two phases:
   *
   * 1. **Down**: `key`'s own subtree (self + every descendant) is
   *    added/removed together — same all-selected? shrink : grow decision
   *    `RowSelectionController.toggleAllIds()` uses for its own wholesale
   *    replace, applied here to just this one subtree instead.
   * 2. **Up**: from `key`'s parent to the root, each ancestor's own id
   *    joins the selection once *every one* of its direct children is
   *    selected, and leaves it otherwise. Without this, checking every
   *    child individually (never clicking the parent's own checkbox)
   *    would leave the parent permanently `indeterminate` —
   *    `getCheckboxState()` requires a group's own id to be a member for
   *    `checked` to be true, and nothing else ever adds it. This is what
   *    makes "select all children -> parent becomes selected" true of the
   *    model itself, not just a display quirk fixed in the checkbox's own
   *    rendering.
   *
   * Pure — returns a new `Set`, never mutates `rowSelectionModel`.
   * @param {PropertyKey} key
   * @param {Set<PropertyKey>} rowSelectionModel
   * @returns {Set<PropertyKey>}
   */
  computeCascadingSelection(key, rowSelectionModel) {
    const ids = this.getDescendantIds(key);
    const allSelected =
      ids.length > 0 && ids.every((id) => rowSelectionModel.has(id));
    const next = new Set(rowSelectionModel);
    for (const id of ids) {
      if (allSelected) next.delete(id);
      else next.add(id);
    }

    let node = this.getNode(key)?.parent;
    while (node && node.parent) {
      const childKeys = [...node.children.values()].map(
        (child) => /** @type {PropertyKey} */ (child.key),
      );
      const allChildrenSelected =
        childKeys.length > 0 &&
        childKeys.every((childKey) => next.has(childKey));
      const nodeKey = /** @type {PropertyKey} */ (node.key);
      if (allChildrenSelected) next.add(nodeKey);
      else next.delete(nodeKey);
      node = node.parent;
    }

    return next;
  }

  /**
   * A group's checkbox state, derived by walking its subtree against
   * `rowSelectionModel` — `checked` when every id in the subtree (self
   * included) is selected, `indeterminate` when only some are. Takes
   * `rowSelectionModel` as a plain argument rather than reading
   * `host.rowSelectionModel` itself — `TreeController` stays coupled only
   * to the `Set` type, never to `RowSelectionController`'s existence,
   * matching how `RowSpanController.computeSpans(rows)`/
   * `SortController.sortedRows(rows)` already take their data as
   * parameters instead of reaching into the host for it.
   * @param {PropertyKey} key
   * @param {Set<PropertyKey>} rowSelectionModel
   * @returns {{ checked: boolean, indeterminate: boolean }}
   */
  getCheckboxState(key, rowSelectionModel) {
    const node = this.getNode(key);
    if (!node) return { checked: false, indeterminate: false };
    let total = 0;
    let selected = 0;
    for (const n of node) {
      total++;
      if (rowSelectionModel.has(/** @type {PropertyKey} */ (n.key))) selected++;
    }
    return {
      checked: total > 0 && selected === total,
      indeterminate: selected > 0 && selected < total,
    };
  }

  /**
   * O(1) lookup by row id (real or synthetic), backed by the `_byKey` map
   * populated during the most recent `build()` — not a tree walk. A miss
   * means the key genuinely isn't in the tree as of the last build, not
   * that it's nested somewhere a linear scan would still have found;
   * `build()` keeps `_byKey` and the tree structure in lockstep by
   * construction, so there's no separate fallback path to keep in sync.
   * @param {PropertyKey} id
   * @returns {IndexTreeNode<Record<string, unknown>> | undefined}
   */
  getNode(id) {
    return this._byKey.get(id);
  }
}
