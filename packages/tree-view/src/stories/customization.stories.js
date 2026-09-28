import "../index.js";

import addIcon from "@material-design-icons/svg/outlined/add.svg?raw";

import { buildFileTree, hintText, icon, stack } from "./shared.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Tree View/Customization",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Every per-row control is a named slot, not a hardcoded element: `slot=\"checkbox\"` " +
          "replaces the built-in `<md-checkbox>` and `slot=\"chevron\"` replaces the default arrow, " +
          "both falling back to their defaults only when nothing is slotted in. Because a slotted " +
          "control lives in light DOM, it isn't driven by the component's internal state the way the " +
          "defaults are — an app supplying its own checkbox is responsible for keeping its `checked` " +
          "in sync with `tvx-selection-change`, same as below. Colors are unaffected either way: " +
          "tokens come in three tiers — `--md-sys-*` feeds `--tvx-tree-view-*` (tree-wide typography, " +
          "color roles, shape; set on `tvx-tree-view`), which feeds `--tvx-<component>-*` " +
          "(`--tvx-tree-item-*`, `--tvx-item-sub-tree-*`, `--tvx-tree-skeleton-*`; set on the element " +
          "itself). Any of them accepts a literal CSS value, not just another token.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** Recursively swaps a native `<input type=\"checkbox\">` in for the default `<md-checkbox>` on
 * every item, and a plus icon in for the default arrow on every branch — slots apply per-item,
 * so a tree with nested folders needs this walking its whole subtree, not just the top level.
 * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item */
function customize(item) {
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.slot = "checkbox";
  checkbox.tabIndex = -1;
  checkbox.style.accentColor = "#7c3aed";
  checkbox.style.cursor = "pointer";
  if (item.disabled) checkbox.disabled = true;
  item.append(checkbox);

  // `item.hasChildren` isn't reliable yet — it's only set once the item connects and claims its
  // sub-tree — so a direct sub-tree lookup is what actually tells branches from leaves here.
  const subTree = item.querySelector(":scope > tvx-item-sub-tree");
  if (subTree) {
    const plus = icon(addIcon);
    plus.slot = "chevron";
    plus.style.fontSize = "1.25rem";
    item.append(plus);
    // Tagged so the story's ::part(label) rule below can bold just group items' labels.
    item.classList.add("customization-group-item");
    for (const child of subTree.children) {
      customize(/** @type {import("../components/tree-item/tree-item.js").TvxTreeItem} */ (child));
    }
  }
  return item;
}

// ─── Native checkbox + plus-icon chevron + a non-token color palette ────────

/** @type {Story} */
export const CustomizedTree = {
  render: () => {
    const tree = document.createElement("tvx-tree-view");
    tree.multiSelect = true;
    tree.checkboxSelection = true;
    tree.defaultExpandedItems = new Set(["src", "components"]);
    tree.items = buildFileTree().map(customize);

    tree.classList.add("customization-tree");

    // The slotted checkbox is plain light DOM — it doesn't see `selected` change the way the
    // built-in `<md-checkbox>` does via Lit's own render(), so keeping its `checked` in sync is
    // this story's job, not the component's.
    const syncCheckboxes = () => {
      for (const checkbox of /** @type {NodeListOf<HTMLInputElement>} */ (
        tree.querySelectorAll('input[type="checkbox"]')
      )) {
        const item = /** @type {import("../components/tree-item/tree-item.js").TvxTreeItem | null} */ (
          checkbox.closest("tvx-tree-item")
        );
        checkbox.checked = !!item && tree.selectedItems.has(item.key);
      }
    };
    tree.addEventListener("tvx-selection-change", syncCheckboxes);
    syncCheckboxes();

    // Component tokens go on the items themselves — each item's own :host declares its defaults, so
    // a value set on the tree would be shadowed. Group labels are bolded through the `label` part,
    // scoped via the class customize() tags them with.
    const style = document.createElement("style");
    style.textContent = `
      .customization-tree tvx-tree-item {
        --tvx-tree-item-shape: 0.2rem;
        --tvx-tree-item-chevron-color: #7c3aed;
        --tvx-tree-item-hover-background-color: #f5f3ff;
        --tvx-tree-item-selected-background-color: #ede9fe;
        --tvx-tree-item-selected-color: #5b21b6;
        --tvx-tree-item-focus-outline-color: #7c3aed;
      }
      .customization-group-item::part(label) { font-weight: 700; }
    `;

    return stack(
      hintText(
        "slot=\"checkbox\" swaps in a native <input type=\"checkbox\"> and slot=\"chevron\" swaps in " +
          "a plus icon on every branch, applied recursively down the whole tree. The purple palette " +
          "and 0.2rem row shape come from --tvx-tree-item-* tokens set on every tvx-tree-item, as " +
          "literal hex values instead of --md-sys-color-* tokens. Group " +
          "items (folders) get a bolder label via ::part(label), the same CSS part every row exposes.",
      ),
      style,
      tree,
    );
  },
};
