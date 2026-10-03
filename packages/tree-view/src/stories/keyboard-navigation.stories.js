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
  title: "Tree View/Keyboard & Navigation",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Full WAI-ARIA APG tree keyboard support via roving `tabindex`: `↑`/`↓` move, `→`/`←` " +
          "expand/collapse or step to first child/parent, `Home`/`End` jump to the first/last visible " +
          "row, `PageUp`/`PageDown` jump a viewport, `Backspace` goes to the parent, `Enter` toggles a " +
          "branch, `Space` selects, and printable characters drive typeahead (~500ms reset). Focus " +
          "moves scroll the target into view, virtualized or not.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** @type {Story} */
export const FullKeyboardTable = {
  render: () => {
    /** @type {import("lit/directives/ref.js").Ref<HTMLElement>} */
    const log = createRef();
    return html`
      ${storyStyles}
      <div class="story">
        <p class="story__hint">
          Click a row, then try the keys above — typing "rea" jumps to "README.md".
        </p>
        <tvx-tree-view
          .items=${buildFileTree()}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
          @tvx-selection-change=${(/** @type {CustomEvent} */ event) =>
            writeLog(
              log,
              `tvx-selection-change: ${JSON.stringify([...event.detail.selectedItems])}`,
            )}
          @tvx-expand-change=${(/** @type {CustomEvent} */ event) =>
            writeLog(log, `tvx-expand-change: ${JSON.stringify(event.detail)}`)}
        ></tvx-tree-view>
        <pre class="story__log" ${ref(log)}></pre>
      </div>
    `;
  },
};

/** @type {Story} */
export const DisabledItem = {
  render: () => {
    const items = buildFileTree();
    items[1].disabled = true;
    return html`
      ${storyStyles}
      <div class="story">
        <p class="story__hint">
          Arrow past the disabled ".gitignore" — focus can land on it and move on, but Enter/Space
          and clicks there do nothing.
        </p>
        <tvx-tree-view
          .items=${items}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
        ></tvx-tree-view>
      </div>
    `;
  },
};
