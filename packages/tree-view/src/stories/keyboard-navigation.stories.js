import { buildFileTree, createTree, hintText, logPanel, stack } from "./shared.js";

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
    const tree = createTree({ items: buildFileTree() });
    const log = logPanel();
    tree.addEventListener("tvx-selection-change", (event) => {
      const ids = [.../** @type {CustomEvent} */ (event).detail.selectedItems];
      log.textContent = `tvx-selection-change: ${JSON.stringify(ids)}`;
    });
    tree.addEventListener("tvx-expand-change", (event) => {
      log.textContent = `tvx-expand-change: ${JSON.stringify(/** @type {CustomEvent} */ (event).detail)}`;
    });
    return stack(
      hintText('Click a row, then try the keys above — typing "rea" jumps to "README.md".'),
      tree,
      log,
    );
  },
};

/** @type {Story} */
export const DisabledItem = {
  render: () => {
    const items = buildFileTree();
    items[1].disabled = true;
    return stack(
      hintText(
        'Arrow past the disabled ".gitignore" — focus can land on it and move on, but Enter/Space ' +
          "and clicks there do nothing.",
      ),
      createTree({ items }),
    );
  },
};
