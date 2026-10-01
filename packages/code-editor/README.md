# @symblight/code-editor

A Material Design 3 code editor web component built on [CodeMirror 6](https://codemirror.net) and [Lit](https://lit.dev).

> Work in progress.

## Usage

The editor itself knows no language — highlighting comes from plugins. Ready-made presets live in
`@symblight/code-editor/presets`; every grammar loads lazily, the first time a file needs it.

```js
import "@symblight/code-editor";
import { webPreset, pythonPreset } from "@symblight/code-editor/presets";

editor.plugins = [...webPreset, ...pythonPreset];
```

```html
<!-- language picked from the file extension -->
<cdx-code-editor filename="src/app.tsx"></cdx-code-editor>

<!-- or explicitly; `language` wins over `filename` -->
<cdx-code-editor language="rust"></cdx-code-editor>
```

Presets: `webPreset`, `pythonPreset`, `rustPreset`, `goPreset`, `cppPreset`, `dotnetPreset`,
`jvmPreset`, `sqlPreset`, `allPreset` (every grammar in `@codemirror/language-data`). Single-language
plugins (`pythonPlugin`, `csharpPlugin`, …) and `createLanguagePlugin(id, names)` are exported too.

### Custom plugins

```js
import { defineCdxPlugin } from "@symblight/code-editor";

const myPlugin = defineCdxPlugin({
  id: "my-lang",
  languages: [myLanguageDescription], // grammars, loaded lazily
  extensions: [], // always on
  forLanguage: { "my-lang": () => myLinter() }, // only while that language is active
});
```

### Value

- Uncontrolled: `defaultValue`.
- Controlled: `value` + `cdx-change` (`detail.value`, `detail.changes`). A `value` set from outside
  keeps the caret and stays out of undo history.

### Features

On by default, each switched off by an attribute: `no-line-numbers`, `no-folding`, `no-active-line`,
`no-bracket-matching`, `no-indent-guides`. Also `no-autocomplete`, `no-search`. Opt-in: `wrap`, `tab-size`, `density="compact"`.

Diagnostics: pass `diagnostics` (CodeMirror `Diagnostic[]`, e.g. from an LSP) or bring a linter in
a plugin. A pill in the corner counts them and jumps to the first one.

### Changes and review

Two layers, like an IDE. Data goes on the editor (or into `createState`), presentation on an
optional `<cdx-diff>` per layer — without one, the data alone turns the layer on with defaults.

```html
<cdx-code-editor .baseline="${headText}" .reviewBase="${textBeforeAgent}">
  <!-- quiet: gutter marks against HEAD; click a mark for the chunk with Revert -->
  <cdx-diff slot="diff" kind="baseline" expanded></cdx-diff>

  <!-- loud: proposals inline, a header per chunk, a review bar above the text -->
  <cdx-diff
    slot="diff"
    kind="review"
    author="Agent"
    tone="tertiary"
    accept-label="Accept"
    .getAuthor="${(chunk)"
    =""
  >
    (chunk ? blame(chunk).name : "Agent")} .getAvatarUrl=${(chunk) => avatarUrl(chunk)} ></cdx-diff
  >
</cdx-code-editor>
```

- `baseline` — the text changes are measured against (HEAD). `expanded` on its `<cdx-diff>` shows
  every chunk inline ("Diff vs HEAD"); Escape closes a peeked chunk.
- `reviewBase` — the text before proposed edits. Accept folds a chunk into it
  (`cdx-review-base-change`), Reject reverts the text (`cdx-change`). `cdx-review-complete` fires
  once nothing is pending; `acceptAllChanges()` / `rejectAllChanges()` do the bar's buttons.
- `<cdx-diff>`: `kind`, `author`, `tone` (`tertiary` | `neutral` | `primary` | `error`), `icon`,
  `accept-label`, `reject-label`, `revert-label`, `accept-all-label`, `reject-all-label`,
  `no-review-bar`, `expanded`, and `.getAuthor` / `.getAvatarUrl` — called per chunk, and with no
  argument for the review bar; a URL renders as `md-avatar`. Call `refresh()` when their data changes.
- `diffStats` and `cdx-diff-change` carry the numbers for a status bar (`+4 −2 vs HEAD`).
- Keys: F7 / Shift-F7 next/previous change, Mod-Alt-Enter / Mod-Alt-Backspace accept / reject the
  chunk under the caret.
- Theming: `--cdx-diff-tone-<tone>-{accent,on-accent,surface,container,on-container}`,
  `--cdx-diff-{added,removed}-background-color`, `--cdx-diff-{added,removed}-sign-color`,
  `--cdx-chunk-*`; parts `chunk-header`, `chunk-author`, `chunk-action`, ….

#### Review bar

Tokens, set on `cdx-code-editor` or any ancestor:

```css
cdx-code-editor {
  --cdx-review-min-height: 3rem;
  --cdx-review-padding: 0.375rem 0.5rem 0.375rem 1rem;
  --cdx-review-gap: 0.5rem;
  --cdx-review-font-size: 0.8125rem;
  --cdx-review-action-height: 2.25rem;
  --cdx-review-border-color: …;
  --cdx-review-done-background-color: …; /* the "Review complete" summary */
  --cdx-review-done-color: …;
  --cdx-review-done-icon-color: …;
  --cdx-diff-tone-tertiary-container: …; /* bar fill for tone="tertiary"; also -on-container, -accent, -on-accent */
}
```

Parts: `review` (the element), `review-bar`, `review-done` (the bar in its summary state),
`review-avatar`, `review-icon`, `review-label`, `review-count`, `review-nav`, `review-previous`,
`review-position`, `review-next`, `review-reject-all`, `review-accept-all`, `review-dismiss`.

```css
cdx-code-editor::part(review-bar) {
  border-radius: 12px 12px 0 0;
}
cdx-code-editor::part(review-done) {
  background: #eef7f0;
}
cdx-code-editor::part(review-accept-all):hover {
  filter: brightness(1.1);
}
```

### Footer

Opt-in, like the diff: a `<cdx-footer slot="footer">` adds the status bar — path and symbol
breadcrumbs on the left (click a symbol for its siblings), then caret position (opens "Go to line"),
selection size, `+N −M` vs `baseline` (toggles the inline diff), encoding, language, environment.
Anything slotted as `slot="status"` on the editor lands at the end.

```html
<cdx-code-editor filename="processStream.js" .baseline="${head}">
  <cdx-footer
    slot="footer"
    path="chat/src/stream/processStream.js"
    encoding="UTF-8"
    environment="Node 22"
  ></cdx-footer>
  <my-sync-state slot="status"></my-sync-state>
</cdx-code-editor>
```

- `<cdx-footer>`: `path` (`/`-separated; default the editor's `filename`), `encoding`,
  `environment`, `no-breadcrumbs`.
- `cdx-status-click` (`{ item: "path" | "file" | "language" | "encoding" | "environment", index? }`)
  for what only the app can open — a file tree, a language or encoding picker.
- Sized by the editor's own width: under 720px only position and language stay; under 560px the
  path folds into `…`.
- Tokens `--cdx-status-bar-{height,padding-inline,gap,font-size,background-color,border-color,color,current-color,selection-color,pressed-background-color,pressed-color,crumb-max-width}`;
  parts `footer`, `status-bar`, `status-crumbs`, `status-crumb`, `status-crumb-current`,
  `status-separator`, `status-items`, `status-position`, `status-selection`, `status-diff`,
  `status-encoding`, `status-language`, `status-environment`.

### Context menu

`cdx-contextmenu` fires on right-click or the ContextMenu key / Shift+F10. Cancel it to suppress the
native menu and show your own at `clientX`/`clientY`:

```js
editor.addEventListener("cdx-contextmenu", (event) => {
  event.preventDefault();
  const { pos, line, selection, region, clientX, clientY } = event.detail;
  openMenu({ x: clientX, y: clientY, hasSelection: !selection.main.empty });
});
```

- `region` is `"content"`, `"gutter"` or `"diff-gutter"`; `pos` is the offset under the pointer
  (the caret for the keyboard) and `line` is 1-based.
- Right-clicking outside the selection moves the caret there first, so `selection` is current.

### Quick fixes, symbols, navigation

- A lightbulb appears on the caret's line when it has diagnostics; click it or press Mod-. for the
  messages and their fixes (`Diagnostic.actions`).
- `outline`, `symbolPath` and `cdx-symbols-change` give breadcrumbs/outline data from the syntax tree,
  or from a `symbolProvider` a plugin registers (the LSP bridge does).
- Ctrl-G opens "Go to line" (`line` or `line:column`); Mod-F opens find/replace.

### Tabs

```js
const tab = await editor.createState(text, { filename: "src/main.rs", baseline: headText });
editor.state = tab; // keeps each tab's text, undo history and language
```

`cdx-before-change` is cancelable — `preventDefault()` refuses an edit (read-only regions,
collaboration locks). Don't dispatch from inside it.

### LSP

```js
import { createLspClient, lspDocument } from "@symblight/code-editor/lsp";

const client = createLspClient({ rootUri, transport }); // transport: send / subscribe / unsubscribe
editor.state = await editor.createState(text, {
  filename: "src/main.rs",
  extensions: lspDocument(client, "file:///project/src/main.rs"),
});
```

Requires the optional peer `@codemirror/lsp-client`.

## Development

```bash
pnpm --filter @symblight/code-editor sb     # Storybook, port 6009
pnpm --filter @symblight/code-editor build
pnpm --filter @symblight/code-editor test
```

## License

MIT
