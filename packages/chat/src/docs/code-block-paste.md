# Code block paste

With `<chx-code-block-paste>`, pasting something that looks like code into the composer collapses
it into an editable `<chx-code-block>` with syntax highlighting, a language picker and line
numbers, instead of a wall of plain text. Paste is still forced to plain text; this only changes
how a _code-shaped_ paste is displayed.

It's independent from the long-text chip ([Paste chip](./paste-chip.md)). Use either one, or
both.

## Quick start

`<chx-code-block-paste>` is an editor extension — put it inside `<chx-message-composer>` as a
direct child (no slot needed, it renders nothing).

```js
import "@symblight/chat/composer";
```

```html
<chx-message-composer slot="message-composer" placeholder="Paste some code...">
  <chx-code-block-paste></chx-code-block-paste>
  <chx-paste-long-text></chx-paste-long-text>
  <!-- optional -->
</chx-message-composer>
```

When both are present, code wins: `<chx-code-block-paste>` has a higher extension `priority`, so it
is asked first and a code paste becomes a code block at any length up to `max-lines`. Child order doesn't matter.

## Code detection

`classify()` runs pasted text through a Lezer-grammar parse-error heuristic (`detect-language.js`):
a language whose grammar parses the text with few or no recovery errors is treated as a match.
It runs synchronously during the paste, once per candidate language, so very large pastes cost a
full parse each.

| Property/attribute | Type       | Default                                                 | Notes                                                                  |
| ------------------ | ---------- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `min-lines`        | `number`   | `2`                                                     | Below this line count, a paste is never checked for code.              |
| `max-lines`        | `number`   | `2000`                                                  | From this line count on, a paste is never checked (`<= 0`: no cap).    |
| `languages`        | `string[]` | `["json", "javascript", "typescript", "python", "css"]` | Property only — candidate language ids, most-specific first.           |
| `max-error-ratio`  | `number`   | `0.01`                                                  | Highest tolerated share of the input covered by parse-recovery errors. |

## Editing in place

The default block is `editable` with a language menu. Edits sync back into the editor document, so
`value`/`html` on send contain the edited code and the picked language. Arrow keys move between the
textbox and the block. Emptying the block removes it.

## Sending — `chx-send-message` and `chx-change`

`value` contains the full code at the block's position. `html` wraps it in
`<span data-paste-lines="N" data-kind="code" data-lang="…">…</span>`. A paste from before
`data.kind` (a restored draft, older sent HTML) has only `data-lang`; it's still claimed and matched.

To render it as a code block in the message list after send, split the message with the exported
`codeBlockPastePartRule` (a `type: "code"` part with `{text, lang}`) and render that part type
through `partElements`:

```js
import { createSplitOnSendHandler } from "@symblight/chat";
import { codeBlockPastePartRule } from "@symblight/chat/composer";

chat.addEventListener("chx-messages-change", createSplitOnSendHandler([codeBlockPastePartRule]));
chat.partElements = {
  code: (part, previous) => {
    const block = previous ?? document.createElement("chx-code-block");
    block.code = part.text ?? "";
    block.lang = part.lang ?? "";
    block.copyable = true;
    return block;
  },
};
```

See `code-block.stories.js`'s `PasteRecognizesCode`/`MockedMessages` stories.

## Customizing — `classify()`, `buildElement()`, `updateElement()`

All three are plain overridable methods (assign or subclass), same shape as
`chx-command-picker.buildChip`.

- `classify(text, lines) => {lang} | null` — decides what counts as code. Any extra fields you
  return are kept in the node's `data` and serialized as `data-*` attributes.
- `buildElement({text, lines, data}, "composer") => HTMLElement` — renders the block. Events
  `chx-code-block-change`/`-lang-change`/`-boundary` bubbling from anywhere inside the returned
  element are synced back automatically, so wrapping a `chx-code-block` in your own element works.
- `updateElement(element, {text, lines, data})` — pushes undo/redo changes into the element.
  Override it together with `buildElement` if your element isn't a `chx-code-block`.

## Reference

| Member                          | Kind     | Notes                                       |
| ------------------------------- | -------- | ------------------------------------------- |
| `min-lines`                     | property | See "Code detection".                       |
| `max-lines`                     | property | See "Code detection".                       |
| `languages`                     | property | See "Code detection".                       |
| `max-error-ratio`               | property | See "Code detection".                       |
| `classify(text, lines)`         | method   | See "Customizing".                          |
| `buildElement(attrs, source)`   | method   | See "Customizing".                          |
| `updateElement(element, attrs)` | method   | See "Customizing".                          |
| `codeBlockPastePartRule`        | export   | `InlinePartRule` for the post-send message. |

## Writing your own paste extension

Both elements use the same contract (`src/editor/extension.js`): an element exposing an
`[EDITOR_EXTENSION]` getter returning `{priority?, handlePaste?, buildPasteElement?,
updatePasteElement?}`. `handlePaste` returns the node's `data` (put a `kind` in it), and
`buildPasteElement` returns `null` for nodes whose `data.kind` isn't yours. An editable element
syncs back by dispatching `chx-paste-change` (`{text?, data?}`) and `chx-paste-boundary`
(`{direction}`) on itself.
