import { TvxTreeView } from "./base/tree-view.js";
import { TvxTreeItem } from "./components/tree-item/tree-item.js";
import { TvxItemSubTree } from "./components/item-sub-tree/item-sub-tree.js";
import { TvxTreeSkeleton } from "./components/tree-skeleton/tree-skeleton.js";
import { TvxTreeDirectoryIcon } from "./components/tree-directory-icon/tree-directory-icon.js";

declare global {
  interface HTMLElementTagNameMap {
    "tvx-tree-view": TvxTreeView;
    "tvx-tree-item": TvxTreeItem;
    "tvx-item-sub-tree": TvxItemSubTree;
    "tvx-tree-skeleton": TvxTreeSkeleton;
    "tvx-tree-directory-icon": TvxTreeDirectoryIcon;
  }
}

export {};
