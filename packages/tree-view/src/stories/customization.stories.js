import { html } from "lit";
import { createRef, ref } from "lit/directives/ref.js";

import "@symblight/wc-material/menu";
import "@symblight/wc-material/tooltip";

import {
  buildFileTree,
  renderFileIcon,
  renderTrailingIcon,
  storyStyles,
  writeLog,
} from "./shared.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Tree View/Customization",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Row content comes from `renderItemLeading`/`renderItemLabel`/`renderItemTrailing(item, " +
          "state)`; the tree keeps the chevron, checkbox and ARIA. Styling goes through `::part()` " +
          "(`row`, `chevron`, `checkbox`, `leading`, `label`, `trailing`, `placeholder`) and tokens in " +
          "three tiers — `--md-sys-*` → `--tvx-tree-view-*` → `--tvx-tree-item-*`, all set on " +
          "`tvx-tree-view`. Any of them accepts a literal CSS value. Context menus come from a " +
          "`contextmenu` listener and `tree.nodes.getIdFromEvent(event)`.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** @type {Story} */
export const CustomizedTree = {
  render: () => html`
    ${storyStyles}
    <style>
      .customization-tree {
        --tvx-tree-item-shape: 0.2rem;
        --tvx-tree-item-chevron-color: #7c3aed;
        --tvx-tree-item-hover-background-color: #f5f3ff;
        --tvx-tree-item-selected-background-color: #ede9fe;
        --tvx-tree-item-selected-color: #5b21b6;
        --tvx-tree-item-focus-outline-color: #7c3aed;
      }
      .customization-tree::part(label) {
        letter-spacing: 0.02em;
      }
    </style>
    <div class="story">
      <p class="story__hint">
        renderItemLabel bolds folders and marks selected files; the purple palette and 0.2rem row
        shape are --tvx-tree-item-* tokens set as literal values on the tree.
      </p>
      <tvx-tree-view
        class="customization-tree"
        multi-select
        checkbox-selection
        .items=${buildFileTree()}
        .defaultExpandedItems=${new Set(["src", "components"])}
        .renderItemLeading=${renderFileIcon}
        .renderItemTrailing=${renderTrailingIcon}
        .renderItemLabel=${(/** @type {any} */ item, /** @type {any} */ { selected }) =>
          item.directory
            ? html`<strong>${item.label}</strong>`
            : html`${item.label}${selected ? " ✓" : ""}`}
      ></tvx-tree-view>
    </div>
  `,
};

/** @typedef {"modified" | "added" | "deleted" | "renamed" | "untracked" | "conflict" | "ignored"} GitStatus */

/** Label color, VS Code-style status letter, and label decoration for each git status. */
const GIT_STATUS = {
  modified: { color: "#1f6feb", letter: "M", title: "Modified" },
  added: { color: "#1a7f37", letter: "A", title: "Added" },
  deleted: { color: "#cf222e", letter: "D", title: "Deleted", strike: true },
  renamed: { color: "#0e7490", letter: "R", title: "Renamed" },
  untracked: { color: "#c2410c", letter: "U", title: "Untracked" },
  conflict: { color: "#d1242f", letter: "!", title: "Merge conflict" },
  ignored: { color: "#8c959f", letter: "I", title: "Ignored" },
};

/** Folders take the most significant status among their descendants. */
const STATUS_PRIORITY = [
  "conflict",
  "deleted",
  "modified",
  "renamed",
  "added",
  "untracked",
  "ignored",
];

/**
 * @typedef {object} GitNode
 * @property {string} id
 * @property {string} label
 * @property {boolean} [directory]
 * @property {GitNode[]} [children]
 * @property {GitStatus} [status]
 * @property {number} [added] lines added
 * @property {number} [removed] lines removed
 * @property {string} [from] previous name of a renamed file
 */

