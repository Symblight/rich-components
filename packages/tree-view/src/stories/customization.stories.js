import { html } from "lit";

import { buildFileTree, renderFileIcon, renderTrailingIcon, storyStyles } from "./shared.js";

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
          "`tvx-tree-view`. Any of them accepts a literal CSS value.",
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
