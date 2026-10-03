import { html } from "lit";
import starIcon from "@material-design-icons/svg/outlined/star_border.svg?raw";

import { buildFileTree, file, folder, renderFileIcon, renderTrailingIcon } from "./shared.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Tree View/Basics",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "`<tvx-tree-view>` is a WAI-ARIA `tree` rendered from data: `.items` takes any objects, " +
          "read through `getItemId`/`getItemLabel`/`getItemChildren`/`isItemDisabled` (defaults: " +
          "`id`/`label`/`children`/`disabled`). Rows render in the tree's own shadow root and are " +
          'virtualized by default — see "Tree View/Virtualization". Per-row content comes from ' +
          "`renderItemLeading`/`renderItemLabel`/`renderItemTrailing(item, state)`; " +
          "`<tvx-tree-directory-icon ?expanded>` is a ready-made folder glyph for the leading slot.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** @type {Story} */
export const ItemsProperty = {
  render: () => html`
    <tvx-tree-view
      .items=${buildFileTree()}
      .renderItemLeading=${renderFileIcon}
      .renderItemTrailing=${renderTrailingIcon}
    ></tvx-tree-view>
  `,
};

/** @type {Story} */
export const CustomDataShape = {
  render: () => html`
    <tvx-tree-view
      .items=${[
        { uuid: "1", name: "Inbox", entries: [{ uuid: "2", name: "Invoices" }] },
        { uuid: "3", name: "Archive", locked: true },
      ]}
      .getItemId=${(/** @type {any} */ item) => item.uuid}
      .getItemLabel=${(/** @type {any} */ item) => item.name}
      .getItemChildren=${(/** @type {any} */ item) => item.entries}
      .isItemDisabled=${(/** @type {any} */ item) => !!item.locked}
    ></tvx-tree-view>
  `,
};
CustomDataShape.parameters = {
  docs: {
    description: {
      story:
        "The consumer's own objects go in unmapped — the accessors tell the tree where the id, " +
        "label, children and disabled flag live.",
    },
  },
};

/** @type {Story} */
export const LeadingAndTrailing = {
  render: () => html`
    <tvx-tree-view
      .items=${[
        folder({
          id: "src",
          label: "src/",
          children: [file({ id: "button", label: "Button.tsx", trailingIcon: starIcon })],
        }),
        file({ id: "package", label: "package.json", trailingIcon: starIcon }),
      ]}
      .defaultExpandedItems=${["src"]}
      .renderItemLeading=${renderFileIcon}
      .renderItemTrailing=${renderTrailingIcon}
    ></tvx-tree-view>
  `,
};

/** @type {Story} */
export const Compact = {
  render: () => html`
    <tvx-tree-view
      compact
      .items=${buildFileTree()}
      .defaultExpandedItems=${["src", "components"]}
      .defaultSelectedItems=${["button"]}
      .renderItemLeading=${renderFileIcon}
      .renderItemTrailing=${renderTrailingIcon}
    ></tvx-tree-view>
  `,
};
Compact.parameters = {
  docs: {
    description: {
      story:
        "The `compact` attribute packs rows to 28px (default 36px): 18px icons, 13px text and a " +
        "12px indent per level.",
    },
  },
};

/** @type {Story} */
export const IndentGuides = {
  render: () => html`
    <tvx-tree-view
      indent-guides
      .items=${buildFileTree()}
      .defaultExpandedItems=${["src", "components"]}
      .renderItemLeading=${renderFileIcon}
      .renderItemTrailing=${renderTrailingIcon}
    ></tvx-tree-view>
  `,
};
IndentGuides.parameters = {
  docs: {
    description: {
      story:
        "`indent-guides` draws a line under each ancestor's chevron. They show while the tree is " +
        "hovered or focused; at rest only the focused row's parent keeps its line.",
    },
  },
};
