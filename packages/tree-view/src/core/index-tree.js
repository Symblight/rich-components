/**
 * Keyed, ordered n-ary tree; the root is synthetic (`key: null`, no `value`). Every node shares the
 * root's `byKey` index, so lookup by key is O(1) and keys are unique across the whole tree.
 * @template T
 * @typedef {{
 *   key: PropertyKey | null,
 *   value?: T,
 *   parent: IndexTree<T> | null,
 *   children: IndexTree<T>[] | null,
 *   byKey: Map<PropertyKey, IndexTree<T>>,
 * }} IndexTree
 * `children` is `null` while a node's children aren't loaded (a leaf, or a lazy branch).
 */

/**
 * @template T
 * @typedef {{ getKey: (item: T) => PropertyKey, getChildren?: (item: T) => T[] | undefined }} IndexTreeOptions
 */

/**
 * @template T
 * @returns {IndexTree<T>} A fresh synthetic root with no children.
 */
export function createEmptyIndexTree() {
  return { key: null, parent: null, children: [], byKey: new Map() };
}

/**
 * Adds a child under `parent` at `index` (the end by default). An existing node with the same key
 * is removed first, wherever it is.
 * @template T
 * @param {IndexTree<T>} parent
 * @param {PropertyKey} key
 * @param {T} value
 * @param {number} [index]
 * @returns {IndexTree<T>}
 */
export function insertIndexTree(parent, key, value, index) {
  const existing = parent.byKey.get(key);
  if (existing) removeIndexTree(existing);
  /** @type {IndexTree<T>} */
  const node = { key, value, parent, children: null, byKey: parent.byKey };
  parent.children ??= [];
  parent.children.splice(index ?? parent.children.length, 0, node);
  parent.byKey.set(key, node);
  return node;
}

/**
 * Detaches `node` from its parent and drops it and its subtree from the index.
 * @template T
 * @param {IndexTree<T>} node
 * @returns {void}
 */
export function removeIndexTree(node) {
  detach(node);
  for (const descendant of walkIndexTree(node)) {
    if (descendant.key !== null) node.byKey.delete(descendant.key);
  }
}

/**
 * The node with `key` anywhere in `tree`'s tree, or `null`.
 * @template T
 * @param {IndexTree<T>} tree
 * @param {PropertyKey} key
 * @returns {IndexTree<T> | null}
 */
export function findIndexTree(tree, key) {
  return tree.byKey.get(key) ?? null;
}

/**
 * `node` itself, then every loaded descendant, pre-order.
 * @template T
 * @param {IndexTree<T>} node
 * @returns {IterableIterator<IndexTree<T>>}
 */
export function* walkIndexTree(node) {
  yield node;
  for (const child of node.children ?? []) yield* walkIndexTree(child);
}

/**
 * @template T
 * @param {IndexTree<T>} ancestor
 * @param {IndexTree<T>} node
 */
export function isAncestorIndexTree(ancestor, node) {
  for (let p = node.parent; p; p = p.parent) if (p === ancestor) return true;
  return false;
}

/**
 * @template T
 * @param {IndexTree<T>} node
 * @returns {{ parent: IndexTree<T> | null, index: number }}
 */
export function positionIndexTree(node) {
  return { parent: node.parent, index: node.parent?.children?.indexOf(node) ?? -1 };
}

/**
 * Moves `node` under `parent` at `index`, counted without `node` itself.
 * @template T
 * @param {IndexTree<T>} node
 * @param {IndexTree<T>} parent
 * @param {number} index
 * @returns {boolean} `false` when `parent` is `node` or inside its subtree
 */
export function moveIndexTree(node, parent, index) {
  if (parent === node || isAncestorIndexTree(node, parent)) return false;
  detach(node);
  parent.children ??= [];
  parent.children.splice(index, 0, node);
  node.parent = parent;
  return true;
}

/**
 * Replaces `node`'s children with `items` (recursively); `null` marks them not loaded.
 * @template T
 * @param {IndexTree<T>} node
 * @param {T[] | null} items
 * @param {IndexTreeOptions<T>} options
 * @returns {void}
 */
export function setIndexTreeChildren(node, items, options) {
  for (const child of [...(node.children ?? [])]) removeIndexTree(child);
  node.children = items === null ? null : [];
  if (items) addItems(node, items, options);
}

/**
 * Converts a `.items`-shaped array (recursive `{ ...value, children? }` objects) into an
 * `IndexTree`. An item without children (or with an empty array) gets `children: null`.
 * @template T
 * @param {T[]} items
 * @param {IndexTreeOptions<T>} options
 * @returns {IndexTree<T>}
 */
export function buildIndexTree(items, options) {
  /** @type {IndexTree<T>} */
  const root = createEmptyIndexTree();
  addItems(root, items, options);
  return root;
}

/**
 * @template T
 * @param {IndexTree<T>} parent
 * @param {T[]} items
 * @param {IndexTreeOptions<T>} options
 */
function addItems(parent, items, { getKey, getChildren }) {
  const resolveChildren =
    getChildren ?? ((item) => /** @type {{ children?: T[] }} */ (item).children);
  /** @type {(parent: IndexTree<T>, list: T[]) => void} */
  const walk = (parent, list) => {
    for (const item of list) {
      const node = insertIndexTree(parent, getKey(item), item);
      const children = resolveChildren(item);
      if (children?.length) walk(node, children);
    }
  };
  walk(parent, items);
}

/** @template T @param {IndexTree<T>} node */
function detach(node) {
  const siblings = node.parent?.children;
  if (siblings) siblings.splice(siblings.indexOf(node), 1);
  node.parent = null;
}
