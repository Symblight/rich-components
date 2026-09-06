# Paste chip

Pasting a long block of text into the composer's field is disruptive — it floods the field with
dozens of lines before the user can even see what they're about to send. Pasting `paste-threshold`
or more lines collapses the paste into a single "N lines" chip instead, same idea as pasting a long
snippet into ChatGPT/Claude Code. Nothing else about pasting changes: paste is always forced to
plain text (no rich-text/HTML is ever accepted), the chip is just how a *long* plain-text paste is
displayed.

The chip is a purely visual collapse — it carries the full pasted text internally. Deleting it
(Backspace/Delete/selecting across it) removes the whole thing at once, same as any other atomic
inline element. There's no click behavior in this version.

## Quick start

Nothing to opt into — collapsing is on by default (`paste-threshold` defaults to `205`). Paste
enough lines into any `<chx-message-composer>` and a chip appears where the text was pasted:

```html
<chx-chat label="Write your prompt...">
  <chx-message-composer></chx-message-composer>
</chx-chat>
```

Lower the threshold to make it trigger sooner, or set it to `0`/a negative number to disable
collapsing entirely and always paste inline:

```html
<chx-message-composer paste-threshold="20"></chx-message-composer>
<chx-message-composer paste-threshold="0"></chx-message-composer>
<!-- always inline -->
```

Line count is `text.split("\n")`, ignoring one trailing empty line (`"a\nb\n"` is 2 lines, not 3) —
the same count is used both for the threshold check and the default chip's "N lines" label.

## Sending — `chx-send-message` and `chx-change`

The chip never leaks into `value`/`html`: both fields already contain the full pasted text at the
chip's position, exactly as if the text had been pasted inline. There's no separate field to read
the pasted text from — a chip currently shown in the field has no effect on what's sent.

## Custom chip rendering

Set `renderPasteChip` (a property, not an attribute — it's a function) on `<chx-message-composer>`
to render your own chip element in place of the built-in one:

```js
composerEl.renderPasteChip = ({ text, lines }) => {
  const chip = document.createElement("my-paste-chip");
  chip.textContent = `${lines} lines pasted`;
  chip.title = text.slice(0, 200); // e.g. a hover preview
  return chip;
};
```

`text` is the full pasted string, `lines` its line count. Whatever element you return is mounted
directly into the editor as the chip's DOM — style/behave it however you like, keeping in mind it's
inert (`contenteditable="false"` is set on it automatically) and, per "Chip behavior" above, only
removable as a whole unit in this version. Unset `renderPasteChip` (or never set it) to keep the
built-in `<chx-paste-chip>` (a small document-icon "N lines" pill).

## `<chx-paste-chip>` — the built-in default

A standalone component (`chx-chip` underneath) used automatically when `renderPasteChip` is unset.
It exposes the same two slots you'd want to override on any chip — swap either independently
without replacing the whole element:

```html
<!-- not how you'd normally write this — renderPasteChip builds it in JS — but shows the shape -->
<chx-paste-chip lines="42">
  <span slot="icon">📎</span>
  42 lines of code
</chx-paste-chip>
```

| Slot        | Purpose                                                            |
| ----------- | ------------------------------------------------------------------- |
| `icon`      | Leading icon — defaults to a document/file glyph.                  |
| _(unnamed)_ | The label — defaults to `"{lines} lines"`, read off the `lines` property. |

`lines` (`number` property/attribute) drives the default label; it has no effect once the `icon`
or default slot is overridden with real content, same as any Lit `<slot>` fallback.

## Custom paste handlers — recognizing specific content

`renderPasteChip` overrides *how the chip looks*, uniformly. `pasteHandlers` lets you recognize
*specific kinds of content* — e.g. a pasted code snippet — and render a different chip just for
those, while everything else still falls through to the generic chip/inline behavior above:

```js
composerEl.pasteHandlers = [
  {
    id: "codeblock",
    // Called once, synchronously, at paste time — the only place html/event exist.
    // Return anything JSON-able to claim the paste; null/undefined passes to the next handler.
    match({ text, lines, html, event }) {
      const language = html?.match(/class="[^"]*language-(\w+)/)?.[1];
      return language ? { language } : null;
    },
    // May run again much later (undo/redo, pasting the editor's own copied HTML back in) —
    // must be reconstructible from {text, lines, data} alone, never from the original event.
    render({ lines, data }) {
      const chip = document.createElement("chx-chip");
      chip.textContent = `${data.language} · ${lines} lines`;
      return chip;
    },
  },
];
```

Precedence, checked in this order on every paste:

1. **`paste-threshold` always wins first.** A paste at or over the threshold becomes the plain
   generic chip immediately — no handler ever runs, however it would have classified the content.
   A 5,000-line code paste is still just an "N lines" pill, never a large custom block.
2. Only for pastes **under** the threshold: `pasteHandlers` run in array order: the first whose
   `match()` returns non-null claims the paste, and that handler's own `render()` draws the chip.
3. If no handler claims it: the existing inline plain-text behavior, unchanged — small, unrecognized
   pastes are never turned into a chip at all.

There's no library-enforced minimum size for a handler to claim — even a 2-line snippet becomes a
chip once a handler's `match()` says yes. A handler that only cares about longer snippets enforces
that itself inside its own `match()` (e.g. `if (lines < 3) return null;`).

`match`/`render` are genuinely different phases with different guarantees: `match` sees the raw
clipboard `html`/`event` (needed for real code-block detection — VS Code/GitHub/JetBrains all wrap
copied code in `<pre>`/`<code>`, often with a `language-xxx` class), which the strict
plain-text-only policy otherwise keeps out of the doc entirely — only `match` is allowed to look at
it, purely for classification. `render` never receives it, only the JSON-able `data` your `match`
returned, since `render` can be invoked again long after the original paste (undo/redo recreating
the chip's DOM, or the chip arriving via a later paste of the editor's own copied HTML).

A full worked example — a codeblock handler with both an HTML-class detector and a plain-text
heuristic fallback for sources that don't carry HTML — is in Storybook's `PasteChipCodeHandler`
story (`src/components/stories/chat.stories.js`).

## `<chx-message-composer>` reference

| Property/attribute | Type                                              | Default     | Notes                                                                          |
| ------------------- | -------------------------------------------------- | ----------- | ------------------------------------------------------------------------------ |
| `paste-threshold`   | `number`                                           | `205`       | Collapse when the pasted line count is `>=` this. `<= 0` disables collapsing. |
| `renderPasteChip`   | `(detail: {text: string, lines: number, data: Record<string, unknown>}) => HTMLElement` | _(unset)_ | Property only — the fallback renderer when no handler claims the paste, or the threshold was hit. |
| `pasteHandlers`     | `Array<{id: string, match: (ctx) => object \| null, render: (ctx) => HTMLElement}>` | `[]` | Property only — see "Custom paste handlers". Ordered; first `match()` to return non-null wins. |

## Not yet supported

- Click-to-expand or any other chip interaction beyond delete.
- Re-evaluating chips already in the document after `paste-threshold`/`pasteHandlers` changes.
- Surviving `chx-chat.setText()`/a composer disconnect-reconnect remount — both replace the document
  with plain text, same pre-existing limitation as command chips.
- A console warning when a chip's `handlerId` no longer matches anything in `pasteHandlers` (e.g. the
  app removed that handler after the doc was created) — it silently falls back to the default chip
  renderer instead.
