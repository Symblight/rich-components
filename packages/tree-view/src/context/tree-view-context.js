import { createContext } from "@lit/context";

/**
 * The nearest `tvx-tree-view`, provided by the tree itself and consumed by `TreeViewController`
 * when it isn't given an explicit target.
 * @type {import("@lit/context").Context<symbol, import("../base/tree-view.js").TvxTreeView>}
 */
export const treeViewContext = createContext(Symbol.for("@symblight/tree-view/tree"));
