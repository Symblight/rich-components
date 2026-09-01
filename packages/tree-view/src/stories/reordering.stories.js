import "../index.js";

import { buildFileTree, hintText, logPanel, stack } from "./shared.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Tree View/Reordering",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The `reordering` attribute opts a tree into drag-and-drop (via " +
          "`@atlaskit/pragmatic-drag-and-drop`) plus keyboard (`Alt+↑`/`Alt+↓`) moves. Three " +
          "outcomes per drop: before/after a target (same parent) or into it (re-parenting, offered " +
          "only when the target `hasChildren`). `isItemReorderable` vetoes which items can be " +
          "*picked up* — it doesn't stop other items from being dropped near a non-reorderable one. " +
          "`tvx-item-position-change` (`{ key, oldPosition, newPosition }`) fires cancelable, before " +
          "the DOM mutation runs — `preventDefault()` blocks the move for reasons a static per-item " +
          "check can't express, e.g. a server-side validation.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

// ─── Drag-and-drop + Alt+↑/↓ keyboard reordering ─────────────────────────────

/** @type {Story} */
export const DragAndDropAndKeyboard = {
  render: () => {
    const tree = document.createElement("tvx-tree-view");
    tree.reordering = true;
    tree.items = buildFileTree();
    tree.multiSelect = true;

    // ".gitignore" is pinned — can't be dragged, but siblings can still reorder above/below/into it
    // (isItemReorderable only vetoes dragging *that* item, it doesn't block drops near it).
    tree.isItemReorderable = (item) => item.key !== "gitignore";

    const log = logPanel();
    tree.addEventListener("tvx-item-position-change", (event) => {
      log.textContent = `tvx-item-position-change: ${JSON.stringify(/** @type {CustomEvent} */ (event).detail)}`;
    });

    return stack(
      hintText(
        "Drag a row above/below/onto a folder to reorder or re-parent it, or focus a row and press " +
          'Alt+↑/↓ to move it among its siblings — both paths go through the same ReorderController ' +
          'and fire the identical event below. ".gitignore" can\'t be dragged (isItemReorderable), ' +
          "but its siblings can still be dropped above or below it.",
      ),
      tree,
      log,
    );
  },
};

// ─── Vetoing a move — preventDefault() on the cancelable event ──────────────

/** @type {Story} */
export const VetoedMove = {
  render: () => {
    const tree = document.createElement("tvx-tree-view");
    tree.reordering = true;
    tree.items = buildFileTree();

    const log = logPanel();
    tree.addEventListener("tvx-item-position-change", (event) => {
      const detail = /** @type {CustomEvent} */ (event).detail;
      const reparenting = detail.newPosition.parentId !== detail.oldPosition.parentId;
      if (reparenting) {
        event.preventDefault();
        log.textContent = `Blocked re-parent of "${detail.key}" into "${detail.newPosition.parentId}" — nothing moved.`;
        return;
      }
      log.textContent = `Allowed reorder: ${JSON.stringify(detail)}`;
    });

    return stack(
      hintText(
        "This tree's listener calls preventDefault() on any move that would change an item's " +
          "parent (re-parenting into a different folder) while still allowing plain sibling " +
          "reordering — fires before the DOM mutation, so a vetoed drop leaves the tree completely " +
          "unchanged. A real app would run this kind of check against its own backend instead.",
      ),
      tree,
      log,
    );
  },
};
