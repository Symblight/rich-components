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
  title: "Tree View/Reordering",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "`reordering` enables drag-and-drop (`@atlaskit/pragmatic-drag-and-drop`) and `Alt+↑`/`Alt+↓`. " +
          "A drop lands before/after a target or into a branch. `isItemReorderable(item)` vetoes " +
          "picking an item up. Cancelable `tvx-item-position-change` (`{ id, oldPosition, " +
          "newPosition }`) fires first; the tree then moves the item in its internal model — your " +
          "`.items` arrays are never mutated, so persist the move yourself if you need to.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** @type {Story} */
export const DragAndDropAndKeyboard = {
  render: () => {
    /** @type {import("lit/directives/ref.js").Ref<HTMLElement>} */
    const log = createRef();
    return html`
      ${storyStyles}
      <div class="story">
        <p class="story__hint">
          Drag a row above/below/onto a folder, or focus one and press Alt+↑/↓. ".gitignore" can't
          be dragged, but others can still drop next to it.
        </p>
        <tvx-tree-view
          reordering
          multi-select
          .items=${buildFileTree()}
          .isItemReorderable=${(/** @type {any} */ item) => item.id !== "gitignore"}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
          @tvx-item-position-change=${(/** @type {CustomEvent} */ event) =>
            writeLog(log, `tvx-item-position-change: ${JSON.stringify(event.detail)}`)}
        ></tvx-tree-view>
        <pre class="story__log" ${ref(log)}></pre>
      </div>
    `;
  },
};

/** @type {Story} */
export const VetoedMove = {
  render: () => {
    /** @type {import("lit/directives/ref.js").Ref<HTMLElement>} */
    const log = createRef();
    /** @param {CustomEvent} event */
    const onPositionChange = (event) => {
      const { detail } = event;
      if (detail.newPosition.parentId !== detail.oldPosition.parentId) {
        event.preventDefault();
        writeLog(log, `Blocked re-parent of "${detail.id}" — nothing moved.`);
        return;
      }
      writeLog(log, `Allowed reorder: ${JSON.stringify(detail)}`);
    };
    return html`
      ${storyStyles}
      <div class="story">
        <p class="story__hint">
          preventDefault() on any move that changes the parent; sibling reorders still go through.
        </p>
        <tvx-tree-view
          reordering
          .items=${buildFileTree()}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
          @tvx-item-position-change=${onPositionChange}
        ></tvx-tree-view>
        <pre class="story__log" ${ref(log)}></pre>
      </div>
    `;
  },
};
