import blockIcon from "@material-design-icons/svg/outlined/block.svg?raw";

import {
  buildFileTree,
  button,
  controls,
  createTree,
  file,
  folder,
  hintText,
  logPanel,
  stack,
} from "./shared.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Tree View/Selection",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'Single-select by default (the selected row gets `aria-current="true"`). `multiSelect` opts ' +
          "into MUI-style selection mirroring `@symblight/data-grid`: plain click replaces, " +
          "Ctrl/Cmd+click toggles, Shift+click (or Shift+↑/↓) merges a range from the anchor. " +
          "`checkboxSelection` adds a checkbox per row that cascades through a branch's subtree. " +
          "`disableSelection` turns selection off. `disabled` items are skipped everywhere.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** @param {HTMLElement} tree */
function selectionLog(tree) {
  const log = logPanel();
  tree.addEventListener("tvx-selection-change", (event) => {
    const ids = [.../** @type {CustomEvent} */ (event).detail.selectedItems];
    log.textContent = ids.length === 0 ? "Nothing selected." : `Selected: ${ids}`;
  });
  return log;
}

/** @param {Partial<import("../base/tree-view.js").TvxTreeView>} props
 * @param {string} hint */
function selectionStory(props, hint) {
  const tree = createTree({ items: buildFileTree(), ...props });
  return stack(hintText(hint), tree, selectionLog(tree));
}

/** @type {Story} */
export const SingleSelect = {
  render: () => selectionStory({}, "Clicking a row selects it and deselects the previous one."),
};

/** @type {Story} */
export const DisableSelection = {
  render: () =>
    selectionStory(
      { disableSelection: true },
      "Rows still focus and branches still toggle — nothing is ever selected.",
    ),
};

/** @type {Story} */
export const MultiSelect = {
  render: () =>
    selectionStory(
      { multiSelect: true },
      "Ctrl/⌘+click toggles one item, Shift+click selects every visible row in between. Flat — a " +
        "folder never selects its children.",
    ),
};

/** @type {Story} */
export const CheckboxSelection = {
  render: () =>
    selectionStory(
      { multiSelect: true, checkboxSelection: true },
      "Checking a folder checks its whole subtree; checking every child checks the folder. A row " +
        "click only toggles expansion — selection is the checkbox's job.",
    ),
};

/** @type {Story} */
export const DisabledItems = {
  render: () => {
    const tree = createTree({
      multiSelect: true,
      items: [
        folder({ id: "src", label: "src/", children: [file({ id: "index", label: "index.js" })] }),
        file({
          id: "package-lock",
          label: "package-lock.json",
          disabled: true,
          trailingIcon: blockIcon,
        }),
        file({ id: "readme", label: "README.md" }),
      ],
    });
    return stack(
      hintText('"package-lock.json" is disabled — clicks skip it and Shift ranges leave it out.'),
      tree,
      selectionLog(tree),
    );
  },
};

/** @type {Story} */
export const RangeSelectionWalkthrough = {
  render: () => {
    const tree = createTree({
      multiSelect: true,
      items: ["Alpha", "Beta", "Cherry", "Delta", "Echo"].map((label) =>
        file({ id: label[0].toLowerCase(), label }),
      ),
    });

    /** @param {string} text @param {string} label @param {MouseEventInit} init */
    const clickRow = (text, label, init) =>
      button(text, () => {
        const row = [...(tree.shadowRoot?.querySelectorAll(".tree-view__item") ?? [])].find(
          (el) => el.textContent?.trim() === label,
        );
        row?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, ...init }));
      });

    return stack(
      hintText(
        "Plain-click Beta, Ctrl+click Delta, then Shift+click Echo — the range merges into the " +
          "selection: Beta, Delta, Echo.",
      ),
      controls(
        clickRow("Click Beta", "Beta", {}),
        clickRow("Ctrl+click Delta", "Delta", { ctrlKey: true }),
        clickRow("Shift+click Echo", "Echo", { shiftKey: true }),
      ),
      tree,
      selectionLog(tree),
    );
  },
};
