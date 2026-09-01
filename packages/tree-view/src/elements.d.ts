import { TvxTreeView } from "./base/tree-view.js";
import { TvxTreeItem } from "./components/tree-item/tree-item.js";

declare global {
  interface HTMLElementTagNameMap {
    "tvx-tree-view": TvxTreeView;
    "tvx-tree-item": TvxTreeItem;
  }
}

export {};