/** @param {string} id @param {string} label @param {GitStatus} [status] @param {number} [added] @param {number} [removed] @returns {GitNode} */
const gitFile = (id, label, status, added, removed) => ({ id, label, status, added, removed });

/** @returns {GitNode[]} */
function buildGitTree() {
  return [
    {
      id: "src",
      label: "src",
      directory: true,
      children: [
        {
          id: "src/components",
          label: "components",
          directory: true,
          children: [
            gitFile("button", "button.js", "modified", 12, 3),
            gitFile("dialog", "dialog.js", "added", 148, 0),
            gitFile("menu", "menu.js"),
            { ...gitFile("tooltip", "tooltip.js", "renamed", 2, 2), from: "hint.js" },
            gitFile("legacy-card", "legacy-card.js", "deleted", 0, 87),
          ],
        },
        {
          id: "src/core",
          label: "core",
          directory: true,
          children: [gitFile("emit", "emit.js"), gitFile("store", "store.js", "conflict", 9, 14)],
        },
        gitFile("index", "index.js", "modified", 1, 1),
      ],
    },
    {
      id: "docs",
      label: "docs",
      directory: true,
      children: [gitFile("guide", "guide.md", "untracked", 42, 0), gitFile("faq", "faq.md")],
    },
    {
      id: "dist",
      label: "dist",
      directory: true,
      children: [gitFile("bundle", "bundle.js", "ignored")],
    },
    gitFile("gitignore", ".gitignore"),
    gitFile("package", "package.json", "modified", 3, 1),
    gitFile("readme", "README.md"),
  ];
}

/** Rolls file changes up into every folder: dominant status and changed-file count.
 * @param {GitNode[]} nodes */
function rollUpGitChanges(nodes) {
  /** @type {Map<string, { status?: GitStatus, count: number }>} */
  const summary = new Map();
  /** @param {GitNode} node */
  const visit = (node) => {
    if (!node.directory) {
      const changed = node.status && node.status !== "ignored";
      return { status: node.status, count: changed ? 1 : 0 };
    }
    const acc = {
      status: /** @type {GitStatus | undefined} */ (undefined),
      count: 0,
    };
    for (const child of node.children ?? []) {
      const c = visit(child);
      acc.count += c.count;
      if (
        c.status &&
        (!acc.status || STATUS_PRIORITY.indexOf(c.status) < STATUS_PRIORITY.indexOf(acc.status))
      ) {
        acc.status = c.status;
      }
    }
    summary.set(node.id, acc);
    return acc;
  };
  nodes.forEach(visit);
  return summary;
}

/** `+12 −3` diff stat; zero sides are hidden. @param {number} added @param {number} removed */
const diffStat = (added, removed) => html`
  ${added ? html`<span style="color:#1a7f37">+${added}</span>` : ""}
  ${removed ? html`<span style="color:#cf222e">−${removed}</span>` : ""}
`;

