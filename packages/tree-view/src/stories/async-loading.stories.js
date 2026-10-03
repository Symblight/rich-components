import { html } from "lit";
import { createRef, ref } from "lit/directives/ref.js";

import { renderFileIcon, renderTrailingIcon, storyStyles, writeLog } from "./shared.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Tree View/Async Loading",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "`.dataSource = { getTreeItems, getChildrenCount }` loads the tree lazily: " +
          "`getTreeItems(parent?)` resolves a batch of data items (the root when called with no " +
          "parent), `getChildrenCount(item)` decides branches — `0` is a leaf, a number renders " +
          "shimmer rows while loading, `undefined` renders a single spinner row. Live-region " +
          'announcements: "Loading N items.", "Loading…", and "{label} is empty.".',
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** A fake filesystem keyed by path. @type {Record<string, { name: string, isDirectory: boolean }[]>} */
const fakeFileSystem = {
  "": [
    { name: "src", isDirectory: true },
    { name: "node_modules", isDirectory: true },
    { name: "README.md", isDirectory: false },
  ],
  src: [
    { name: "components", isDirectory: true },
    { name: "utils", isDirectory: true },
    { name: "index.js", isDirectory: false },
  ],
  "src/components": [
    { name: "button", isDirectory: true },
    { name: "index.js", isDirectory: false },
  ],
  "src/components/button": [
    { name: "button.js", isDirectory: false },
    { name: "button.css", isDirectory: false },
  ],
  "src/utils": [
    { name: "format.js", isDirectory: false },
    { name: "validate.js", isDirectory: false },
  ],
  node_modules: [], // resolves empty — "node_modules/ is empty."
};

/** @returns {import("../base/tree-view.js").TvxTreeDataSource} */
function makeDataSource() {
  return {
    getTreeItems: (parent) =>
      new Promise((resolve) => {
        setTimeout(() => {
          const path = parent?.id ?? "";
          const entries = fakeFileSystem[path] ?? [];
          resolve(
            entries.map((entry) => {
              const id = path ? `${path}/${entry.name}` : entry.name;
              const label = entry.isDirectory ? `${entry.name}/` : entry.name;
              return { id, label, directory: entry.isDirectory };
            }),
          );
        }, 900);
      }),
    getChildrenCount: (item) => {
      const entries = fakeFileSystem[item.id];
      if (entries === undefined) return 0;
      return entries.length || undefined;
    },
  };
}

/** @typedef {import("../base/tree-view.js").TvxTreeView} TvxTreeView */

/** @type {Story} */
export const LazyLoadedDataSource = {
  render: () => html`
    ${storyStyles}
    <div class="story">
      <p class="story__hint">
        "src/" reports a known count (3) — expanding shows shimmer rows. "node_modules/" reports an
        unknown count — expanding shows a spinner row, then it resolves empty and loses its chevron.
      </p>
      <tvx-tree-view
        .dataSource=${makeDataSource()}
        .renderItemLeading=${renderFileIcon}
        .renderItemTrailing=${renderTrailingIcon}
      ></tvx-tree-view>
    </div>
  `,
};

/** @type {Story} */
export const ExpandAllAndSelect = {
  render: () => {
    /** @type {import("lit/directives/ref.js").Ref<TvxTreeView>} */
    const tree = createRef();
    /** @type {import("lit/directives/ref.js").Ref<HTMLElement>} */
    const log = createRef();
    // expansion.expandAll() only reaches loaded branches; re-running it per batch walks the whole tree
    let expandingAll = false;

    return html`
      ${storyStyles}
      <div class="story">
        <div class="story__controls">
          <button
            @click=${() => {
              expandingAll = true;
              tree.value?.expansion.expandAll();
            }}
          >
            Expand all
          </button>
          <button @click=${() => tree.value?.selection.select("README.md")}>
            Select README.md
          </button>
          <button @click=${() => tree.value?.loading.reload()}>Reload root</button>
        </div>
        <tvx-tree-view
          ${ref(tree)}
          .dataSource=${makeDataSource()}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
          @tvx-children-loaded=${() => expandingAll && tree.value?.expansion.expandAll()}
          @tvx-selection-change=${(/** @type {CustomEvent} */ event) =>
            writeLog(
              log,
              `tvx-selection-change: ${JSON.stringify([...event.detail.selectedItems])}`,
            )}
        ></tvx-tree-view>
        <pre class="story__log" ${ref(log)}></pre>
      </div>
    `;
  },
};

/** @type {Story} */
export const ChildrenLoadedEvent = {
  render: () => {
    /** @type {import("lit/directives/ref.js").Ref<HTMLElement>} */
    const log = createRef();
    /** @param {CustomEvent} event */
    const onChildrenLoaded = (event) => {
      const { id, items } = event.detail;
      const names = /** @type {any[]} */ (items).map((item) => item.label);
      writeLog(
        log,
        `tvx-children-loaded: parent=${JSON.stringify(id)} items=${JSON.stringify(names)}`,
      );
    };
    return html`
      ${storyStyles}
      <div class="story">
        <p class="story__hint">
          Fires once a batch lands (id is null for the root) — unlike tvx-expand-change, which fires
          the instant a branch opens, before its fetch starts.
        </p>
        <tvx-tree-view
          .dataSource=${makeDataSource()}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
          @tvx-children-loaded=${onChildrenLoaded}
        ></tvx-tree-view>
        <pre class="story__log" ${ref(log)}></pre>
      </div>
    `;
  },
};
