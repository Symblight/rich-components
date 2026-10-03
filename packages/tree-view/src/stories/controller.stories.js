import { html, LitElement } from "lit";

import { TreeViewController } from "../index.js";
import { buildFileTree, renderFileIcon, renderTrailingIcon, storyStyles } from "./shared.js";

/** A toolbar next to a tree: reads reactive state, calls the namespaces. */
class DemoTreeToolbar extends LitElement {
  #tree = new TreeViewController(
    this,
    () => /** @type {import("../index.js").TvxTreeView | null} */ (this.nextElementSibling),
  );

  render() {
    const { selection, expansion } = this.#tree;
    const selected = this.#tree.selectedItems.size;
    return html`
      <span>${selected} selected · focused: ${String(this.#tree.focusedItem ?? "—")}</span>
      <button ?disabled=${selected === 0} @click=${() => selection.clear()}>Clear</button>
      <button @click=${() => expansion.expandAll()}>Expand all</button>
      <button
        ?disabled=${this.#tree.expandedItems.size === 0}
        @click=${() => expansion.collapseAll()}
      >
        Collapse all
      </button>
    `;
  }
}
if (!customElements.get("demo-tree-toolbar")) {
  customElements.define("demo-tree-toolbar", DemoTreeToolbar);
}

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Tree View/TreeViewController",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "`TreeViewController` connects your own Lit element to a tree: the six API namespaces " +
          "plus reactive `selectedItems`, `expandedItems`, `focusedItem`, `editedItem` and " +
          "`isLoading`. The host re-renders only when something it read changed. Pass the tree " +
          "as `target` (an element or a getter) when it's a sibling; without one, the nearest " +
          "ancestor `<tvx-tree-view>` is used.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** @type {Story} */
export const SiblingToolbar = {
  render: () => html`
    ${storyStyles}
    <div class="story">
      <p class="story__hint">
        The toolbar is a sibling of the tree; it finds it through a getter target.
      </p>
      <div>
        <demo-tree-toolbar></demo-tree-toolbar>
        <tvx-tree-view
          multi-select
          .items=${buildFileTree()}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
        ></tvx-tree-view>
      </div>
    </div>
  `,
};
