import {
  buildFileTree,
  button,
  controls,
  createTree,
  hintText,
  logPanel,
  stack,
} from "./shared.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Tree View/Expansion",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Three ways to drive expand/select state from outside, in increasing order of control: " +
          "`defaultExpandedItems`/`defaultSelectedItems` apply once; the `expandedItems`/" +
          "`selectedItems` properties re-sync on every write; and `setItemExpansion()`/" +
          "`setItemSelection()`/`isItemExpanded()`/`expandAll()`/`collapseAll()` are imperative calls.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** @type {Story} */
export const UncontrolledDefaults = {
  render: () =>
    stack(
      hintText(
        "defaultExpandedItems/defaultSelectedItems apply exactly once, when the first items exist — " +
          "later writes have no effect.",
      ),
      createTree({
        items: buildFileTree(),
        defaultExpandedItems: new Set(["src"]),
        defaultSelectedItems: new Set(["readme"]),
      }),
    ),
};

/** @type {Story} */
export const ControlledState = {
  render: () => {
    const tree = createTree({ items: buildFileTree(), multiSelect: true });
    const log = logPanel();
    const renderLog = () => {
      log.textContent =
        `expandedItems: ${JSON.stringify([...tree.expandedItems])}\n` +
        `selectedItems: ${JSON.stringify([...tree.selectedItems])}`;
    };
    tree.addEventListener("tvx-expansion-change", renderLog);
    tree.addEventListener("tvx-selection-change", renderLog);
    renderLog();

    return stack(
      hintText(
        "expandedItems/selectedItems are live getters/setters — assigning a new Set re-syncs the " +
          "tree, and interacting with the tree updates what they return.",
      ),
      controls(
        button("Set expandedItems([src, components])", () => {
          tree.expandedItems = new Set(["src", "components"]);
        }),
        button("Set selectedItems([readme, gitignore])", () => {
          tree.selectedItems = new Set(["readme", "gitignore"]);
        }),
        button("Clear both", () => {
          tree.expandedItems = new Set();
          tree.selectedItems = new Set();
        }),
      ),
      tree,
      log,
    );
  },
};

/** @type {Story} */
export const ProgrammaticControls = {
  render: () => {
    const tree = createTree({ items: buildFileTree(), multiSelect: true });
    const status = logPanel();
    const renderStatus = () => {
      status.textContent = `"src" expanded: ${tree.expansion.isExpanded("src")}`;
    };
    tree.addEventListener("tvx-expansion-change", renderStatus);
    renderStatus();

    return stack(
      hintText(
        "tree.expansion / tree.selection / tree.navigation work for any id the tree knows — " +
          "expanded or not; ids inside a lazy branch that hasn't loaded yet are ignored.",
      ),
      controls(
        button("expansion.expand('src')", () => tree.expansion.expand("src")),
        button("expansion.collapse('src')", () => tree.expansion.collapse("src")),
        button("expansion.expandAll()", () => tree.expansion.expandAll()),
        button("expansion.collapseAll()", () => tree.expansion.collapseAll()),
        button("selection.select('button')", () => tree.selection.select("button")),
        button("selection.clear()", () => tree.selection.clear()),
        button("navigation.reveal('button')", () => tree.navigation.reveal("button")),
        button("nodes.move('readme', {parentId: 'src', index: 0})", () =>
          tree.nodes.move("readme", { parentId: "src", index: 0 }),
        ),
      ),
      tree,
      status,
    );
  },
};
