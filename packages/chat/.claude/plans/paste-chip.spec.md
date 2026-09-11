# Paste chip ("paste as attachment") — spec

When a paste into the composer is at least `paste-threshold` lines long, the text is not inserted
inline — a single inline chip reading "N lines" (📄 icon) is inserted instead, holding the full text.
On send, the chip expands back into the full text at its position: `value`/`html` look exactly as if
the text had been pasted inline. The chip is purely a visual collapse of an already-committed paste.

Decided with the user (2026-09-05):

- **Send payload**: expand inline — no separate `pastes` array, no new event fields.
- **Override**: a `renderPasteChip` **function property** (JS-only, no attribute), not a slotted
  template — `({ text, lines }) => HTMLElement`.
- **Threshold**: numeric attribute, **default 205** (matches the editor behavior the user is
  replicating). `<= 0` disables collapsing entirely.
- **Chip interaction**: delete only (atom semantics — Backspace/Delete/selection). No click behavior.
- Default chip icon: the user-supplied inline `<svg>` (file/document glyph), NOT an
  `@material-design-icons` import.

## Public API

On `chx-message-composer` (and `chx-textbox`, where the real implementation lives — composer
forwards, same as `label`/`placeholder`):

| Surface           | Type                                             | Default     | Notes                                                                                  |
| ----------------- | ------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------- |
| `paste-threshold` | number attribute (`pasteThreshold` prop)         | `205`       | Collapse when pasted line count `>=` threshold. `<= 0` → always paste inline.          |
| `renderPasteChip` | `({text: string, lines: number}) => HTMLElement` | `undefined` | Property only. Returns the chip's DOM; when unset, the built-in `chx-paste-chip` is rendered. |

Line count: `text.split("\n")`, ignoring one trailing empty line (`"a\nb\n"` → 2 lines). The same
count feeds the threshold check and the default label.

No changes to `chx-chat` — the composer is consumer-authored light DOM; set the attribute/property
on `<chx-message-composer>` directly.

## Implementation

### `src/editor/schema.js` — new `paste` node

Inline leaf (no `content`, same isAtom derivation as `command`), attrs `{ text: "", lines: 0 }`.

- `leafText: (node) => node.attrs.text` — makes ProseMirror's own clipboard *text/plain*
  serialization (plain `textBetween`) emit the full text when the user copies a selection
  containing a chip. (`command` doesn't need this; serialize.js passes an explicit callback.)
- `toDOM: ["span", { "data-paste-lines": lines }, text]` — feeds clipboard HTML and `getHTML()`;
  the full text is kept in the output, so `html` also "expands inline" (as a single span, not
  re-split into `line` divs — acceptable: `html`'s contract is markup of the doc, and the doc's
  chip is one inline node).
- `parseDOM: span[data-paste-lines]` → `{ text: textContent, lines: Number(attr) }`.

### `src/editor/paste-plugin.js` — threshold branch

`createPastePlugin({ getPasteThreshold })` (live getter, so attribute changes apply without
rebuilding the editor). In `handlePaste`, before the line-splitting loop: compute the line count;
if `threshold > 0 && count >= threshold`, `tr.replaceSelectionWith(pasteNode, false)`, then land the
caret one space after the chip — same logic as `Editor.js`'s `resolveCommand`: check the character
right after the chip, insert a space only if it isn't already whitespace, then set the selection
past it either way (reusing an existing following space rather than adding a second one). Dispatch,
return true. Otherwise fall through to the existing inline path.

### `src/editor/paste-node-view.js` — new

`PasteNodeView(node, render)`: `this.dom = render({ text, lines })`, then
`contenteditable="false"`. No default rendering here — editor/ stays component-free (same layering
reason command-node-view clones app templates instead of importing components); the default
renderer is supplied by chx-textbox.

### `src/editor/Editor.js`

New options `getPasteThreshold`, `getRenderPasteChip` (both getters for liveness). Pass the first
to `createPastePlugin`, register `nodeViews.paste: (node) => new PasteNodeView(node, getRenderPasteChip())`.

### `src/editor/serialize.js`

`toPlainText`'s explicit `leafText` callback overrides spec-level `leafText` entirely — add the
`paste` branch: `node.attrs.text`. (`textBetween`'s `blockSeparator` is unaffected; the chip's
embedded `\n`s pass through inside the leaf text.)

### `src/components/paste-chip/paste-chip.js` — new, `chx-paste-chip`

Standalone component (own file, like `chx-chip`/`chx-scroll-to-bottom-affordance`), wraps
`chx-chip`. `lines` (number property/attribute) drives the default label. Two overridable slots,
each with Lit fallback content — same "`<slot>` with fallback markup" pattern as
`chx-scroll-to-bottom-affordance`'s inline SVG:

- `icon` slot → falls back to the user-supplied SVG (file/document glyph), inline in the template
  (not `?raw`-imported — this SVG isn't a package icon), with `fill="currentColor"` set explicitly
  since `chx-chip`'s `--md-chip-icon-color` only ever sets CSS `color` on the wrapper, never `fill`
  — confirmed against `@symblight/wc-material`'s `base-chip.css`, which has no
  `::slotted(svg) { fill: currentColor }` rule of its own.
- Default slot → falls back to `` `${this.lines} lines` ``.

### `src/components/textbox/textbox.js`

- Properties: `pasteThreshold` (`{ type: Number, attribute: "paste-threshold" }`, default 205),
  `renderPasteChip` (`{ attribute: false }`).
- Imports `../paste-chip/paste-chip.js` (registration) and holds the default renderer:
  `document.createElement("chx-paste-chip")`, sets `.lines`.
- Passes `getPasteThreshold: () => this.pasteThreshold` and
  `getRenderPasteChip: () => this.renderPasteChip ?? defaultRenderPasteChip` to `Editor`.

### `src/components/message-composer/message-composer.js`

Forward both: properties `pasteThreshold` (default 205 — composer owns the public default, same
pattern as `placeholder`) and `renderPasteChip`, bound onto `<chx-textbox>` in the template.

### Docs / stories

- README: mention in the Layout bullets + rows for `paste-threshold`/`renderPasteChip` (noting they
  live on the composer, like the attachments/commands opt-ins).
- `chat.stories.js` or a dedicated story: composer with a low `paste-threshold` (e.g. 3) so the
  behavior is demoable without a 205-line clipboard.
- No spec files (per standing instruction — tests only when asked).

## Edge cases / known limits

- Copy a chip inside the editor → clipboard text/plain is the full text (spec `leafText`); pasting
  it back re-collapses if still over threshold.
- `value` includes the full text immediately (submit-button visibility, `required` validation,
  `chx-change` all see it).
- `setText()` (draft restore, disconnect/reconnect remount) replays plain text — a chip does not
  survive a remount; pre-existing `setText` single-line limitation applies. Documented, not fixed.
- Changing `paste-threshold` never re-evaluates chips already in the doc.
- No history plugin exists, so no undo interaction to design.
