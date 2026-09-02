# @symblight/tree-view

A Material Design 3 hierarchical tree view web component built with [Lit](https://lit.dev).
Framework-agnostic — works the same in a plain HTML page, React, Vue, Svelte, or anywhere else
custom elements run.

The full design — data model, controllers, ARIA mapping, keyboard behavior, public API, more usage
examples — lives in [`tree-view.spec.md`](../../.claude/plans/tree-view.spec.md) at the monorepo
root.

## Overview

`<tvx-tree-view>` renders a hierarchical list of `<tvx-tree-item>` nodes — parents can be expanded
or collapsed to reveal/hide their children. Follows the
[WAI-ARIA APG tree view pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/): `role="tree"`
/ `role="treeitem"` / `role="group"`, roving `tabindex`, full arrow-key navigation, typeahead, and
`aria-current` for deep-linked selection.

- **Data-driven** — set `.items` (an array of `{ id, label, children? }`) and the tree renders
  itself.
- **Declarative** — or hand-author nested `<tvx-tree-item>` elements directly, no `.items` needed.
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

const tree = document.querySelector("tvx-tree-view");
tree.items = [
  { id: "src", label: "src/", children: [{ id: "index", label: "index.js" }] },
  { id: "readme", label: "README.md" },
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

```js
tree.reordering = true;
tree.addEventListener("tvx-item-position-change", (event) => {
  const { key, oldPosition, newPosition } = event.detail;
  console.log(`${key} moved from`, oldPosition, "to", newPosition);
  // event.preventDefault(); // veto this specific move
});
```

See the spec doc linked above for the full public API, the keyboard table, and more usage
examples.

## Install

```bash
npm install @symblight/tree-view lit
```

`lit` is a peer dependency. [`@symblight/wc-material`](https://www.npmjs.com/package/@symblight/wc-material) installs automatically.

## Theming

Every color is read from `--md-sys-color-*` custom properties (Material Design 3 system color
tokens) — the component has no colors of its own. Generate a token set with
[`@symblight/md-colors`](https://www.npmjs.com/package/@symblight/md-colors):

```bash
npm install @symblight/md-colors
npx md-colors --sourceColor="#6750A4" --scheme=light --output=./theme.css
```

```html
<link rel="stylesheet" href="./theme.css" />
```

## Development

```bash
pnpm install
pnpm --filter @symblight/tree-view sb   # Storybook dev server
pnpm --filter @symblight/tree-view test
pnpm --filter @symblight/tree-view build
```

## License

MIT
