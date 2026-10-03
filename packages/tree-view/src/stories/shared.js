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

/** The `trailingIcon` of an item, if it has one.
 * @type {import("../base/tree-view.js").TvxTreeItemRenderer} */
export const renderTrailingIcon = (item) =>
  item.trailingIcon ? icon(item.trailingIcon) : undefined;

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

/** Writes into a log `<pre>` rendered with `ref()`.
 * @param {import("lit/directives/ref.js").Ref<HTMLElement>} log
 * @param {string} text */
export function writeLog(log, text) {
  if (log.value) log.value.textContent = text;
}

/** Layout shared by every story: `story` column, `story__hint`, `story__controls`, `story__log`. */
export const storyStyles = html`<style>
  .story {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .story__hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--md-sys-color-on-surface-variant, #666);
  }
  .story__controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .story__log {
    margin: 0;
    font-size: 0.75rem;
  }
</style>`;
