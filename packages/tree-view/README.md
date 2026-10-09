# @symblight/tree-view

A virtualized Material Design 3 tree view web component built with [Lit](https://lit.dev).
Framework-agnostic — works the same in a plain HTML page, React, Vue, Svelte, or anywhere else
custom elements run.

## Overview

`<tvx-tree-view>` renders hierarchical data as a list of rows; branches expand and collapse to show
or hide their children. It follows the
[WAI-ARIA APG tree view pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/): `role="tree"`
/ `role="treeitem"` with `aria-level` / `aria-setsize` / `aria-posinset`, roving `tabindex`, full
arrow-key navigation, typeahead, and `aria-current` for the selected row.

- **Data in, rows out** — `.items` takes your own objects. By default the tree reads `id`, `label`,
  `children` and `disabled`; point it anywhere else with `getItemId` / `getItemLabel` /
  `getItemChildren` / `isItemDisabled`.
- **Virtualized** — only the visible rows (plus a small overscan) are in the DOM, via
  [`@tanstack/lit-virtual`](https://tanstack.com/virtual). The tree is its own scroll container, so
  give it a `height` or `max-height`. The focused row stays rendered while scrolled away, so
  keyboard focus is never lost. Add `no-virtualization` to render every row instead.
- **Custom row content** — `renderItemLeading` / `renderItemLabel` / `renderItemTrailing` return a
  Lit template (or any renderable value) for each row. The tree keeps ownership of the chevron,
  checkbox and ARIA attributes.
- **Selection** — single-select by default. `multiSelect` enables MUI-style selection: a plain
  click replaces the selection, Ctrl/Cmd+click toggles one item, Shift+click (or Shift+↑/↓) merges
  a contiguous range from the last clicked item. `checkboxSelection` adds a checkbox per row that
  cascades through a branch's subtree (a branch is checked when its whole subtree is).
  `disableSelection` turns selection off.
- **Async loading** — set `.dataSource` (`{ getTreeItems, getChildrenCount }`) to load the tree
  lazily, with shimmer or spinner rows while loading and live-region announcements.
- **Reordering** — the `reordering` attribute enables drag-and-drop and `Alt+↑`/`Alt+↓` moves.
  The tree moves the item in its own model and fires a cancelable event; your `.items` arrays are
  never mutated.

```js
import { html } from "lit";
import "@symblight/tree-view";

const tree = document.querySelector("tvx-tree-view");
tree.items = [
  { id: "src", label: "src/", children: [{ id: "index", label: "index.js" }] },
  { id: "readme", label: "README.md" },
];
tree.renderItemLeading = (item, { expanded }) =>
  item.children
    ? html`<tvx-tree-directory-icon ?expanded=${expanded}></tvx-tree-directory-icon>`
    : undefined;
tree.addEventListener("tvx-selection-change", (event) => {
  console.log(event.detail.selectedItems); // Set<PropertyKey>
});
```

```html
<tvx-tree-view style="height: 480px"></tvx-tree-view>
```

## API

### Properties

| Property                                                       | Attribute            | Default                     | Description                                                                                                                                                                                                      |
| -------------------------------------------------------------- | -------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items`                                                        | —                    | `undefined`                 | Tree data — any objects.                                                                                                                                                                                         |
| `getItemId`                                                    | —                    | `(item) => item.id`         | Unique id (`PropertyKey`) of an item.                                                                                                                                                                            |
| `getItemLabel`                                                 | —                    | `(item) => item.label`      | Row text; also used by typeahead.                                                                                                                                                                                |
| `getItemChildren`                                              | —                    | `(item) => item.children`   | Child items, or `undefined` for a leaf.                                                                                                                                                                          |
| `isItemDisabled`                                               | —                    | `(item) => !!item.disabled` | Disabled rows can be focused but not selected, activated or dragged.                                                                                                                                             |
| `renderItemLeading` / `renderItemLabel` / `renderItemTrailing` | —                    | `undefined`                 | `(item, state) => unknown` — content for the row's leading slot, label (replaces the plain text) and trailing slot. `state` is `{ id, label, level, expanded, selected, indeterminate, disabled, hasChildren }`. |
| `noVirtualization`                                             | `no-virtualization`  | `false`                     | Render every row instead of only the visible ones.                                                                                                                                                               |
| `multiSelect`                                                  | `multi-select`       | `false`                     | Ctrl/Cmd+click and Shift+click/Shift+↑/↓ selection.                                                                                                                                                              |
| `checkboxSelection`                                            | `checkbox-selection` | `false`                     | A checkbox per row; checking a branch checks its subtree. Row clicks then only toggle expansion.                                                                                                                 |
| `expansionTrigger`                                             | `expansion-trigger`  | `"content"`                 | `"content"`: clicking anywhere on a row toggles a branch. `"icon"`: only the chevron does; keyboard is unchanged.                                                                                                |
| `disableSelection`                                             | `disable-selection`  | `false`                     | No selection at all; rows still focus and branches still toggle.                                                                                                                                                 |
| `dataSource`                                                   | —                    | `undefined`                 | Lazy loader, see [Async loading](#async-loading).                                                                                                                                                                |
| `reordering`                                                   | `reordering`         | `false`                     | Drag-and-drop and `Alt+↑`/`Alt+↓` reordering.                                                                                                                                                                    |
| `compact`                                                      | `compact`            | `false`                     | Dense rows: 28px instead of 36px, 18px icons, 13px text, 12px indent per level.                                                                                                                                  |
| `indentGuides`                                                 | `indent-guides`      | `false`                     | A vertical line under each ancestor's chevron. All show while the tree is hovered or focused; at rest only the focused row's parent keeps its line.                                                              |
| `isItemReorderable`                                            | —                    | `undefined`                 | `(item) => boolean` — vetoes picking an item up; it can still be a drop target.                                                                                                                                  |
| `isItemEditable`                                               | —                    | `false`                     | `true`, or `(item) => boolean` — items `editing.start()` may edit. Disabled items never are.                                                                                                                     |
| `getHref`                                                      | —                    | `undefined`                 | `(item) => string \| undefined` — URL opened by middle-click / Ctrl+Enter.                                                                                                                                       |
| `defaultExpandedItems` / `defaultSelectedItems`                | —                    | `undefined`                 | Ids applied once, when the first items exist.                                                                                                                                                                    |
| `expandedItems` / `selectedItems`                              | —                    | —                           | Live `Set<PropertyKey>` snapshots; assigning a new set replaces the state.                                                                                                                                       |

### Imperative API

The imperative API is grouped into **namespaces** — getters on the element (and on
[`TreeViewController`](#treeviewcontroller)):

```js
const tree = document.querySelector("tvx-tree-view");

tree.expansion.collapseAll();
tree.selection.clear();
await tree.navigation.reveal(searchHitId, { align: "center" });
tree.editing.start(id);
tree.nodes.move(id, { parentId: archiveId, index: 0 });
await tree.loading.reload(folderId);
```

- Reads are `get*` / `is*`; everything else is an action. Ids are positional.
- An unknown id reads as the empty value (`false`, `null`, `[]`) and actions ignore it.
- Namespace objects are frozen and stable — destructuring (`const { selection } = tree`) is fine.
- `expandedItems` / `selectedItems` stay as properties for controlled use.

#### `expansion`

| Method                          | Notes                                                         |
| ------------------------------- | ------------------------------------------------------------- |
| `expand(id)` / `collapse(id)`   |                                                               |
| `toggle(id)`                    |                                                               |
| `expandAll()` / `collapseAll()` | Every loaded branch; lazily loaded children arrive collapsed. |
| `set(ids)` / `get()`            | Same as assigning / reading `expandedItems`.                  |
| `isExpanded(id)`                | `false` for unknown ids and leaves.                           |

#### `selection`

| Method                        | Notes                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `select(id)` / `deselect(id)` | No cascade. Ignored under `disableSelection` and on disabled items.                 |
| `set(ids)` / `get()`          | Same as assigning / reading `selectedItems`.                                        |
| `clear()`                     | No event when nothing was selected.                                                 |
| `isSelected(id)`              |                                                                                     |
| `getState(id)`                | `{ selected, indeterminate }` — derived from the subtree under `checkboxSelection`. |

#### `nodes`

| Method                   | Notes                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getItem(id)`            | Your data item, or `null`.                                                                                                                                                                  |
| `getParentId(id)`        | `null` at the root.                                                                                                                                                                         |
| `getChildIds(parentId?)` | The root without an argument; `[]` for a leaf or an unloaded branch.                                                                                                                        |
| `getPosition(id)`        | `{ parentId, index }`, or `null`.                                                                                                                                                           |
| `move(id, position)`     | Fires cancelable `tvx-item-position-change`, then moves; returns whether it moved. Not gated by `reordering` / `isItemReorderable`. `false` without an event for impossible or no-op moves. |

#### `editing`

| Method                   | Notes                                                                                                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start(id)`              | Swaps an editable item's label for a text input (or your `slot="edit"` element), focused with its text selected. Enter saves, Escape cancels, focus leaving it saves a non-empty value. Starting it (F2, double-click, a menu) is up to you. |
| `cancel()`               | Leaves without saving.                                                                                                                                                                                                                       |
| `getEdited()`            | Id of the item being edited, or `null`.                                                                                                                                                                                                      |
| `updateLabel(id, label)` | Relabels until the next `.items`; fires cancelable `tvx-item-label-change` first. Returns whether the label changed.                                                                                                                         |
| `isEditable(id)`         |                                                                                                                                                                                                                                              |

#### `navigation`

| Method                       | Notes                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `focusItem(id)`              | Moves the Tab stop, focuses and scrolls. `false` when the row isn't visible.                  |
| `getFocused()`               | Id of the row holding the Tab stop.                                                           |
| `scrollToItem(id, options?)` | No focus change. `options`: `{ align: "start" \| "center" \| "end" \| "nearest", behavior }`. |
| `reveal(id, options?)`       | Expands the loaded ancestors, then scrolls; `false` when the id isn't loaded.                 |

`"smooth"` drops to `"auto"` under `prefers-reduced-motion`.

#### `loading`

| Method           | Notes                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `reload(id?)`    | Refetches a branch's children (the root without an id). A collapsed branch is only unloaded and fetches on next expand. |
| `isLoading(id?)` | The root without an id.                                                                                                 |

### `TreeViewController`

For your own Lit element next to (or inside) a tree — a toolbar, a status line:

```js
import { TreeViewController } from "@symblight/tree-view";

class TreeToolbar extends LitElement {
  // a sibling tree: pass it, or a getter re-run on every update; omit it inside a <tvx-tree-view>
  #tree = new TreeViewController(this, () => this.nextElementSibling);

  render() {
    const { selection } = this.#tree;
    return html`
      <span>${this.#tree.selectedItems.size} selected</span>
      <button @click=${() => selection.clear()}>Clear</button>
    `;
  }
}
```

Reactive properties — read them in `render()`; the element re-renders only when one it read
changed: `selectedItems`, `expandedItems`, `focusedItem`, `editedItem`, `isLoading` (the root or
any branch). Namespace `get*` calls are not tracked. Also `connected` and the six namespaces, which
are no-ops until a tree is found.

### Events

| Event                      | Detail                                | Notes                                                                                                                                                                            |
| -------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tvx-selection-change`     | `{ selectedItems: Set<PropertyKey> }` | Whole-tree snapshot after any selection change.                                                                                                                                  |
| `tvx-expansion-change`     | `{ expandedItems: Set<PropertyKey> }` | Whole-tree snapshot after any expand/collapse.                                                                                                                                   |
| `tvx-expand-change`        | `{ id, expanded }`                    | One item's expansion toggled.                                                                                                                                                    |
| `tvx-item-position-change` | `{ id, oldPosition, newPosition }`    | **Cancelable**, fires before a reorder moves an item; `preventDefault()` blocks it. A position is `{ parentId: PropertyKey \| null, index }` (`parentId` is `null` at the root). |
| `tvx-item-label-change`    | `{ id, oldLabel, newLabel }`          | **Cancelable**, fires before `editing.updateLabel()` changes a label; `preventDefault()` blocks it.                                                                              |
| `tvx-children-loaded`      | `{ id, item, items }`                 | A `dataSource` batch landed; `id`/`item` are `null` for the root.                                                                                                                |
| `tvx-load-error`           | `{ id, item, error }`                 | `dataSource.getTreeItems()` rejected.                                                                                                                                            |
| `tvx-open`                 | `{ id, item, newTab: true }`          | **Cancelable**; middle-click / Ctrl+Enter on an item `getHref` didn't give a URL for.                                                                                            |

### Keyboard

| Key                   | Action                                                                                |
| --------------------- | ------------------------------------------------------------------------------------- |
| `↓` / `↑`             | Next / previous visible row. With Shift in `multiSelect`: extend the range selection. |
| `→`                   | Expand a collapsed branch, or move into an expanded branch's first child.             |
| `←`                   | Collapse an expanded branch, or move to the parent.                                   |
| `Home` / `End`        | First / last visible row.                                                             |
| `PageUp` / `PageDown` | Jump by a viewport of rows.                                                           |
| `Backspace`           | Move to the parent.                                                                   |
| `Enter`               | Toggle a branch. With Ctrl/Cmd: open in a new tab (see `getHref`).                    |
| `Space`               | Select the row (with `checkboxSelection`: toggle its checkbox).                       |
| `Alt+↑` / `Alt+↓`     | Move the row among its siblings (with `reordering`).                                  |
| printable characters  | Typeahead: focus the next row whose label starts with what was typed.                 |

## Async loading

```js
tree.dataSource = {
  // `parent` is undefined for the root batch
  getTreeItems: (parent) => fetch(`/api/tree?parent=${parent?.id ?? ""}`).then((r) => r.json()),
  // 0 = leaf, a number = branch with a known count, undefined = branch with an unknown count
  getChildrenCount: (item) => item.childCount,
};
```

- Without `.items`, the root is fetched with `getTreeItems()`. If `.items` is already set, it is
  used as the root batch.
- A branch's children are fetched the first time it expands. A known count shows up to 8 shimmer
  rows while loading; an unknown count shows one spinner row.
- A branch that loads empty becomes a leaf ("{label} is empty." is announced).
- A failed load fires `tvx-load-error`; the next expand tries again.
- `tree.loading.reload(id?)` refetches a branch (or the root); expansion and selection are kept by id.
- `getChildrenCount` is called once per item, when the item is added.

## Custom label editor

Put an element in the `edit` slot to replace the built-in text input. While an item is edited
the tree shows it in that row, sets its `value` to the current label (when it has a `value`
property), focuses it — or its first `input`/`textarea` — and selects the text. Enter, Escape and
focus leaving the element work as with the built-in input; the saved value is read from the
control the key or focus event came from. Moving focus between controls inside the element (e.g. a
save button) doesn't end editing; such a button can save with
`tree.editing.updateLabel(tree.editing.getEdited(), label)` and `tree.editing.cancel()`.

```html
<tvx-tree-view>
  <md-text-field slot="edit" variant="filled"></md-text-field>
</tvx-tree-view>
```

## Migrating to the namespaces

| Before                                      | After                                               |
| ------------------------------------------- | --------------------------------------------------- |
| `setItemExpansion({ id, expand })`          | `expansion.expand(id)` / `expansion.collapse(id)`   |
| `isItemExpanded(id)`                        | `expansion.isExpanded(id)`                          |
| `expandAll()` / `collapseAll()`             | `expansion.expandAll()` / `expansion.collapseAll()` |
| `setItemSelection({ id, selected })`        | `selection.select(id)` / `selection.deselect(id)`   |
| `getItem(id)`                               | `nodes.getItem(id)`                                 |
| `updateItemLabel({ id, label })`            | `editing.updateLabel(id, label)`                    |
| `setEditedItem(id)` / `setEditedItem(null)` | `editing.start(id)` / `editing.cancel()`            |
| `editedItem`                                | `editing.getEdited()`                               |
| `focusItem(id)`                             | `navigation.focusItem(id)`                          |
| `focusedKey`                                | `navigation.getFocused()`                           |
| event `detail.key` / `detail.node`          | `detail.id` / `detail.item`                         |
| `buildIndexTree` & co. from the package     | removed — internal                                  |

## Install

```bash
npm install @symblight/tree-view lit
```

`lit` is a peer dependency. [`@symblight/wc-material`](https://www.npmjs.com/package/@symblight/wc-material),
`@tanstack/lit-virtual` and `@atlaskit/pragmatic-drag-and-drop` install automatically.

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
--tvx-tree-item-*   row tokens
```

- **`--tvx-tree-view-*`** retunes the whole tree. Set it on `tvx-tree-view` or any ancestor. No
  component declares one, so your value always wins. Each falls back to the matching `--md-sys-*`
  token, or to a built-in default where MD3 has no equivalent.
- **`--tvx-tree-item-*`** retunes the rows. Their defaults are declared on `tvx-tree-view`, so set
  them on the `tvx-tree-view` element itself.
- To recolor the `md-*` controls inside the tree as well (checkbox, spinner, skeleton), set
  `--md-sys-color-*` on `tvx-tree-view` instead of `--tvx-tree-view-color-*`.
- Rows expose parts for anything else: `::part(row | chevron | checkbox | checkbox-control |
checkbox-box | leading | label | label-input | trailing | placeholder)`.
- The checkbox's own `--md-checkbox-*` tokens are declared on `md-checkbox` itself, so setting them
  on `tvx-tree-view` has no effect — set them on `::part(checkbox-control)`. Shape and border go on
  `::part(checkbox-box)`.

```css
tvx-tree-view {
  --tvx-tree-view-font-family: "Inter", sans-serif;
  --tvx-tree-view-color-secondary-container: #d8e6ff; /* selected row */
  --tvx-tree-item-row-height: 2rem;
  --tvx-tree-item-shape: 0.25rem;
}

tvx-tree-view::part(label) {
  letter-spacing: 0.01em;
}

tvx-tree-view::part(checkbox-control) {
  --md-checkbox-border-color: #79747e;
}

tvx-tree-view::part(checkbox-box) {
  border-radius: 0.25rem;
}
```

### `--tvx-tree-view-*` reference

| Token                                                                                  | Default                          | Used by                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--tvx-tree-view-font-family`                                                          | `--md-sys-typescale-font-family` | every component                                                                                                                                                                                                                                                           |
| `--tvx-tree-view-font-weight-regular` / `-medium`                                      | `400` / `500`                    | row label                                                                                                                                                                                                                                                                 |
| `--tvx-tree-view-body-medium-font-size` / `-line-height`                               | `0.875rem` / `1.25rem`           | row label                                                                                                                                                                                                                                                                 |
| `--tvx-tree-view-color-<role>`                                                         | `--md-sys-color-<role>`          | `on-surface` (row text, hover/pressed state layer), `on-surface-variant` (chevron, icons, loading row), `secondary-container` / `on-secondary-container` (selected row), `secondary` (focus ring), `primary` (drop target, drop indicator), `outline-variant` (scrollbar) |
| `--tvx-tree-view-shape-corner-extra-small` / `-small` / `-medium` / `-large` / `-full` | `--md-sys-shape-corner-*`        | row shape (`-full`)                                                                                                                                                                                                                                                       |
| `--tvx-tree-view-row-gap`                                                              | `0`                              | space between rows                                                                                                                                                                                                                                                        |

### Row tokens

| Token                                                                        | Default                                                                 |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `--tvx-tree-item-row-height`                                                 | `2.25rem` · compact `1.75rem`                                           |
| `--tvx-tree-item-inset`                                                      | gap between the row and the tree's edges: `0.5rem` · compact `0.375rem` |
| `--tvx-tree-item-padding-start` / `-padding-end`                             | `0.25rem` / `0.625rem`                                                  |
| `--tvx-tree-item-indent`                                                     | per nesting level, inside the row: `1rem` · compact `0.75rem`           |
| `--tvx-tree-item-chevron-size` / `-icon-size`                                | `1.5rem` / `1.25rem` · compact `1.25rem` / `1.125rem`                   |
| `--tvx-tree-item-checkbox-size`                                              | checkbox hit zone: `2rem` · compact `1.5rem`                            |
| `--tvx-tree-item-shape`                                                      | `shape-corner-full`                                                     |
| `--tvx-tree-item-color`                                                      | `on-surface`                                                            |
| `--tvx-tree-item-hover-background-color` / `-pressed-background-color`       | state layer over the row: `on-surface` 8% / 10%                         |
| `--tvx-tree-item-selected-background-color` / `-selected-color`              | `secondary-container` / `on-secondary-container`                        |
| `--tvx-tree-item-focus-outline-color`                                        | `secondary` (3px ring, keyboard focus only)                             |
| `--tvx-tree-item-chevron-color` / `-icon-color` / `-loading-color`           | `on-surface-variant`                                                    |
| `--tvx-tree-item-label-font`                                                 | body-medium, `font` shorthand · compact 13px                            |
| `--tvx-tree-item-drop-target-background-color` / `-drop-indicator-color`     | `primary` 16% / `primary`                                               |
| `--tvx-tree-item-label-input-background-color` / `-outline-color` / `-shape` | `surface-container-lowest` / `primary` / `shape-corner-extra-small`     |
| `--tvx-tree-item-guide-color` / `-guide-active-color`                        | `outline-variant` / `on-surface-variant` 45%                            |
| `--tvx-tree-skeleton-bar-height`                                             | `1em`                                                                   |

### Using the tokens in your own components

`@symblight/tree-view/tokens.css` is the same token layer the tree loads first. Add it to your own
component's shadow root, for example custom content returned from `renderItemLeading`, and it
resolves `--tvx-tree-view-*` exactly like the tree does. Your styles then read the resolved values,
`--_tvx-*`: `--_tvx-color-on-surface`, `--_tvx-body-medium-font-size`,
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
