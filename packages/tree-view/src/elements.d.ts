import { TvxTreeView } from "./base/tree-view.js";
import { TvxTreeDirectoryIcon } from "./components/tree-directory-icon/tree-directory-icon.js";

declare global {
  interface HTMLElementTagNameMap {
    "tvx-tree-view": TvxTreeView;
    "tvx-tree-directory-icon": TvxTreeDirectoryIcon;
  }
}

export {};
