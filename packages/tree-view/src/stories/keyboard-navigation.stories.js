import "../index.js";

import { buildFileTree, hintText, logPanel, stack } from "./shared.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Tree View/Keyboard & Navigation",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Full WAI-ARIA APG tree keyboard support via roving `tabindex` (exactly one " +
          "`<tvx-tree-item>` is a Tab stop at a time): `↑`/`↓` move without side effects, `→`/`←` " +
          "expand/collapse a branch or move to its first child/parent, `Home`/`End` jump to the " +
          "first/last *visible* node, `PageUp`/`PageDown` jump by an estimated viewport page, " +
          "`Backspace` goes to the parent (file-explorer convention), `Enter` toggles a branch's " +
          "expansion (a no-op on leaf items), `Space` always selects (never touches expansion), " +
          "and any other printable character drives typeahead (prefix-matches labels, cycling " +
          "from the node after current focus, ~500ms reset). Every focus move also scrolls the " +
          "target into view.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

// ─── The full keyboard table, plus selection/expansion event logging ────────

/** @type {Story} */
export const FullKeyboardTable = {
  render: () => {
    const tree = document.createElement("tvx-tree-view");
    tree.items = buildFileTree();

    const log = logPanel();
    tree.addEventListener("tvx-selection-change", (event) => {
      const ids = [.../** @type {CustomEvent} */ (event).detail.selectedItems];
      log.textContent = `tvx-selection-change: ${JSON.stringify(ids)}`;
    });
    tree.addEventListener("tvx-expand-change", (event) => {
      log.textContent = `tvx-expand-change: ${JSON.stringify(/** @type {CustomEvent} */ (event).detail)}`;
    });

    return stack(
      hintText(
        "Click a row, then try: ↑/↓ move without expanding, → expands a collapsed branch or steps " +
          "into an expanded one's first child, ← collapses an expanded branch or steps to the " +
          "parent, Home/End jump to the first/last visible row, PageUp/PageDown jump by a viewport's " +
          "worth of rows, Backspace goes to the parent, Enter toggles a branch's expansion, Space " +
          'selects, and typing "rea" jumps typeahead-style to "README.md".',
      ),
      tree,
      log,
    );
  },
};

// ─── A disabled item blocks its own keydown handling once focus lands on it ─

/** @type {Story} */
export const DisabledItemBlocksInput = {
  render: () => {
    const tree = document.createElement("tvx-tree-view");
    const items = buildFileTree();
    // The middle root item (".gitignore") is disabled — arrow-key stepping still lands focus on
    // it like any other visible node, but once focus IS there, KeyboardNavController's own
    // `if (item.disabled) return` at the top of onKeydown blocks every key it would otherwise
    // handle, including the arrows needed to move on. Tab (a normal browser focus move, not
    // roving-tabindex) still escapes it.
    items[1].disabled = true;
    tree.items = items;
    return stack(
      hintText(
        'Click "src/" then press ArrowDown once to reach the disabled ".gitignore" row — focus lands on it ' +
          "normally, but every key you press there next (arrows included) is a no-op, since a " +
          "disabled item's own keydown handling is blocked entirely, not just its " +
          "selection/activation. Press Tab to leave it for the next focusable element on the page " +
          "instead of trying to arrow away.",
      ),
      tree,
    );
  },
};