/** @type {Story} */
export const GitChanges = {
  render: () => {
    const items = buildGitTree();
    const folders = rollUpGitChanges(items);

    /** @param {GitNode} item */
    const statusOf = (item) => (item.directory ? folders.get(item.id)?.status : item.status);

    /** @type {import("../base/tree-view.js").TvxTreeItemRenderer} */
    const renderLabel = (/** @type {GitNode} */ item, { label }) => {
      const status = statusOf(item);
      const meta = status ? GIT_STATUS[status] : undefined;
      // folders inherit the color (JetBrains), but only files get struck through
      const style = [
        meta ? `color:${meta.color}` : "",
        meta?.strike && !item.directory ? "text-decoration:line-through" : "",
        status === "ignored" ? "opacity:0.7" : "",
      ].join(";");
      return html`<span style=${style}>${label}</span>${
          item.from ? html`<span style="opacity:0.6;font-size:0.85em"> ← ${item.from}</span>` : ""
        }`;
    };

    /** @type {import("../base/tree-view.js").TvxTreeItemRenderer} */
    const renderTrailing = (/** @type {GitNode} */ item) => {
      const box =
        "display:inline-flex;align-items:center;gap:0.375rem;font:500 0.75rem/1 ui-monospace,monospace";
      if (item.directory) {
        const roll = folders.get(item.id);
        if (!roll?.count) return undefined;
        const meta = GIT_STATUS[/** @type {GitStatus} */ (roll.status)];
        // VS Code-style dot + count of changed files beneath
        return html`<span style=${box} title="${roll.count} changed">
          <span style="color:${meta.color}">${roll.count}</span>
          <span
            style="inline-size:0.4rem;block-size:0.4rem;border-radius:50%;background:${meta.color}"
          ></span>
        </span>`;
      }
      if (!item.status) return undefined;
      const meta = GIT_STATUS[item.status];
      return html`<span style=${box}>
        ${diffStat(item.added ?? 0, item.removed ?? 0)}
        <span
          style="color:${meta.color};min-inline-size:0.75rem;text-align:center"
          title=${meta.title}
          >${meta.letter}</span
        >
      </span>`;
    };

    return html`
      ${storyStyles}
      <div class="story">
        <p class="story__hint">
          Git decorations à la VS Code / JetBrains: renderItemLabel colors names by status (folders
          inherit their most significant child status), renderItemTrailing adds +/− line counts and
          a status letter on files, a changed-file count and dot on folders.
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:0.75rem;font:0.75rem ui-monospace,monospace">
          ${Object.values(GIT_STATUS).map(
            (meta) => html`<span style="color:${meta.color}">${meta.letter} ${meta.title}</span>`,
          )}
        </div>
        <tvx-tree-view
          style="max-inline-size: 26rem;"
          .items=${items}
          .defaultExpandedItems=${new Set(["src", "src/components", "src/core", "docs"])}
          .renderItemLeading=${renderFileIcon}
          .renderItemLabel=${renderLabel}
          .renderItemTrailing=${renderTrailing}
        ></tvx-tree-view>
      </div>
    `;
  },
};

/** @typedef {import("../base/tree-view.js").TvxTreeView} TvxTreeView */

/** @param {any[]} items @param {PropertyKey} id @returns {any[]} */
const removeItem = (items, id) =>
  items
    .filter((item) => item.id !== id)
    .map((item) => (item.children ? { ...item, children: removeItem(item.children, id) } : item));

