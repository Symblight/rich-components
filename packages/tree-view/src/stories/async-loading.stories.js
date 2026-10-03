import { button, controls, createTree, hintText, logPanel, stack } from "./shared.js";

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

/** @type {Story} */
export const LazyLoadedDataSource = {
  render: () =>
    stack(
      hintText(
        '"src/" reports a known count (3) — expanding shows shimmer rows. "node_modules/" reports ' +
          "an unknown count — expanding shows a spinner row, then it resolves empty and loses its chevron.",
      ),
      createTree({ dataSource: makeDataSource() }),
    ),
};

/** @type {Story} */
export const ExpandAllAndSelect = {
  render: () => {
    const tree = createTree({ dataSource: makeDataSource() });

    // expansion.expandAll() only reaches loaded branches; re-running it per batch walks the whole tree
    let expandingAll = false;
    tree.addEventListener("tvx-children-loaded", () => {
      if (expandingAll) tree.expansion.expandAll();
    });

    const log = logPanel();
    tree.addEventListener("tvx-selection-change", (event) => {
      const ids = [.../** @type {CustomEvent} */ (event).detail.selectedItems];
      log.textContent = `tvx-selection-change: ${JSON.stringify(ids)}`;
    });

    return stack(
      controls(
        button("Expand all", () => {
          expandingAll = true;
          tree.expansion.expandAll();
        }),
        button("Select README.md", () => tree.selection.select("README.md")),
        button("Reload root", () => tree.loading.reload()),
      ),
      tree,
      log,
    );
  },
};

/** @type {Story} */
export const ChildrenLoadedEvent = {
  render: () => {
    const tree = createTree({ dataSource: makeDataSource() });
    const log = logPanel();
    tree.addEventListener("tvx-children-loaded", (event) => {
      const { id, items } = /** @type {CustomEvent} */ (event).detail;
      const names = /** @type {any[]} */ (items).map((item) => item.label);
      log.textContent = `tvx-children-loaded: parent=${JSON.stringify(id)} items=${JSON.stringify(names)}`;
    });
    return stack(
      hintText(
        "Fires once a batch lands (id is null for the root) — unlike tvx-expand-change, which fires " +
          "the instant a branch opens, before its fetch starts.",
      ),
      tree,
      log,
    );
  },
};
