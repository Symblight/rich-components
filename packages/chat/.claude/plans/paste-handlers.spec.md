# Pluggable paste handlers — design notes

**Implemented (2026-09-05).** Builds on `.claude/plans/paste-chip.spec.md`. Everything below the
"Current logic" section describes what actually shipped — `schema.js` (`paste` node's `attrs` grew
`handlerId`/`data`), `paste-plugin.js` (the 3-step precedence + `insertPasteChip` helper),
`paste-node-view.js` (handler lookup + fallback), `Editor.js`/`textbox.js`/`message-composer.js`
(the `pasteHandlers` array property, forwarded the same way as `renderPasteChip`), plus a new
typedef at `src/types/paste-handler.js`. A worked proof-of-concept — `codeblockPasteHandler` — lives
in `src/components/stories/chat.stories.js` (`PasteChipCodeHandler` story): classifies via clipboard
`text/html`'s `language-xxx` class first, falls back to a plain-text code-shape heuristic, and
renders using only public API (`chx-chip` + `pasteHandlers`). See `src/docs/paste-chip.md`'s "Custom
paste handlers" section for the consumer-facing writeup; `CLAUDE.md`'s paste-chip paragraph for the
short architecture summary.

The "Current logic" section below is kept as-is — it's the pre-existing baseline this design built
on top of, still accurate as a description of the threshold-only path (step 1 of the precedence).

## Current logic (baseline, before this file's changes)

Everything funnels through `paste-plugin.js`'s `handlePaste`, called on every paste into the editor:

