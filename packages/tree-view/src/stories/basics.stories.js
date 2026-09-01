import { html } from "lit";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import "../index.js";
import "@symblight/wc-material/icon";

import starIcon from "@material-design-icons/svg/outlined/star_border.svg?raw";

import { buildFileTree, buildItem, file, folder, fileIcon, icon } from "./shared.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Tree View/Basics",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "`<tvx-tree-view>` is a WAI-ARIA `tree` (role=\"tree\"/\"treeitem\"/\"group\") built from real " +
          "`<tvx-tree-item>` elements — there's no separate plain-data shape to convert. Setting " +
          "`.items` is equivalent to `replaceChildren(...items)`; writing the same elements as " +
          "markup produces the identical light-DOM tree. A branch's children live in a sibling " +
          "`<tvx-item-sub-tree>` (its own `role=\"group\"` boundary), not straight inside the parent " +
          "`<tvx-tree-item>` — this is what lets a node's default slot unambiguously tell apart " +
          "\"nested children\" from \"rich label content\" with a single tag check. `leading`/`trailing` " +
          "slots carry per-row icons/badges; `<tvx-tree-directory-icon>` dropped into `leading` " +
          "auto-swaps between an open/closed folder glyph off the branch's own expand state. See " +
          "the other \"Tree View/*\" categories for selection, async loading, reordering, keyboard " +
          "nav, and theming.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

// ─── Declarative — hand-authored markup, no .items ──────────────────────────

/** @type {Story} */
export const Declarative = {
  render: () => html`
    <tvx-tree-view>
      <tvx-tree-item key="src" label="src/">
        <tvx-tree-directory-icon slot="leading"></tvx-tree-directory-icon>
        <tvx-item-sub-tree>
          <tvx-tree-item key="components" label="components/">
            <tvx-tree-directory-icon slot="leading"></tvx-tree-directory-icon>
            <tvx-item-sub-tree>
              <tvx-tree-item key="button" label="button.js">
                <md-icon slot="leading">${unsafeSVG(fileIcon)}</md-icon>
              </tvx-tree-item>
            </tvx-item-sub-tree>
          </tvx-tree-item>
          <tvx-tree-item key="index" label="index.js">
            <md-icon slot="leading">${unsafeSVG(fileIcon)}</md-icon>
          </tvx-tree-item>
        </tvx-item-sub-tree>
      </tvx-tree-item>
      <tvx-tree-item key="gitignore" label=".gitignore">
        <md-icon slot="leading">${unsafeSVG(fileIcon)}</md-icon>
      </tvx-tree-item>
      <tvx-tree-item key="readme" label="README.md">
        <md-icon slot="leading">${unsafeSVG(fileIcon)}</md-icon>
      </tvx-tree-item>
    </tvx-tree-view>
  `,
};
Declarative.parameters = {
  docs: {
    description: {
      story:
        "The same shape every other story builds via `.items`/`buildItem()`, just written by hand " +
        "instead: each branch's children sit inside their own `<tvx-item-sub-tree>`, auto-slotted " +
        "onto `sub-tree` — no `slot=\"...\"` attribute needed anywhere in this markup.",
    },
  },
};

// ─── Built via `.items` — same tree, built as real elements in JS ───────────

/** @type {Story} */
export const ItemsProperty = {
  render: () => {
    const tree = document.createElement("tvx-tree-view");
    tree.items = buildFileTree();
    return tree;
  },
};
ItemsProperty.parameters = {
  docs: {
    description: {
      story:
        "`.items` is a plain `replaceChildren()` convenience, not a data-to-DOM conversion step — " +
        "you build real `<tvx-tree-item>`/`<tvx-item-sub-tree>` elements yourself (see `buildItem()` " +
        "in `shared.js`, a pattern worth writing once per app) and hand the array over. This " +
        "produces byte-for-byte the same light-DOM tree the `Declarative` story writes by hand — " +
        "there is no second, hidden data model to keep in sync.",
    },
  },
};

// ─── Leading + trailing slots together ───────────────────────────────────────

/** `leading` (a directory icon or a file icon) plus `trailing` (a per-row status icon) together. */
export const LeadingAndTrailingSlots = () => {
  const tree = document.createElement("tvx-tree-view");

  /** @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item */
  function withTrailingStar(item) {
    const star = icon(starIcon);
    star.slot = "trailing";
    item.append(star);
    return item;
  }

  const buttonFile = withTrailingStar(buildItem(file({ id: "button", label: "Button.tsx" })));
  const packageFile = withTrailingStar(buildItem(file({ id: "package", label: "package.json" })));
  const src = buildItem(folder({ id: "src", label: "src/" }));
  const subTree = document.createElement("tvx-item-sub-tree");
  subTree.append(buttonFile);
  src.append(subTree);

  tree.items = [src, packageFile];
  return tree;
};
