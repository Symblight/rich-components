# Paste chip

Pasting a long block of text into the composer's field is disruptive — it floods the field with
dozens of lines before the user can even see what they're about to send. Pasting `paste-threshold`
or more lines collapses the paste into a single "N lines" chip instead, same idea as pasting a long
snippet into ChatGPT/Claude Code. Pasting something that looks like code collapses it into a
`<chx-code-block>` chip instead, regardless of length. Nothing else about pasting changes: paste is
always forced to plain text (no rich-text/HTML is ever accepted), the chip is just how a _long_ or
_code_ plain-text paste is displayed.

The chip is a purely visual collapse — it carries the full pasted text internally. Deleting it
(Backspace/Delete/selecting across it) removes the whole thing at once, same as any other atomic
inline element. There's no click behavior in this version.

Entirely opt-in, same connection as `<chx-command-field>`/`<chx-command-picker>`: `chx-message-
composer`/`chx-textbox` know nothing about paste collapsing at all — slot a `<chx-paste-long-text>`
into `<chx-message-composer>` and it reaches into the composer's editor directly; without it,
pasting never collapses into anything, full stop.

## Quick start

```html
<chx-chat>
  <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
    <chx-paste-long-text slot="paste-long-text"></chx-paste-long-text>
  </chx-message-composer>
</chx-chat>
```

`paste-threshold` defaults to `205`. Lower it to make the generic long-text chip trigger sooner, or
set it to `0`/a negative number to disable it entirely (code detection stays on regardless — it has
its own independent `min-code-lines`, default `2`):

```html
<chx-paste-long-text paste-threshold="20"></chx-paste-long-text>
<chx-paste-long-text paste-threshold="0"></chx-paste-long-text>
<!-- long plain-text pastes always inline; a code-shaped paste of 2+ lines still collapses -->
```

Line count is `text.split("\n")`, ignoring one trailing empty line (`"a\nb\n"` is 2 lines, not 3) —
the same count is used both for the threshold check and the default chip's "N lines" label.

## Precedence, checked on every paste

1. **`paste-threshold` always wins first.** A paste at or over the threshold becomes the plain
   generic "N lines" chip immediately — code detection never runs, however it would have
   classified the content. A 5,000-line code paste is still just an "N lines" pill.
2. Only for pastes **under** the threshold: is it code? (`classify()`, see below). If so, it
   collapses into a `chx-code-block` chip instead.
3. Otherwise: the existing inline plain-text behavior, unchanged — small, unrecognized pastes are
   never turned into a chip at all.

## Code detection

Built in, not something you wire up yourself — `chx-paste-long-text` runs the pasted text through
a Lezer-grammar parse-error heuristic (see `detect-language.js`): a language whose grammar parses
the text with few/no recovery errors is treated as a match. Configurable via properties:

| Property               | Type       | Default                                                 | Notes                                                                  |
| ---------------------- | ---------- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `min-code-lines`       | `number`   | `2`                                                     | Below this line count, a paste is never checked for code.              |
| `code-languages`       | `string[]` | `["json", "javascript", "typescript", "python", "css"]` | Candidate language ids to try, most-specific first.                    |
| `max-code-error-ratio` | `number`   | `0.01`                                                  | Highest tolerated share of the input covered by parse-recovery errors. |

## Sending — `chx-send-message` and `chx-change`

The chip never leaks into `value`/`html`: both fields already contain the full pasted text at the
chip's position, exactly as if the text had been pasted inline. There's no separate field to read
the pasted text from — a chip currently shown in the field has no effect on what's sent.

If you want a pasted code chip to render as a live `chx-code-block` after send too, that's the same
`splitMessageParts`/`partElements` mechanism `commands.md`'s "Rendering a sent chip in the message
list" describes for command chips — see `code-block.stories.js`'s `MockedMessages`/
`PasteRecognizesCode` stories for a complete example.

## Custom chip rendering — `.buildElement()`