1. Read `clipboardData.getData("text/plain")` only — no HTML, no files ever read. Empty → not handled.
2. `lineCount = countLines(text)` (a trailing `\n` isn't an extra line).
3. `threshold = getPasteThreshold()` — live getter down to `chx-textbox.pasteThreshold` (default
   `205`, forwarded from `chx-message-composer.pasteThreshold`).
4. **`lineCount >= threshold` (threshold > 0):** build a `paste` node (`attrs: {text, lines}`, atom
   leaf) → `tr.replaceSelectionWith(chip)` → land the caret one space after it (reuses a following
   space if present, mirrors `Editor.js`'s `resolveCommand`) → done.
5. **Otherwise:** split on `\n`, insert each line as real text with `tr.split()` between them — no
   node, behaves exactly like typing.

There are exactly two branches today, and the line-count threshold is the only thing that picks
between them — no other property of the pasted content is ever inspected.

Rendering is separate: `PasteNodeView` calls a single injected `render({text, lines})` — either the
app's `renderPasteChip` or `chx-textbox`'s built-in default (`<chx-paste-chip>`). Serialization
(`toPlainText`/`toHTML`) special-cases the `paste` node to emit `attrs.text` verbatim, so
`value`/`html` are identical whether a chip is showing or not — the chip is a pure display collapse.

## Decided (2026-09-05)

- **Registration**: a single `pasteHandlers` array property on `chx-message-composer` (forwarded to
  `chx-textbox`, same style as `renderPasteChip`) — the whole array is replaced at once, not an
  imperative `add`/`remove` pair.
- **Classification visibility**: a handler's `match()` receives the raw `html`/`event` from the
  clipboard, not just `{text, lines}` — needed for real code-block detection (VS Code/GitHub paste
  `<pre><code class="language-js">` into `text/html`). This is scoped to *classification only*; the
  plain-text-only policy for what actually lands in the doc is unaffected — `render()` never sees
  `html`/`event`, only `{text, lines, data}`.
- **No library-enforced size floor**: once a handler's `match()` returns non-null, the paste always
  becomes a chip, regardless of how small (even a 2-line snippet). A handler that only wants to
  claim large-enough snippets enforces that itself inside its own `match()`.

## Precedence — the rule that was the point of this exercise

```
1. threshold check (unchanged, still first, still absolute)
      lineCount >= threshold  →  generic paste chip, exactly as today.
      No handler ever runs in this branch — a giant code paste is still just an "N lines" pill,
      never a large custom block, however a handler would have classified it.
2. NEW — only reached when under threshold: run pasteHandlers in registration order
      first handler whose match() returns non-null  →  chip rendered by that handler
3. inline plain-text insertion (unchanged, still the final fallback)
      no handler claimed it → behaves exactly as today, no node at all
```

## Handler contract

```ts
type PasteHandler = {
  id: string; // stashed on the node so a later re-render can look the handler back up
  match: (ctx: { text: string; lines: number; html: string | null; event: ClipboardEvent }) =>
    Record<string, unknown> | null | undefined; // non-null claims the paste; the return value becomes attrs.data
  render: (ctx: { text: string; lines: number; data: Record<string, unknown> }) => HTMLElement;
};
```

Two callbacks, not one, because classification and rendering happen at genuinely different times
with different available context:

- `match` is called once, synchronously, inside the original `handlePaste` — it's the only place
  `html`/`event` ever exist.
- `render` can be called again much later — undo/redo recreating the NodeView, or the node arriving
  via `parseDOM` (pasting the editor's own copied HTML back into itself or another `chx-textbox`
  instance). The original `ClipboardEvent` is long gone by then. **Hard requirement for handler
  authors: `render` must be fully reconstructible from `{text, lines, data}` alone.**

## Schema generalization

`paste` node `attrs` generalize from `{text, lines}` to `{text, lines, handlerId, data}` — same
shape/reasoning as `command`'s `{templateId, label, icon, data}`: `data` is an opaque bag the schema
never interprets, just round-trips back to whichever handler produced it. `attrs.text` stays the
single lossless source of truth no matter which handler rendered the chip, so `toPlainText`/`toHTML`
need zero per-handler-type branching — a codeblock chip still expands to the raw pasted text on
send, exactly like the plain chip does now. `toDOM`/`parseDOM` extend the same way `command`'s did
for its `data` bag (`data-handler-id` + `data-*` per key) so clipboard-copy and `getHTML()` round-trip.

`handlerId: null` (today's only case) means "no handler claimed this, or it hit the threshold" —
`PasteNodeView` falls back to the default renderer (`renderPasteChip` / built-in `chx-paste-chip`)
for that case, same as today. If `handlerId` is set but isn't found in the current
`getPasteHandlers()` (handler was unregistered, or the doc came from a differently-configured app
instance), also fall back to the default renderer rather than erroring — slightly more defensive
than `CommandNodeView`'s current behavior (renders an empty `<span>` if its template id is missing).

## Public API surface (proposed)

On `chx-message-composer` (forwarded to `chx-textbox`, unchanged forwarding pattern as
`pasteThreshold`/`renderPasteChip`):

| Property         | Type                | Default | Notes                                                                 |
| ---------------- | ------------------- | ------- | ---------------------------------------------------------------------- |
| `pasteThreshold` | `number`            | `205`   | Unchanged — still the hard ceiling, checked before any handler runs. |
| `renderPasteChip`| `(detail) => HTMLElement` | `undefined` | Unchanged — now specifically "the fallback when no handler claims the paste, or the threshold was hit." |
| `pasteHandlers`  | `PasteHandler[]`    | `[]`    | NEW. Ordered; first `match()` to return non-null wins. Whole array replaced on assignment. |

## How it was actually built (resolving the open items above)

- `toDOM`/`parseDOM`'s `data-*` naming reused `command`'s existing `toDataAttrName` helper directly
  from `schema.js` (not extracted to a shared spot) — it's a small, pure function and duplicating the
  one-line call site for a second node type was simpler than a new shared module.
- `PasteNodeView`'s handler lookup silently falls back to the default renderer when a `handlerId`
  isn't found — no dev-mode warning, matching `CommandNodeView`'s existing behavior rather than
  diverging from it. Listed under "Not yet supported" in `src/docs/paste-chip.md`.
- `src/docs/paste-chip.md` got its "Custom paste handlers" section; README's paste-chip bullet was
  left as-is (still accurate, generic enough not to need the detail).
- The codeblock proof-of-concept (`chat.stories.js`'s `PasteChipCodeHandler`) validated the
  `match`/`render` split works end-to-end before considering the design final.

## Remaining open items

- No console warning distinguishes "no handler claimed this" from "threshold was hit" from the
  outside — both currently produce `handlerId: null` indistinguishably. Not needed yet; nothing
  external currently asks.
- Chips already in the document aren't re-evaluated if `pasteHandlers` changes after the fact.
