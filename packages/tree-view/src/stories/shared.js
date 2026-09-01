import "../index.js";
import "@symblight/wc-material/icon";

import fileIcon from "@material-design-icons/svg/outlined/insert_drive_file.svg?raw";

export { fileIcon };

/** @param {string} svg */
export function icon(svg) {
  const el = document.createElement("md-icon");
  el.innerHTML = svg;
  return el;
}

/**
 * @typedef {object} TreeNodeData
 * @property {string} id
 * @property {string} label
 * @property {TreeNodeData[]} [children]
 * @property {boolean} [hasChildren]
 * @property {number} [childCount]
 * @property {string} [icon]
 * @property {boolean} [directory]
 * @property {boolean} [disabled]
 */

/** Builds a fresh `<tvx-tree-item>` subtree from a plain description; each story needs its own
 * instances — DOM elements can't be reused across two separately-rendered trees.
 * @param {TreeNodeData} data */
export function buildItem({
  id,
  label,
  children = [],
  hasChildren,
  childCount,
  icon: iconSvg,
  directory,
  disabled,
}) {
  const item = document.createElement("tvx-tree-item");
  item.key = id;
  item.label = label;
  if (hasChildren) item.hasChildren = true;
  if (typeof childCount === "number") item.childCount = childCount;
  if (disabled) item.disabled = true;
  if (directory) {
    const dirIcon = document.createElement("tvx-tree-directory-icon");
    dirIcon.slot = "leading";
    item.append(dirIcon);
  } else if (iconSvg) {
    const iconEl = icon(iconSvg);
    iconEl.slot = "leading";
    item.append(iconEl);
  }
  // A branch's children live in their own `<tvx-item-sub-tree>` sibling — no `slot="..."`
  // needed, it auto-slots.
  if (children.length > 0) {
    const subTree = document.createElement("tvx-item-sub-tree");
    subTree.append(...children.map(buildItem));
    item.append(subTree);
  }
  return item;
}

/** A folder node — icon swaps open/closed via `tvx-tree-directory-icon`.
 * @param {TreeNodeData} data */
export function folder(data) {
  return { ...data, directory: true };
}

/** A file node — same plain icon every leaf in these stories uses.
 * @param {TreeNodeData} data */
export function file(data) {
  return { ...data, icon: fileIcon };
}

export function buildFileTree() {
  return [
    buildItem(
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
    ),
    buildItem(file({ id: "gitignore", label: ".gitignore" })),
    buildItem(file({ id: "readme", label: "README.md" })),
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
