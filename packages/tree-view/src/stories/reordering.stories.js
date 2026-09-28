import { buildFileTree, createTree, hintText, logPanel, stack } from "./shared.js";

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
          "picking an item up. Cancelable `tvx-item-position-change` (`{ key, oldPosition, " +
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
    const tree = createTree({
      items: buildFileTree(),
      reordering: true,
      multiSelect: true,
      isItemReorderable: (item) => item.id !== "gitignore",
    });
    const log = logPanel();
    tree.addEventListener("tvx-item-position-change", (event) => {
      log.textContent = `tvx-item-position-change: ${JSON.stringify(/** @type {CustomEvent} */ (event).detail)}`;
    });
    return stack(
      hintText(
        'Drag a row above/below/onto a folder, or focus one and press Alt+↑/↓. ".gitignore" can\'t ' +
          "be dragged, but others can still drop next to it.",
      ),
      tree,
      log,
    );
  },
};

/** @type {Story} */
export const VetoedMove = {
  render: () => {
    const tree = createTree({ items: buildFileTree(), reordering: true });
    const log = logPanel();
    tree.addEventListener("tvx-item-position-change", (event) => {
      const detail = /** @type {CustomEvent} */ (event).detail;
      if (detail.newPosition.parentId !== detail.oldPosition.parentId) {
        event.preventDefault();
        log.textContent = `Blocked re-parent of "${detail.key}" — nothing moved.`;
        return;
      }
      log.textContent = `Allowed reorder: ${JSON.stringify(detail)}`;
    });
    return stack(
      hintText(
        "preventDefault() on any move that changes the parent; sibling reorders still go through.",
      ),
      tree,
      log,
    );
  },
};