/** @type {Story} */
export const ContextMenu = {
  render: () => {
    /** @type {import("lit/directives/ref.js").Ref<TvxTreeView>} */
    const tree = createRef();
    /** @type {import("lit/directives/ref.js").Ref<any>} */
    const menu = createRef();
    /** @type {import("lit/directives/ref.js").Ref<HTMLElement>} */
    const log = createRef();
    /** @type {PropertyKey | null} */
    let menuItemId = null;

    /** @param {MouseEvent} event */
    const onContextMenu = async (event) => {
      const id = tree.value?.nodes.getIdFromEvent(event) ?? null;
      if (id === null) return; // empty area → the browser's own menu
      event.preventDefault();
      const row = event.composedPath()[0]; // empty once dispatch ends, i.e. after the first await
      // the menu replaces the label's hover tooltip
      /** @type {any} */ (
        event
          .composedPath()
          .find((node) => node instanceof HTMLElement && node.matches(".tree-view__item"))
      )
        ?.querySelector("md-tooltip")
        ?.hide();
      const itemMenu = menu.value;
      await itemMenu.close({ returnFocus: false }); // already open for another row
      menuItemId = id;
      // no `for`, so nothing names the menu
      itemMenu.setAttribute("aria-label", `${tree.value?.nodes.getItem(id)?.label} actions`);
      if (event.button === 2) {
        itemMenu.anchorElement = undefined;
        itemMenu.openAtPoint(event.clientX, event.clientY);
        await itemMenu.updateComplete;
      } else {
        // Shift+F10 / ContextMenu key: coordinates vary by browser, anchor to the focused row
        itemMenu.anchorElement = row;
        await itemMenu.show();
      }
      // only md-menu's own triggers move focus in; APG wants it on the first item
      itemMenu.focusFirstItem();
    };

    /** @param {CustomEvent<{ value: string }>} event */
    const onSelect = (event) => {
      const treeView = /** @type {TvxTreeView} */ (tree.value);
      if (menuItemId === null) return;
      const label = treeView.nodes.getItem(menuItemId)?.label;
      writeLog(log, `${event.detail.value}: ${label}`);
      if (event.detail.value === "rename") treeView.editing.start(menuItemId);
      if (event.detail.value === "delete") {
        // focus moves to the next sibling, else the previous one, else the parent
        const position = treeView.nodes.getPosition(menuItemId);
        const parentId = position?.parentId ?? null;
        const siblings = treeView.nodes.getChildIds(parentId);
        const index = position?.index ?? 0;
        const next = siblings[index + 1] ?? siblings[index - 1] ?? parentId;
        treeView.items = removeItem(treeView.items ?? [], menuItemId);
        menuItemId = next;
      }
    };

    // without `for` the menu has nowhere to return focus — hand it back to the row
    const onClosed = () => {
      if (menu.value.open || document.activeElement !== document.body) return;
      if (menuItemId !== null) tree.value?.navigation.focusItem(menuItemId);
    };

    /** Renames kept by the tree; `nodes.getItem` still has the original labels. @type {Map<PropertyKey, string>} */
    const renamed = new Map();
    /** @param {CustomEvent<{ id: PropertyKey, newLabel: string }>} event */
    const onLabelChange = ({ detail }) => renamed.set(detail.id, detail.newLabel);

    /** Full path from the current labels, so it follows renames. @param {PropertyKey} id */
    const pathOf = (id) => {
      const labels = [];
      for (let at = /** @type {PropertyKey | null} */ (id); at !== null;) {
        labels.unshift(renamed.get(at) ?? tree.value?.nodes.getItem(at)?.label ?? "");
        at = tree.value?.nodes.getParentId(at) ?? null;
      }
      return labels.join("");
    };

    // mouse-only hint: focus sits on the treeitem, so keyboard and screen readers never get it
    /** @type {import("../base/tree-view.js").TvxTreeItemRenderer} */
    const renderLabel = (_item, { id, label }) => html`
      <span id="tip-${String(id)}">${label}</span>
      <md-tooltip for="tip-${String(id)}" placement="right">${pathOf(id)}</md-tooltip>
    `;

    return html`
      ${storyStyles}
      <div class="story">
        <p class="story__hint">
          Right-click a row, or focus it and press Shift+F10 / the ContextMenu key. One shared
          md-menu (no for, no trigger) opens at the pointer; empty space keeps the browser menu.
          Focus returns to the row when the menu closes. Hovering a label shows its full path in an
          md-tooltip from renderItemLabel (mouse only).
        </p>
        <tvx-tree-view
          ${ref(tree)}
          style="max-inline-size: 20rem; min-block-size: 12rem;"
          .items=${buildFileTree()}
          .defaultExpandedItems=${["src", "components"]}
          .isItemEditable=${true}
          .renderItemLeading=${renderFileIcon}
          .renderItemLabel=${renderLabel}
          .renderItemTrailing=${renderTrailingIcon}
          @contextmenu=${onContextMenu}
          @tvx-item-label-change=${onLabelChange}
        ></tvx-tree-view>
        <md-menu ${ref(menu)} @select=${onSelect} @closed=${onClosed}>
          <md-menu-item value="rename">Rename</md-menu-item>
          <md-menu-item value="delete">Delete</md-menu-item>
        </md-menu>
        <pre class="story__log" ${ref(log)}></pre>
      </div>
    `;
  },
};
