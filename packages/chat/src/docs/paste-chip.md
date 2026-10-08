# Paste chip

Pasting a long block of text into the composer's field is disruptive — it floods the field with
dozens of lines before the user can even see what they're about to send. With
`<chx-paste-long-text>`, pasting `paste-threshold` or more lines collapses the paste into a single
"N lines" chip instead, same idea as pasting a long snippet into ChatGPT/Claude Code. Paste is
always forced to plain text; the chip is just how a _long_ plain-text paste is displayed.

The chip is a purely visual collapse — it carries the full pasted text internally. Deleting it
(Backspace/Delete/selecting across it) removes the whole thing at once, same as any other atomic
inline element. It has no click behavior.

Code detection is a separate extension — see [Code block paste](./code-block-paste.md).

## Quick start

`<chx-paste-long-text>` is an editor extension — put it inside `<chx-message-composer>` as a
direct child (no slot needed, it renders nothing) and the composer picks it up. Without it,
pasting never collapses into a chip.

```js
import "@symblight/chat/composer";
```

```html
<chx-chat>
  <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
    <chx-paste-long-text></chx-paste-long-text>
  </chx-message-composer>
</chx-chat>
```

`paste-threshold` defaults to `205`. Set it to `0` or a negative number to disable the chip.

Line count is `text.split("\n")`, ignoring one trailing empty line (`"a\nb\n"` is 2 lines, not 3) —
the same count is used both for the threshold check and the chip's "N lines" label.

## Combined with `<chx-code-block-paste>`

When both extensions are present, `<chx-code-block-paste>` is asked first (it has a higher
`priority`), so a code paste becomes a code block at any length up to its `max-lines` (2000). `<chx-paste-long-text>` only
collapses pastes that weren't recognized as code. Child order doesn't matter.

## Sending — `chx-send-message` and `chx-change`

The chip never leaks into `value`/`html`: `value` contains the full pasted text at the chip's
position, exactly as if it had been pasted inline. `html` wraps it in
`<span data-paste-lines="N" data-kind="long-text">…</span>`. A paste from before `data.kind`
(neither `data-kind` nor `data-lang`) is still claimed and matched.

To keep it collapsed in the message list after send, split the message with the exported
`longTextPastePartRule` (a `type: "longText"` part with `{text, lines}`) and render that part type
through `partElements`:

```js
import { createSplitOnSendHandler } from "@symblight/chat";
import { longTextPastePartRule } from "@symblight/chat/composer";

chat.addEventListener("chx-messages-change", createSplitOnSendHandler([longTextPastePartRule]));
chat.partElements = { longText: (part) => renderMyDisclosure(part.text, part.lines) };
```

See `chat.stories.js`'s `PasteChip` story for a complete example.

## Custom chip rendering — `.buildElement()`

Override `chx-paste-long-text.buildElement(attrs, source)` to change how the chip renders — the
single place both a fresh paste and a later reconstruction (undo/redo, restoring a draft) draw
from, same override shape as `chx-command-picker.buildChip`/`chx-attachments.buildAttachment`.

```js
pasteLongTextEl.buildElement = ({ text, lines }, source) => {
  const chip = document.createElement("my-paste-chip");
  chip.textContent = `${lines} lines pasted`;
  chip.title = text.slice(0, 200); // e.g. a hover preview
  return chip;
};
```

`text` is the full pasted string, `lines` its line count, `data` is `{kind: "long-text"}`, and
`source` is always `"composer"`. The element is mounted directly into the editor
(`contenteditable="false"` is set on it automatically) and is only removable as a whole unit.

## `<chx-paste-chip>` — the built-in default

A standalone component (`chx-chip` underneath) used by the default `buildElement()`. It exposes
two slots you can override independently:

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

## `<chx-paste-long-text>` reference

| Property/attribute            | Type                                                              | Default  | Notes                                                                          |
| ----------------------------- | ----------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| `paste-threshold`             | `number`                                                          | `205`    | Collapse to the chip when the pasted line count is `>=` this. `<= 0` disables. |
| `buildElement(attrs, source)` | `(attrs: {text, lines, data}, source: "composer") => HTMLElement` | _(chip)_ | Method — see "Custom chip rendering" above.                                    |

Export: `longTextPastePartRule` — see "Sending" above.

## Migrating from the built-in code detection

Code detection moved out of `<chx-paste-long-text>` into `<chx-code-block-paste>`. Its
`min-code-lines`, `code-languages` and `max-code-error-ratio` and its `classify()` are gone; add a
`<chx-code-block-paste>` and use its `min-lines`, `languages`, `max-error-ratio` and `classify()`.
Without it, code pastes stay inline (or become a plain chip over `paste-threshold`).

## Not yet supported

- Click-to-expand or any other chip interaction beyond delete.
- Re-evaluating chips already in the document after `paste-threshold` changes.
- Surviving `chx-chat.input.setText()`/a composer disconnect-reconnect remount — both replace the
  document with plain text, same pre-existing limitation as command chips.
