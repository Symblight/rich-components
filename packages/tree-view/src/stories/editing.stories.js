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
  title: "Tree View/Label Editing",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "`isItemEditable(item)` marks items that can be renamed; `tree.editing.start(id)` swaps the " +
          "label for a text field (`tree.editing.cancel()` leaves without saving). In the field, " +
          "Enter saves, Escape cancels, blur saves a non-empty value. Saving goes through " +
          "`tree.editing.updateLabel(id, label)`, which fires cancelable `tvx-item-label-change` " +
          "(`{ id, oldLabel, newLabel }`) and then keeps the new label until the next `.items` — " +
          "persist it yourself.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */
/** @typedef {import("../base/tree-view.js").TvxTreeView} TvxTreeView */

/** The trigger is the consumer's: starts editing the focused row. @param {Event} event */
const editFocused = (event) => {
  const tree = /** @type {TvxTreeView} */ (event.currentTarget);
  const id = tree.navigation.getFocused();
  if (id !== null) tree.editing.start(id);
};

/** @type {Story} */
export const RenameWithF2 = {
  render: () => {
    /** @type {import("lit/directives/ref.js").Ref<HTMLElement>} */
    const log = createRef();
    /** @param {CustomEvent} event */
    const onLabelChange = (event) => {
      const { detail } = event;
      if (/[/\\]/.test(detail.newLabel)) {
        event.preventDefault(); // Enter keeps the field open; blur drops the value
        writeLog(log, `rejected "${detail.newLabel}": no slashes`);
        return;
      }
      writeLog(log, `tvx-item-label-change: ${JSON.stringify(detail)}`);
    };

    return html`
      ${storyStyles}
      <div class="story">
        <p class="story__hint">
          Focus a row and press F2, or double-click it. ".gitignore" isn't editable; names with a
          slash are rejected.
        </p>
        <tvx-tree-view
          .items=${buildFileTree()}
          .defaultExpandedItems=${["src", "components"]}
          .isItemEditable=${(/** @type {any} */ item) => item.id !== "gitignore"}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
          @keydown=${(/** @type {KeyboardEvent} */ event) => event.key === "F2" && editFocused(event)}
          @dblclick=${editFocused}
          @tvx-item-label-change=${onLabelChange}
        ></tvx-tree-view>
        <pre class="story__log" ${ref(log)}></pre>
      </div>
    `;
  },
};

/** @type {Story} */
export const ProgrammaticRename = {
  render: () => {
    /** @type {import("lit/directives/ref.js").Ref<TvxTreeView>} */
    const tree = createRef();
    return html`
      ${storyStyles}
      <div class="story">
        <div class="story__controls">
          <button @click=${() => tree.value?.editing.updateLabel("index", "main.js")}>
            Rename "index.js" → "main.js"
          </button>
        </div>
        <tvx-tree-view
          ${ref(tree)}
          .items=${buildFileTree()}
          .defaultExpandedItems=${["src"]}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
        ></tvx-tree-view>
      </div>
    `;
  },
};

/** @type {Story} */
export const CustomEditor = {
  render: () => {
    /** @type {import("lit/directives/ref.js").Ref<TvxTreeView>} */
    const tree = createRef();
    /** @type {import("lit/directives/ref.js").Ref<HTMLInputElement>} */
    const input = createRef();

    const save = () => {
      const id = tree.value?.editing.getEdited();
      if (!tree.value || id == null || !input.value) return;
      if (tree.value.editing.updateLabel(id, input.value.value)) tree.value.editing.cancel();
    };
    // a wrapper has no `value`, so fill the input when editing starts
    /** @param {KeyboardEvent} event */
    const onKeydown = (event) => {
      const id = tree.value?.navigation.getFocused();
      if (event.key !== "F2" || id == null || !tree.value || !input.value) return;
      input.value.value = tree.value.nodes.getItem(id)?.label ?? "";
      tree.value.editing.start(id);
    };

    return html`
      ${storyStyles}
      <div class="story">
        <p class="story__hint">Focus a row and press F2. The editor is a slotted div.</p>
        <tvx-tree-view
          ${ref(tree)}
          .items=${buildFileTree()}
          .defaultExpandedItems=${["src", "components"]}
          .isItemEditable=${true}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
          @keydown=${onKeydown}
        >
          <!-- slot="edit" replaces the built-in text input -->
          <div slot="edit" style="display: flex; gap: 0.25rem; align-items: center;">
            <input ${ref(input)} style="flex: 1; min-inline-size: 0; font: inherit;" />
            <button @click=${save}>Save</button>
          </div>
        </tvx-tree-view>
      </div>
    `;
  },
};
