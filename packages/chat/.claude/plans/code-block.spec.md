# `chx-code-block` — spec

A standalone, syntax-highlighted, **read-only** code block — header row with a language label and a
copy button, monospace body below. Not wired into chat internals anywhere: a plain importable
custom element, same status as `chx-chip`/`chx-paste-chip`. Consumers plug it into two **existing**
extension points themselves — `pasteHandlers`' `render()` (composer) and `partElements` (message
list) — no new API on `chx-chat`/`chx-message-composer`/`chx-textbox`.

Decided with the user (2026-09-12):

- **Read-only, no editing.** No cursor, no gutter, no interaction beyond copy and the language menu.
- **Language menu, added 2026-09-12**: clicking the header label opens an `md-menu` (`md-menu-item`
  per `LANGUAGES` entry, plus a "Plain text" option) that sets `lang` on select and fires
  `chx-code-block-lang-change`. `lang` is still a plain settable property for programmatic/detected
  use (e.g. `code-block-paste-handler.js`) — the menu is a manual override on top, not a replacement.
- **Usage is consumer-wired, not new chat API** — composer preview via `pasteHandlers.render()`
  (evolves the existing `codeblockPasteHandler` PoC in `chat.stories.js`), historical rendering via
  `partElements` on a `type: "code"` part the consumer defines themselves (this package doesn't add
  or validate a "code" part type, same non-stance it takes on `type: "attachment"`).
- **CodeMirror for highlighting, no `EditorView`.** "Very simple, only for read" doesn't need a
  mounted editor (cursor layer, contenteditable machinery, line numbers) — use CodeMirror 6's own
  documented lightweight recipe instead: parse with the language's Lezer parser, then
  `highlightTree` (from `@lezer/highlight`) to emit styled spans directly. Smaller bundle, simpler
  DOM, still genuinely CodeMirror's tokenizer/highlighter (the same one `EditorView` uses
  internally) — not a separate highlighting library.
- **Plugin / tree-shakeable**: own directory (`src/components/code-block/`), never imported by
  `src/index.js` or any core file (`chat.js`, `message-composer.js`, `message-list.js`,
  `textbox.js`) — same "opt-in standalone component" status `chx-command-picker`/`chx-attachments`
  already have. `preserveModules: true` (see CLAUDE.md's Build output section) makes this tree-shake
  for free as long as the import graph stays isolated: a consumer who never imports
  `code-block.js` never pulls CodeMirror into their bundle.

## Public API

### `<chx-code-block>`

| Property | Type     | Default | Notes                                                                                             |
| -------- | -------- | ------- | --------------------------------------------------------------------------------------------------- |
| `code`   | `string` | `""`    | The source text to display verbatim.                                                                |
| `lang`   | `string` | `""`    | Language id — drives both the header label and which grammar highlights the body. Unset/unknown → "Plain text" label, no highlighting (still monospace). |

Built-in `lang` ids (matching the reference language-picker's own list, so a future picker slots in
without a vocabulary change): `javascript`, `typescript`, `tsx`, `jsx`, `css`, `scss`, `html`,
`json`, `bash`, `python`, `ruby`, `go`, `rust`, `sql`, `yaml`, `markdown`, `diff`.

| Slot      | Purpose                                                                 |
| --------- | ------------------------------------------------------------------------ |
| `label`   | Extra header content next to the language label (e.g. a filename). Costs zero space when empty. |
| `actions` | Header actions — e.g. a copy button. Costs zero space when empty. |

`chx-code-block` has **no built-in copy button** — it's "read-only, very simple," and copying is
entirely a consumer concern. `code-block.stories.js`'s `CodeBlockCopyAction` (`<code-block-copy-action>`)
is a worked example: a small component built against the public `code` property and `md-icon-button`'s
own toggle/selected pattern, slotted in as `slot="actions"`. It dispatches its own `chx-code-block-copy`
(`{code: string}`) — that event doesn't come from `chx-code-block` itself.

| Event               | `detail`         | Notes                                                        |
| -------------------- | ---------------- | ------------------------------------------------------------- |
| `chx-code-block-lang-change` | `{ lang: string }` | Fires after a language is picked from the header menu — lets a consumer persist the correction back into its own message store. |

| Custom property                    | Purpose                          |
| ----------------------------------- | --------------------------------- |
| `--chx-code-block-background-color` | Container background. Defaults to an `--md-sys-color-*` token. |
| `--chx-code-block-border-color`     | Container border color.           |
| `--chx-code-block-border-radius`    | Container corner radius.          |
| `--chx-code-block-font-family`      | Monospace font for the body.      |

### Language loading — one registry, eager, no override (yet)

One plain object, keyed by `lang` id, each entry `{ label, language }` — `label` is the header
text, `language` a statically-imported `LRLanguage` from that language's `@codemirror/lang-*`
package. **One registry, not two parallel maps** — a label and a grammar living on the same key
can't drift out of sync the way two separately-maintained lookups could (found this while
re-reviewing the first draft, which had `LANGUAGE_LABELS` and a loader map as separate structures
for no reason).

