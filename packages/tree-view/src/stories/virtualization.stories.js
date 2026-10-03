import { button, controls, createTree, hintText, stack } from "./shared.js";

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

/** @type {Story} */
export const LargeTree = {
  render: () => {
    const items = buildLargeTree(1000, 100);
    const tree = createTree({ items, multiSelect: true });
    tree.style.height = "480px";
    tree.style.border = "1px solid var(--md-sys-color-outline-variant, #ccc)";

    return stack(
      hintText(
        "1,000 folders × 100 files (~100k items). Expand all, then scroll or hold ArrowDown — only " +
          "the visible rows exist in the DOM.",
      ),
      controls(
        button("Expand all", () => tree.expansion.expandAll()),
        button("Collapse all", () => tree.expansion.collapseAll()),
        button("Reveal file-500-50", () =>
          tree.navigation.reveal("f500-50", { align: "center", behavior: "smooth" }),
        ),
        button("Focus file-500-50", () => {
          tree.expansion.expand("f500");
          tree.navigation.focusItem("f500-50");
        }),
      ),
      tree,
    );
  },
};

/** @type {Story} */
export const NoVirtualization = {
  render: () => {
    const tree = createTree({ items: buildLargeTree(20, 10), noVirtualization: true });
    tree.style.maxHeight = "480px";
    return stack(
      hintText("`no-virtualization` renders every visible row — fine for small trees."),
      tree,
    );
  },
};
