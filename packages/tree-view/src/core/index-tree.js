/**
 * @template T
 * @typedef {{
 *   value?: T,
 *   children: Map<PropertyKey, IndexTree<T>>,
 *   parent: IndexTree<T> | null,
 *   key: PropertyKey | null,
 *   readonly size: number,
 *   [Symbol.iterator](): IterableIterator<IndexTree<T>>,
 * }} IndexTree
 */

/**
 * @template T
 * @returns {IndexTree<T>}
 */
export function createEmptyIndexTree() {
  /** @type {IndexTree<T>} */
  const self = {
    children: new Map(),
    parent: null,
    key: null,
    [Symbol.iterator]: function* () {
      yield self;
      for (const [, child] of self.children) yield* child;
    },
    get size() {
      return [...self[Symbol.iterator]()].length;
    },
  };
  return self;
}

/**
 * @template T
 * @param {IndexTree<T>} parent
 * @param {PropertyKey} key
 * @param {T} value
 * @returns {IndexTree<T>}
 */
export function insertIndexTree(parent, key, value) {
  const node = /** @type {IndexTree<T>} */ (createEmptyIndexTree());
  node.parent = parent;
  node.key = key;
  node.value = value;
  parent.children.set(key, node);
  return node;
}

/**
 * @template T
 * @param {IndexTree<T>} node
 */
export function removeIndexTree(node) {
  if (node.key !== null) node.parent?.children.delete(node.key);
  node.parent = null;
}

/**
 * @template T
 * @param {IndexTree<T>} root
 * @param {PropertyKey} key
 * @returns {IndexTree<T>|null}
 */
export function findIndexTree(root, key) {
  for (const node of root) if (node.key === key) return node;
  return null;
}

/**
 * Converts a `.items`-shaped array (recursive `{ ...value, children? }` objects) into an
 * `IndexTree`.
 * @template T
 * @param {T[]} items
 * @param {{ getKey: (item: T) => PropertyKey, getChildren?: (item: T) => T[] | undefined }} options
 * @returns {IndexTree<T>}
 */
export function buildIndexTree(items, { getKey, getChildren }) {
  const resolveChildren =
    getChildren ?? ((item) => /** @type {{ children?: T[] }} */ (item).children);
  const root = createEmptyIndexTree();
  /** @type {(parent: IndexTree<T>, list: T[] | undefined) => void} */
  const walk = (parent, list) => {
    for (const item of list ?? []) {
      walk(insertIndexTree(parent, getKey(item), item), resolveChildren(item));
    }
  };
  walk(root, items);
  return root;
}

/**
 * Pre-order DFS that stops descending into a node's children once `isExpanded(node)` is false —
 * the flat, currently-visible sequence keyboard navigation/typeahead walk for ArrowUp/Down/Home/End.
 * @template T
 * @param {IndexTree<T>} root
 * @param {(node: IndexTree<T>) => boolean} isExpanded
 * @returns {IterableIterator<IndexTree<T>>}
 */
export function* visibleIndexNodes(root, isExpanded) {
  for (const [, child] of root.children) {
    yield child;
    if (isExpanded(child)) yield* visibleIndexNodes(child, isExpanded);
  }
}