Originally a per-language dynamic `import()`, only fetched for a language actually rendered.
Reverted to eager static imports after a real bug: inside a virtualized message list, the dynamic
import's resolution landed after `RowMeasurer` had already measured the row at its pre-highlight
height, so the block's later growth fought the bottom-anchor/stick-to-bottom logic in a loop (see
`StickToBottom.js`). `highlightToHTML` needs to be synchronous for the row to be correct at its
very first measurement — eager imports are the direct way to get that. Trade-off: every consumer
of `chx-code-block` now bundles all languages in `LANGUAGES`, not just the ones it renders.

No `languageLoaders` override property in this pass — YAGNI until a real consumer needs a language
outside the built-in set. Easy to add later (same "sane default + override" shape used elsewhere in
this package) without touching the registry shape; not worth the extra public surface on a
component whose whole brief is "very simple" before anyone's asked for it.

## Implementation

### New dependency

`@lezer/highlight` (highlighter core) + per-language grammar packages as needed
(`@codemirror/lang-javascript`, `@lang-python`, etc. — each already bundles its own Lezer parser).
Add as regular `dependencies` in `package.json`— `preserveModules` + nothing in core importing
`code-block.js` is what keeps them out of a consumer's bundle unless actually used, not
`peerDependencies`/`optionalDependencies` gymnastics.

### `src/components/code-block/highlight.js` — new, pure function

Exports the language registry (`LANGUAGES`, `{ [lang]: { label, language } }`, see above) and
`highlightToHTML(code, lang): string` — the entire CodeMirror-facing surface, split out of
the component (SRP: "know how to tokenize and highlight" and "be a code-block UI element" are two
different reasons to change, same reasoning `readChipAttrs`/`buildChipElement` already live outside
`chx-command-picker`). `highlightToHTML` looks up `lang` in `LANGUAGES`, parses with its `language`,
runs `highlightTree`, and returns an **HTML string** of escaped text wrapped in
`<span class="tok-...">`. Unknown/unset `lang` → returns `code` HTML-escaped, unwrapped, no parse
call. Escaping (`&`/`<`/`>`) happens once here, on every text run, highlighted or not — the one
place a bug would be an actual injection risk, so it's the one place to get right and test directly,
independent of the component. `code-block.js` imports `LANGUAGES` too, only to read `.label` for
the header — one registry, two readers, instead of duplicating the label list a second time.

### `src/components/code-block/code-block.js` — new, `chx-code-block`

Thin UI shell — header (label from the same registry `highlightToHTML` uses, defaulting to "Plain
text"; a copy `md-icon-button` using `content_copy.svg`) and a body. Body content is
`unsafeHTML(this._highlightedHTML)` bound in the normal Lit `render()` — one rendering paradigm for
the whole component (no imperative DOM append alongside a Lit template for the rest); `_highlightedHTML`
is a private reactive field recomputed by calling `highlightToHTML` from `willUpdate` whenever
`code`/`lang` change.

Copy button handler: `navigator.clipboard.writeText(this.code)`, swap the icon to `check.svg` for
~1.5s, dispatch `chx-code-block-copy`.

### `src/components/code-block/code-block.css` — new

Card look matching the reference screenshot: rounded corners, subtle background
(`--md-sys-color-surface-container` or similar token), header/body padding, monospace body,
horizontal scroll on overflow (no wrapping — preserve code formatting), no line numbers.

### Docs / stories

- `src/docs/code-block.md` — new, same tone/format as `paste-chip.md`: quick start showing both
  wiring patterns (paste handler, `partElements`), the `lang` id list, "Not yet supported" (language
  picker, editing, line numbers).
- Update `chat.stories.js`'s existing `codeblockPasteHandler`/`PasteChipCodeHandler` PoC to build a
  `<chx-code-block>` in its `render()` instead of a bare `<chx-chip>` — same `match()` classification
  logic, richer chip. Add a second story demonstrating `partElements` rendering a mocked `type:
  "code"` historical message part.
- CLAUDE.md gets a short paragraph alongside the existing command/attachment/paste-chip sections.

## Edge cases / known limits

- `highlightToHTML` builds an HTML string from user-controlled `code` — every text run (highlighted
  or not) must go through the same escape step before being wrapped in a `<span>`. This is the one
  place in the whole component worth a direct unit test independent of the custom element, precisely
  because it's string-built HTML rather than Lit-templated.
- No language picker — changing `lang` after creation is a plain property set (works, re-highlights),
  but nothing in the UI offers it yet.
- No line numbers, no wrap toggle, no diff-specific coloring beyond whatever `diff`'s grammar
  package provides token-wise.
- Historical rendering has no automatic live/historical sync mechanism the way command/attachment
  chips do (`buildChip`'s shared draw point) — there's only one draw path here (`chx-code-block`
  itself), so the divergence risk that pattern guards against doesn't apply.
- Copy relies on `navigator.clipboard` — no fallback for contexts where it's unavailable
  (non-secure origin, older browsers); out of scope for this pass.
- A `type: "code"` part shape is a *convention* this spec suggests for the `partElements` usage
  pattern, not something `validateMessages`/the type system enforces — same posture as `type:
  "attachment"` already has.
