# @symblight/tree-view

A Material Design 3 hierarchical tree view web component built with [Lit](https://lit.dev).
Framework-agnostic — works the same in a plain HTML page, React, Vue, Svelte, or anywhere else
custom elements run.

## Overview

`<tvx-tree-view>` renders a hierarchical list of `<tvx-tree-item>` nodes — parents can be expanded
or collapsed to reveal/hide their children. Follows the
[WAI-ARIA APG tree view pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/): `role="tree"`
/ `role="treeitem"` / `role="group"`, roving `tabindex`, full arrow-key navigation, typeahead, and
`aria-current` for deep-linked selection.

- **Declarative** — hand-author nested `<tvx-tree-item>` elements directly in markup, or build
  them programmatically and assign the array to `.items` (nest a `<tvx-item-sub-tree>` inside an
  item for its children). `.items` calls `replaceChildren()` under the hood, so it expects real
  elements, not plain data — see `buildItem()` in `src/stories/shared.js` for a small helper that
  builds them from `{ id, label, children }`-shaped data.
- **Selection** — single-select by default (`aria-current` on the selected row). Opt into
  `multiSelect` for MUI-style multi-select: a plain click still replaces the selection, Ctrl/Cmd+
  click toggles an item independently, and Shift+click (or Shift+↑/↓) merges a contiguous range
  into the existing selection — no parent/child cascade, selection is a flat `Set<PropertyKey>`.
  `disableSelection` turns selection off entirely; `checkboxSelection` renders a checkbox per row
  (in either mode) that always toggles just that one item.
- **Async loading** — set `.dataSource` (`{ getTreeItems, getChildrenCount }`) to fetch the tree
  lazily: `getChildrenCount(item)` decides which items are groups, `getTreeItems(parent?)` fetches
  a batch (root when called with no parent, a branch's children on expand), with a loading
  placeholder and live-region announcements ("Loading…" / "Loading N items." / "{label} is
  empty."). `.items` still works as a plain synchronous data source when `.dataSource` isn't set
  — or as `initialItems` (the root batch) alongside it.
- **Reordering** — opt in with the `reordering` attribute for drag-and-drop (and `Alt+↑`/`Alt+↓`
  keyboard) moves, veto specific moves with `isItemReorderable`.
- No virtualization in v1 — plain DOM rendering, sized for typical nav/file-tree/menu trees.

```js
import "@symblight/tree-view";

/** @param {{ key: PropertyKey, label: string, children?: object[] }} data */
function buildItem({ key, label, children = [] }) {
  const item = document.createElement("tvx-tree-item");
  item.key = key;
  item.label = label;
  if (children.length) {
    const subTree = document.createElement("tvx-item-sub-tree");
    subTree.append(...children.map(buildItem));
    item.append(subTree);
  }
  return item;
}

const tree = document.querySelector("tvx-tree-view");
tree.items = [
  buildItem({ key: "src", label: "src/", children: [{ key: "index", label: "index.js" }] }),
  buildItem({ key: "readme", label: "README.md" }),
];
tree.addEventListener("tvx-selection-change", (event) => {
  console.log(event.detail.selectedItems); // Set<PropertyKey>
});
```

## Events

| Event | Detail | Notes |
| --- | --- | --- |
| `tvx-selection-change` | `{ selectedItems: Set<PropertyKey> }` | Whole-tree snapshot, fires on any selection change. |
| `tvx-expansion-change` | `{ expandedItems: Set<PropertyKey> }` | Whole-tree snapshot, fires on any expand/collapse. |
| `tvx-expand-change` | `{ key, expanded }` | Per-item, fires when a single item's expansion toggles. |
| `tvx-item-position-change` | `{ key, oldPosition, newPosition }` | Fires when reordering moves an item (drag-and-drop or `Alt+↑`/`Alt+↓`). **Cancelable** — fires *before* the move, `preventDefault()` blocks it. A position is `{ parentId: PropertyKey \| null, index: number }`, `parentId` is `null` for a root-level item. |
| `tvx-load-error` | `{ key, node, error }` | Fires when `dataSource.getTreeItems()` rejects — root load (`key`/`node` both `null`) or a branch's children on expand. |

```js
tree.reordering = true;
tree.addEventListener("tvx-item-position-change", (event) => {
  const { key, oldPosition, newPosition } = event.detail;
  console.log(`${key} moved from`, oldPosition, "to", newPosition);
  // event.preventDefault(); // veto this specific move
});
```

## Install

```bash
npm install @symblight/tree-view lit
```

`lit` is a peer dependency. [`@symblight/wc-material`](https://www.npmjs.com/package/@symblight/wc-material) installs automatically.

## Theming

Every color, size and font is read from CSS custom properties. The components have no hard-coded
theme of their own. Start from a Material Design 3 system token set (`--md-sys-*`), for example one
generated with [`@symblight/md-colors`](https://www.npmjs.com/package/@symblight/md-colors):

```bash
npm install @symblight/md-colors
npx md-colors --sourceColor="#6750A4" --scheme=light --output=./theme.css
```

```html
<link rel="stylesheet" href="./theme.css" />
```

### Token tiers

```
--md-sys-*          MD3 system tokens (your theme.css)
   ↓ fallback
--tvx-tree-view-*   tree-wide theme: typography, color roles, shape
   ↓ default
--tvx-<component>-* one component: --tvx-tree-item-*, --tvx-item-sub-tree-*, --tvx-tree-skeleton-*
```

- **`--tvx-tree-view-*`** retunes every tree component at once. Set it on `tvx-tree-view` or any
  ancestor, and it reaches every item however deep it's nested. No component ever declares one, so
  your value always wins. Each falls back to the matching `--md-sys-*` token, or to a built-in
  default where MD3 has no equivalent.
- **`--tvx-<component>-*`** retunes one component. Its defaults come from the tree tier. Each
  element declares its own defaults, so set these on the element itself (`tvx-tree-item { … }`),
  not on the tree.
- To recolor the `md-*` controls inside the tree as well (checkbox, spinner, skeleton), set
  `--md-sys-color-*` on `tvx-tree-view` instead of `--tvx-tree-view-color-*`.

```css
tvx-tree-view {
  --tvx-tree-view-font-family: "Inter", sans-serif;
  --tvx-tree-view-color-secondary-container: #d8e6ff; /* selected row */
  --tvx-tree-view-row-gap: 0; /* space between root rows */
}

tvx-tree-item {
  --tvx-tree-item-row-height: 2rem;
  --tvx-tree-item-shape: 0.25rem;
}

tvx-item-sub-tree {
  --tvx-item-sub-tree-guide-color: var(--md-sys-color-outline-variant);
}
```

### `--tvx-tree-view-*` reference

| Token | Default | Used by |
| --- | --- | --- |
| `--tvx-tree-view-font-family` | `--md-sys-typescale-font-family` | every component |
| `--tvx-tree-view-font-weight-regular` / `-medium` | `400` / `500` | item label |
| `--tvx-tree-view-body-medium-font-size` / `-line-height` | `0.875rem` / `1.25rem` | item label |
| `--tvx-tree-view-color-<role>` | `--md-sys-color-<role>` | `on-surface` (row text), `on-surface-variant` (chevron, loading row), `surface-container-high` (hover), `secondary-container` / `on-secondary-container` (selected row, drop target), `primary` (focus ring, drop indicator) |
| `--tvx-tree-view-shape-corner-extra-small` / `-small` / `-medium` / `-large` / `-full` | `--md-sys-shape-corner-*` | row shape (`-full`) |
| `--tvx-tree-view-row-gap` | `0.125rem` | space between root-level rows |

### Component tokens

| Token | Default |
| --- | --- |
| `--tvx-tree-item-row-height` / `-padding` / `-gap` | `2.25rem` / `0.5rem` / `0.2rem` |
| `--tvx-tree-item-shape` | `shape-corner-full` |
| `--tvx-tree-item-color` | `on-surface` |
| `--tvx-tree-item-hover-background-color` | `surface-container-high` |
| `--tvx-tree-item-selected-background-color` / `-selected-color` | `secondary-container` / `on-secondary-container` |
| `--tvx-tree-item-focus-outline-color` | `primary` |
| `--tvx-tree-item-chevron-color` / `-loading-color` | `on-surface-variant` |
| `--tvx-tree-item-label-font` | body-medium, `font` shorthand |
| `--tvx-tree-item-drop-target-background-color` / `-drop-indicator-color` | `secondary-container` / `primary` |
| `--tvx-item-sub-tree-indent` | the parent row's padding + half a chevron |
| `--tvx-item-sub-tree-guide-color` / `-guide-width` | `transparent` / `1px` |
| `--tvx-tree-skeleton-row-height` / `-padding` | the enclosing item's row height / padding |
| `--tvx-tree-skeleton-bar-height` | `1em` |

### Using the tokens in your own components

`@symblight/tree-view/tokens.css` is the same token layer every tree component loads first. Add it
to your own component's shadow root, for example custom `slot="leading"` content, and it resolves
`--tvx-tree-view-*` exactly like the built-in components do. Your styles then read the resolved
values, `--_tvx-*`: `--_tvx-color-on-surface`, `--_tvx-body-medium-font-size`,
`--_tvx-shape-corner-full`, and so on.

```js
import tokens from "@symblight/tree-view/tokens.css" with { type: "css" };

class MyBadge extends LitElement {
  static styles = [
    tokens,
    css`
      :host {
        color: var(--_tvx-color-on-surface-variant);
        font-size: var(--_tvx-body-medium-font-size);
      }
    `,
  ];
}
```

The file's rules target `:host`, so it only applies inside a shadow root. With a bundler that
doesn't support CSS module scripts, import the file as a string (Vite: `?inline`) and wrap it in
Lit's `unsafeCSS`.

## Development

```bash
pnpm install
pnpm --filter @symblight/tree-view sb   # Storybook dev server
pnpm --filter @symblight/tree-view test
pnpm --filter @symblight/tree-view build
```

## License

MIT
