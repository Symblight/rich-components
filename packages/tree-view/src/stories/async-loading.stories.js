import "../index.js";

import { buildItem, file, folder, hintText, logPanel, stack } from "./shared.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Tree View/Async Loading",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "`.dataSource = { getTreeItems, getChildrenCount }` fetches the tree lazily instead of it " +
          "all being handed over upfront: `getTreeItems(parent?)` fetches a batch (root when called " +
          "with no parent, a branch's children on first expand) and returns real `<tvx-tree-item>` " +
          "elements — same \"you build it, hand it over\" contract `.items` itself uses, not plain " +
          "data the tree converts. `getChildrenCount(item)` is called once per newly-landed item: " +
          "`0` means a leaf, a number means a known-count group (renders shimmer-bar " +
          "`<tvx-tree-skeleton>` rows while loading), `undefined` means \"a group, but don't know the " +
          "count yet\" (renders a single generic spinner row instead). Three live-region " +
          "announcements carry the state to assistive tech: \"Loading N items.\", \"Loading…\", and " +
          "\"{label} is empty.\" once a fetch resolves with nothing.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** A fake filesystem, keyed by path, lazily loaded several levels deep through one `dataSource`. */
const ROOT = "";
const fakeFileSystem = {
  [ROOT]: [
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
    { name: "message-list", isDirectory: true },
    { name: "index.js", isDirectory: false },
  ],
  "src/components/button": [
    { name: "button.js", isDirectory: false },
    { name: "button.css", isDirectory: false },
    { name: "button.spec.js", isDirectory: false },
  ],
  "src/components/message-list": [
    { name: "message-list.js", isDirectory: false },
    { name: "message-list.css", isDirectory: false },
  ],
  "src/utils": [
    { name: "format.js", isDirectory: false },
    { name: "validate.js", isDirectory: false },
  ],
  node_modules: [], // resolves empty — "node_modules/ is empty." announced, no chevron afterward
};

/** Builds one real `<tvx-tree-item>` for a fake-fs entry — `parentKey` prefixes its path-based key.
 * @param {string} parentKey @param {{ name: string, isDirectory: boolean }} entry */
function buildEntry(parentKey, entry) {
  const key = parentKey ? `${parentKey}/${entry.name}` : entry.name;
  return buildItem(
    entry.isDirectory
      ? folder({ id: key, label: `${entry.name}/` })
      : file({ id: key, label: entry.name }),
  );
}

/** Shared by every story below — each gets its own instance so one story's in-flight fetches don't
 * bleed into another's. @returns {{ getTreeItems: (parent?: any) => Promise<any[]>, getChildrenCount: (item: any) => number | undefined }} */
function makeDataSource() {
  return {
    getTreeItems: (parent) =>
      new Promise((resolve) => {
        setTimeout(() => {
          const entries = /** @type {any} */ (fakeFileSystem)[parent?.key ?? ROOT] ?? [];
          // getTreeItems returns real elements, built the same way .items is — not plain data for
          // the tree to convert — each one's icon is set right here, at the point it's built, no
          // separate pass needed afterward.
          resolve(entries.map((/** @type {any} */ entry) => buildEntry(parent?.key ?? "", entry)));
        }, 900);
      }),
    // Called once per item, eagerly, as soon as its batch (root or a resolved getTreeItems call)
    // lands — 0 means a leaf, undefined means "a group, but don't know the count yet" (node_modules/
    // is a known-empty directory, not a leaf: it still gets a chevron and its own getTreeItems fetch
    // on expand, which is what actually resolves it empty).
    getChildrenCount: (item) => {
      const entries = /** @type {any} */ (fakeFileSystem)[item.key];
      if (entries === undefined) return 0;
      return entries.length || undefined;
    },
  };
}

// ─── Lazy-loaded tree — known-count skeleton rows vs. unknown-count spinner ─

/** @type {Story} */
export const LazyLoadedDataSource = {
  render: () => {
    const tree = document.createElement("tvx-tree-view");
    tree.dataSource = makeDataSource();
    return stack(
      hintText(
        "\"src/\" reports a known childrenCount (3) — expanding it shows shimmer-bar " +
          "<tvx-tree-skeleton> placeholder rows while loading, not a spinner. \"node_modules/\" " +
          "reports an unknown count (undefined until it resolves) — expanding it shows a single " +
          "generic <tvx-tree-item loading> spinner row instead, and resolves to \"node_modules/ is " +
          "empty.\" with no chevron afterward, since a branch known to have zero children can no " +
          "longer expand at all.",
      ),
      tree,
    );
  },
};

// ─── expandAll()/setItemSelection() against an async dataSource ─────────────

/** @type {Story} */
export const ExpandAllAndSelect = {
  render: () => {
    const tree = document.createElement("tvx-tree-view");
    tree.dataSource = makeDataSource();

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "0.5rem";
    controls.style.marginBottom = "0.5rem";

    // expandAll() only reaches items already in the DOM — a group whose children haven't landed
    // yet still needs its own expand to trigger the fetch. Re-running it on every
    // tvx-children-loaded keeps expanding newly-revealed groups until the whole tree has loaded.
    let expandingAll = false;
    const expandAllButton = document.createElement("button");
    expandAllButton.type = "button";
    expandAllButton.textContent = "Expand all";
    expandAllButton.addEventListener("click", () => {
      expandingAll = true;
      tree.expandAll();
    });
    tree.addEventListener("tvx-children-loaded", () => {
      if (expandingAll) tree.expandAll();
    });

    // No-ops until the root batch has loaded and "README.md" actually exists in the DOM — same
    // silent-no-op contract as setItemExpansion() for an id that isn't mounted yet.
    const selectReadmeButton = document.createElement("button");
    selectReadmeButton.type = "button";
    selectReadmeButton.textContent = "Select README.md";
    selectReadmeButton.addEventListener("click", () => {
      tree.setItemSelection({ id: "README.md", selected: true });
    });

    const log = logPanel();
    tree.addEventListener("tvx-selection-change", (event) => {
      const ids = [.../** @type {CustomEvent} */ (event).detail.selectedItems];
      log.textContent = `tvx-selection-change: ${JSON.stringify(ids)}`;
    });

    controls.append(expandAllButton, selectReadmeButton);
    return stack(controls, tree, log);
  },
};

// ─── tvx-children-loaded — fires once a resolved fetch's items actually land ─

/** @type {Story} */
export const ChildrenLoadedEvent = {
  render: () => {
    const tree = document.createElement("tvx-tree-view");
    tree.dataSource = makeDataSource();

    const log = logPanel();
    tree.addEventListener("tvx-children-loaded", (event) => {
      const { key, items } = /** @type {CustomEvent} */ (event).detail;
      const names = /** @type {any[]} */ (items).map((item) => item.label);
      log.textContent = `tvx-children-loaded: parent=${JSON.stringify(key)} items=${JSON.stringify(names)}`;
    });

    return stack(
      hintText(
        "Fires once a resolved fetch's items are actually appended to the DOM — key is null for the " +
          "root batch. This is distinct from tvx-expand-change, which fires the instant a branch is " +
          "clicked open, before the fetch it triggers has even started; anything that wants to react " +
          "to newly-arrived nodes (decorate them, scroll to one, count them) needs this event, not " +
          "that one.",
      ),
      tree,
      log,
    );
  },
};
