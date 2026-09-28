import { html } from "lit";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import "../index.js";
import "@symblight/wc-material/icon";

import fileIcon from "@material-design-icons/svg/outlined/insert_drive_file.svg?raw";

export { fileIcon };

/**
 * @typedef {object} TreeNodeData
 * @property {string} id
 * @property {string} label
 * @property {TreeNodeData[]} [children]
 * @property {boolean} [directory]
 * @property {boolean} [disabled]
 * @property {string} [trailingIcon] raw SVG
 */

/** @param {string} svg */
export function icon(svg) {
  return html`<md-icon>${unsafeSVG(svg)}</md-icon>`;
}

/** @param {Omit<TreeNodeData, "directory">} data
 * @returns {TreeNodeData} */
export function folder(data) {
  return { ...data, directory: true };
}

/** @param {TreeNodeData} data */
export function file(data) {
  return data;
}

/** Folder icon that opens with the branch, file icon otherwise.
 * @type {import("../base/tree-view.js").TvxTreeItemRenderer} */
export const renderFileIcon = (item, { expanded }) =>
  item.directory
    ? html`<tvx-tree-directory-icon ?expanded=${expanded}></tvx-tree-directory-icon>`
    : icon(fileIcon);

/** @type {import("../base/tree-view.js").TvxTreeItemRenderer} */
const renderTrailingIcon = (item) => (item.trailingIcon ? icon(item.trailingIcon) : undefined);

/** A `tvx-tree-view` with the stories' shared file/folder icons, plus any extra properties.
 * @param {Partial<import("../base/tree-view.js").TvxTreeView>} [props] */
export function createTree(props = {}) {
  const tree = document.createElement("tvx-tree-view");
  tree.renderItemLeading = renderFileIcon;
  tree.renderItemTrailing = renderTrailingIcon;
  Object.assign(tree, props);
  return tree;
}

/** @returns {TreeNodeData[]} */
export function buildFileTree() {
  return [
    folder({
      id: "src",
      label: "src/",
      children: [
        folder({
          id: "components",
          label: "components/",
          children: [file({ id: "button", label: "button.js" })],
        }),
        file({ id: "index", label: "index.js" }),
      ],
    }),
    file({ id: "gitignore", label: ".gitignore" }),
    file({ id: "readme", label: "README.md" }),
  ];
}

/** A `<pre>` element for logging event payloads next to a demo tree. */
export function logPanel() {
  const log = document.createElement("pre");
  log.style.fontSize = "0.75rem";
  log.style.margin = "0";
  return log;
}

/** @param {string} text */
export function hintText(text) {
  const hint = document.createElement("p");
  hint.style.fontSize = "0.8rem";
  hint.style.color = "var(--md-sys-color-on-surface-variant, #666)";
  hint.style.margin = "0";
  hint.textContent = text;
  return hint;
}

/** @param {string} label
 * @param {() => void} onClick */
export function button(label, onClick) {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = label;
  el.addEventListener("click", onClick);
  return el;
}

/** A wrapping row of controls. @param {...HTMLElement} children */
export function controls(...children) {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.flexWrap = "wrap";
  row.style.gap = "0.5rem";
  row.append(...children);
  return row;
}

/** A column wrapper — every multi-part story (hint/controls + tree + log) uses the same layout.
 * @param {...HTMLElement} children */
export function stack(...children) {
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.gap = "0.5rem";
  wrapper.append(...children);
  return wrapper;
}
