import { createContext } from "@lit/context";

/**
 * @typedef {object} TreeViewContextValue
 * @property {boolean} multiSelect
 * @property {boolean} disableSelection
 * @property {boolean} checkboxSelection
 * @property {(node: import("../components/tree-item/tree-item.js").TvxTreeItem) => string | undefined} [getHref]
 * @property {boolean} reordering
 * @property {(item: import("../components/tree-item/tree-item.js").TvxTreeItem) => boolean} [isItemReorderable]
 */

/** @type {import("@lit/context").Context<"tvx-tree-view-context", TreeViewContextValue>} */
export const treeViewContext = createContext("tvx-tree-view-context");
