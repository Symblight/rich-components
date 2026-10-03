import { html } from "lit";
import { createRef, ref } from "lit/directives/ref.js";

import { renderFileIcon, renderTrailingIcon, storyStyles } from "./shared.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Tree View/Virtualization",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Rows are virtualized by default with `@tanstack/lit-virtual`: only the visible window " +
          "(plus overscan) is in the DOM, and the host itself is the scroll viewport — give it a " +
          "`height`/`max-height`. The focused row stays mounted while scrolled away so keyboard focus " +
          "is never lost. `no-virtualization` renders every row instead.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** `folders` × `files` leaves under each, plus a nested level every 10th folder.
 * @param {number} folders
 * @param {number} files */
function buildLargeTree(folders, files) {
  return Array.from({ length: folders }, (_, f) => ({
    id: `f${f}`,
    label: `folder-${f}/`,
    directory: true,
    children: [
      ...(f % 10 === 0
        ? [
            {
              id: `f${f}-sub`,
              label: "nested/",
              directory: true,
              children: [{ id: `f${f}-sub-a`, label: "deep.txt" }],
            },
          ]
        : []),
      ...Array.from({ length: files }, (_, i) => ({
        id: `f${f}-${i}`,
        label: `file-${f}-${i}.txt`,
      })),
    ],
  }));
}

/** @typedef {import("../base/tree-view.js").TvxTreeView} TvxTreeView */

/** @type {Story} */
export const LargeTree = {
  render: () => {
    /** @type {import("lit/directives/ref.js").Ref<TvxTreeView>} */
    const tree = createRef();
    return html`
      ${storyStyles}
      <div class="story">
        <p class="story__hint">
          1,000 folders × 100 files (~100k items). Expand all, then scroll or hold ArrowDown — only
          the visible rows exist in the DOM.
        </p>
        <div class="story__controls">
          <button @click=${() => tree.value?.expansion.expandAll()}>Expand all</button>
          <button @click=${() => tree.value?.expansion.collapseAll()}>Collapse all</button>
          <button
            @click=${() =>
              tree.value?.navigation.reveal("f500-50", { align: "center", behavior: "smooth" })}
          >
            Reveal file-500-50
          </button>
          <button
            @click=${() => {
              tree.value?.expansion.expand("f500");
              tree.value?.navigation.focusItem("f500-50");
            }}
          >
            Focus file-500-50
          </button>
        </div>
        <tvx-tree-view
          ${ref(tree)}
          multi-select
          style="height: 480px; border: 1px solid var(--md-sys-color-outline-variant, #ccc);"
          .items=${buildLargeTree(1000, 100)}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
        ></tvx-tree-view>
      </div>
    `;
  },
};

/** @type {Story} */
export const NoVirtualization = {
  render: () => html`
    ${storyStyles}
    <div class="story">
      <p class="story__hint">
        <code>no-virtualization</code> renders every visible row — fine for small trees.
      </p>
      <tvx-tree-view
        no-virtualization
        style="max-height: 480px;"
        .items=${buildLargeTree(20, 10)}
        .renderItemLeading=${renderFileIcon}
        .renderItemTrailing=${renderTrailingIcon}
      ></tvx-tree-view>
    </div>
  `,
};