Override `chx-paste-long-text.buildElement(attrs, source)` to change how _any_ collapsed paste
renders — the single place both a fresh paste and a later reconstruction (undo/redo, restoring a
draft) draw from, same override shape as `chx-command-picker.buildChip`/
`chx-attachments.buildAttachment`. Named `buildElement`, not `buildChip`: it can return any element,
not just a chip-shaped one (the default already returns a `chx-code-block` for a detected code
paste).

```js
pasteLongTextEl.buildElement = ({ text, lines, data }, source) => {
  if (typeof data.lang === "string") {
    // still want the default code-block look for code — call the original,
    // or build your own
  }
  const chip = document.createElement("my-paste-chip");
  chip.textContent = `${lines} lines pasted`;
  chip.title = text.slice(0, 200); // e.g. a hover preview
  return chip;
};
```

`text` is the full pasted string, `lines` its line count, `data` is whatever `classify()` returned
(`{lang}` for detected code, `{}` otherwise), `source` is always `"composer"` — a collapsed paste
unfolds back to its full text once sent (see "Sending" above), so `buildElement` only ever runs for
the live editing view, never for historical message content.

Whatever element you return is mounted directly into the editor as the chip's DOM — style/behave it
however you like, keeping in mind it's inert (`contenteditable="false"` is set on it automatically)
and, per "Chip behavior" above, only removable as a whole unit in this version.

## `<chx-paste-chip>` — the built-in default

A standalone component (`chx-chip` underneath) used by `chx-paste-long-text`'s default
`buildElement()` for the generic "N lines" case (code pastes get a `chx-code-block` instead). It
exposes the same two slots you'd want to override on any chip — swap either independently without
replacing the whole element:

```html
<!-- not how you'd normally write this — buildElement builds it in JS — but shows the shape -->
<chx-paste-chip lines="42">
  <span slot="icon">📎</span>
  42 lines of code
</chx-paste-chip>
```

| Slot        | Purpose                                                                   |
| ----------- | ------------------------------------------------------------------------- |
| `icon`      | Leading icon — defaults to a document/file glyph.                         |
| _(unnamed)_ | The label — defaults to `"{lines} lines"`, read off the `lines` property. |

`lines` (`number` property/attribute) drives the default label; it has no effect once the `icon`
or default slot is overridden with real content, same as any Lit `<slot>` fallback.

## `<chx-paste-long-text>` reference

| Property/attribute            | Type                                                              | Default             | Notes                                                                                  |
| ----------------------------- | ----------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------- |
| `paste-threshold`             | `number`                                                          | `205`               | Collapse to the generic chip when the pasted line count is `>=` this. `<= 0` disables. |
| `min-code-lines`              | `number`                                                          | `2`                 | Below this line count, a paste is never checked for code.                              |
| `code-languages`              | `string[]`                                                        | _(built-in list)_   | Property only — candidate language ids for code detection.                             |
| `max-code-error-ratio`        | `number`                                                          | `0.01`              | Highest tolerated parse-error ratio for a code match.                                  |
| `classify(text, lines)`       | `(text: string, lines: number) => {lang: string} \| null`         | _(code detection)_  | Method — override to change what counts as "code" (or recognize other content).        |
| `buildElement(attrs, source)` | `(attrs: {text, lines, data}, source: "composer") => HTMLElement` | _(chip/code-block)_ | Method — see "Custom chip rendering" above.                                            |

## Not yet supported

- Click-to-expand or any other chip interaction beyond delete.
- Re-evaluating chips already in the document after `chx-paste-long-text`'s properties change.
- Surviving `chx-chat.setText()`/a composer disconnect-reconnect remount — both replace the document
  with plain text, same pre-existing limitation as command chips.
- Recognizing content other than code (e.g. URLs, JSON) — override `classify()`/`buildElement()`
  yourself in the meantime; there's no separate pluggable-handler registry anymore, one override
  point covers every case.
