import { html } from "lit";
import { createRef, ref } from "lit/directives/ref.js";

import {
  buildFileTree,
  renderFileIcon,
  renderTrailingIcon,
  storyStyles,
  writeLog,
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
          "`selectedItems` properties re-sync on every write; and the `tree.expansion` / " +
          "`tree.selection` / `tree.navigation` / `tree.nodes` namespaces are imperative calls.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */
/** @typedef {import("../base/tree-view.js").TvxTreeView} TvxTreeView */

/** @type {Story} */
export const UncontrolledDefaults = {
  render: () => html`
    ${storyStyles}
    <div class="story">
      <p class="story__hint">
        defaultExpandedItems/defaultSelectedItems apply exactly once, when the first items exist —
        later writes have no effect.
      </p>
      <tvx-tree-view
        .items=${buildFileTree()}
        .defaultExpandedItems=${new Set(["src"])}
        .defaultSelectedItems=${new Set(["readme"])}
        .renderItemLeading=${renderFileIcon}
        .renderItemTrailing=${renderTrailingIcon}
      ></tvx-tree-view>
    </div>
  `,
};

/** @type {Story} */
export const ControlledState = {
  render: () => {
    /** @type {import("lit/directives/ref.js").Ref<TvxTreeView>} */
    const tree = createRef();
    /** @type {import("lit/directives/ref.js").Ref<HTMLElement>} */
    const log = createRef();
    const renderLog = () =>
      writeLog(
        log,
        `expandedItems: ${JSON.stringify([...(tree.value?.expandedItems ?? [])])}\n` +
          `selectedItems: ${JSON.stringify([...(tree.value?.selectedItems ?? [])])}`,
      );
    /** @param {(tree: TvxTreeView) => void} update */
    const set = (update) => () => tree.value && update(tree.value);

    return html`
      ${storyStyles}
      <div class="story">
        <p class="story__hint">
          expandedItems/selectedItems are live getters/setters — assigning a new Set re-syncs the
          tree, and interacting with the tree updates what they return.
        </p>
        <div class="story__controls">
          <button @click=${set((t) => (t.expandedItems = new Set(["src", "components"])))}>
            Set expandedItems([src, components])
          </button>
          <button @click=${set((t) => (t.selectedItems = new Set(["readme", "gitignore"])))}>
            Set selectedItems([readme, gitignore])
          </button>
          <button
            @click=${set((t) => {
              t.expandedItems = new Set();
              t.selectedItems = new Set();
            })}
          >
            Clear both
          </button>
        </div>
        <tvx-tree-view
          ${ref(tree)}
          multi-select
          .items=${buildFileTree()}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
          @tvx-expansion-change=${renderLog}
          @tvx-selection-change=${renderLog}
        ></tvx-tree-view>
        <pre class="story__log" ${ref(log)}>
expandedItems: []
selectedItems: []</pre>
      </div>
    `;
  },
};

/** @type {Story} */
export const ProgrammaticControls = {
  render: () => {
    /** @type {import("lit/directives/ref.js").Ref<TvxTreeView>} */
    const tree = createRef();
    /** @type {import("lit/directives/ref.js").Ref<HTMLElement>} */
    const status = createRef();
    /** @param {(tree: TvxTreeView) => unknown} call */
    const run = (call) => () => tree.value && call(tree.value);

    return html`
      ${storyStyles}
      <div class="story">
        <p class="story__hint">
          tree.expansion / tree.selection / tree.navigation work for any id the tree knows —
          expanded or not; ids inside a lazy branch that hasn't loaded yet are ignored.
        </p>
        <div class="story__controls">
          <button @click=${run((t) => t.expansion.expand("src"))}>expansion.expand('src')</button>
          <button @click=${run((t) => t.expansion.collapse("src"))}>
            expansion.collapse('src')
          </button>
          <button @click=${run((t) => t.expansion.expandAll())}>expansion.expandAll()</button>
          <button @click=${run((t) => t.expansion.collapseAll())}>expansion.collapseAll()</button>
          <button @click=${run((t) => t.selection.select("button"))}>
            selection.select('button')
          </button>
          <button @click=${run((t) => t.selection.clear())}>selection.clear()</button>
          <button @click=${run((t) => t.navigation.reveal("button"))}>
            navigation.reveal('button')
          </button>
          <button @click=${run((t) => t.nodes.move("readme", { parentId: "src", index: 0 }))}>
            nodes.move('readme', {parentId: 'src', index: 0})
          </button>
        </div>
        <tvx-tree-view
          ${ref(tree)}
          multi-select
          .items=${buildFileTree()}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
          @tvx-expansion-change=${() =>
            writeLog(status, `"src" expanded: ${tree.value?.expansion.isExpanded("src")}`)}
        ></tvx-tree-view>
        <pre class="story__log" ${ref(status)}>"src" expanded: false</pre>
      </div>
    `;
  },
};
