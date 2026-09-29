import { buildFileTree, createTree, hintText, logPanel, stack } from "./shared.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Tree View/Label Editing",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "`isItemEditable(item)` marks items that can be renamed; `setEditedItem(id)` swaps the " +
          "label for a text field (`setEditedItem(null)` leaves without saving). In the field, " +
          "Enter saves, Escape cancels, blur saves a non-empty value. Saving goes through " +
          "`updateItemLabel({ id, label })`, which fires cancelable `tvx-item-label-change` " +
          "(`{ key, oldLabel, newLabel }`) and then keeps the new label until the next `.items` — " +
          "persist it yourself.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** @type {Story} */
export const RenameWithF2 = {
  render: () => {
    const tree = createTree({
      items: buildFileTree(),
      defaultExpandedItems: ["src", "components"],
      isItemEditable: (item) => item.id !== "gitignore",
    });
    // the trigger is the consumer's: F2 and double-click here
    tree.addEventListener("keydown", (event) => {
      if (event.key === "F2") tree.setEditedItem(tree.focusedKey);
    });
    tree.addEventListener("dblclick", () => tree.setEditedItem(tree.focusedKey));
    const log = logPanel();
    tree.addEventListener("tvx-item-label-change", (event) => {
      const { detail } = /** @type {CustomEvent} */ (event);
      if (/[/\\]/.test(detail.newLabel)) {
        event.preventDefault(); // Enter keeps the field open; blur drops the value
        log.textContent = `rejected "${detail.newLabel}": no slashes`;
        return;
      }
      log.textContent = `tvx-item-label-change: ${JSON.stringify(detail)}`;
    });
    return stack(
      hintText(
        'Focus a row and press F2, or double-click it. ".gitignore" isn\'t editable; names with ' +
          "a slash are rejected.",
      ),
      tree,
      log,
    );
  },
};

/** @type {Story} */
export const ProgrammaticRename = {
  render: () => {
    const tree = createTree({ items: buildFileTree(), defaultExpandedItems: ["src"] });
    const button = document.createElement("button");
    button.textContent = 'Rename "index.js" → "main.js"';
    button.addEventListener("click", () => tree.updateItemLabel({ id: "index", label: "main.js" }));
    return stack(button, tree);
  },
};

/** @type {Story} */
export const CustomEditor = {
  render: () => {
    const tree = createTree({
      items: buildFileTree(),
      defaultExpandedItems: ["src", "components"],
      isItemEditable: true,
    });
    // slot="edit" replaces the built-in md-text-field
    const editor = document.createElement("div");
    editor.slot = "edit";
    editor.style.cssText = "display: flex; gap: 0.25rem; align-items: center;";
    const input = document.createElement("input");
    input.style.cssText = "flex: 1; min-inline-size: 0; font: inherit;";
    const save = document.createElement("button");
    save.textContent = "Save";
    save.addEventListener("click", () => {
      const id = tree.editedItem;
      if (id === null) return;
      if (tree.updateItemLabel({ id, label: input.value })) tree.setEditedItem(null);
    });
    editor.append(input, save);
    tree.append(editor);
    // a wrapper has no `value`, so fill the input when editing starts
    tree.addEventListener("keydown", (event) => {
      if (event.key !== "F2" || tree.focusedKey === null) return;
      input.value = tree.getItem(tree.focusedKey)?.label ?? "";
      tree.setEditedItem(tree.focusedKey);
    });
    return stack(hintText("Focus a row and press F2. The editor is a slotted div."), tree);
  },
};
