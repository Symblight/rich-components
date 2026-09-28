import { html } from "lit";

import { buildFileTree, createTree, hintText, stack } from "./shared.js";

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
  render: () => {
    const tree = createTree({
      items: buildFileTree(),
      multiSelect: true,
      checkboxSelection: true,
      defaultExpandedItems: new Set(["src", "components"]),
      renderItemLabel: (item, { selected }) =>
        item.directory
          ? html`<strong>${item.label}</strong>`
          : html`${item.label}${selected ? " ✓" : ""}`,
    });
    tree.classList.add("customization-tree");

    const style = document.createElement("style");
    style.textContent = `
      .customization-tree {
        --tvx-tree-item-shape: 0.2rem;
        --tvx-tree-item-chevron-color: #7c3aed;
        --tvx-tree-item-hover-background-color: #f5f3ff;
        --tvx-tree-item-selected-background-color: #ede9fe;
        --tvx-tree-item-selected-color: #5b21b6;
        --tvx-tree-item-focus-outline-color: #7c3aed;
      }
      .customization-tree::part(label) { letter-spacing: 0.02em; }
    `;

    return stack(
      hintText(
        "renderItemLabel bolds folders and marks selected files; the purple palette and 0.2rem row " +
          "shape are --tvx-tree-item-* tokens set as literal values on the tree.",
      ),
      style,
      tree,
    );
  },
};
