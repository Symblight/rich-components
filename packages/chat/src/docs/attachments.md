# Attachments

A file-attachment row above the composer's input — entirely opt-in. Neither `chx-chat` nor
`chx-message-composer` know anything about attachments unless you slot a `<chx-attachments>` into
`slot="attachments"` yourself.

`<chx-attachments>` handles the file picker, OS drag-and-drop onto the field, and default card
rendering for you. `<chx-attachment>` (singular) is the card itself — standalone and reusable if
you ever need one outside the row.

## Quick start

The minimal case needs one button wired up (`attachments.open()`) — everything else, including
drag-and-drop, just works:

```js
import "@symblight/chat";
```

```html
<chx-chat>
  <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
    <md-icon-button slot="leading" id="upload-trigger">
      <md-icon>${unsafeSVG(attachFileIcon)}</md-icon>
    </md-icon-button>
    <chx-attachments slot="attachments" id="attachments"></chx-attachments>
  </chx-message-composer>
</chx-chat>

<script>
  uploadTriggerEl.addEventListener("click", () => attachmentsEl.open());
</script>
```

Clicking the button opens the native file picker; dropping files anywhere on the field works
too. Each file becomes a default `<chx-attachment>` card (icon + name), with a built-in remove
button — `removable` is `false` on a bare `<chx-attachment>`, and `<chx-attachments>` turns it on
for every card it adopts (`addAttachments`), so composer cards are always closable. `chx-send-message`'s `detail` gains a third field for exactly this: `attachments: File[]`
— see "Sending" below.

Like `chx-command-picker`'s options, `<chx-attachments>`' children ARE its cards — no `.files`
array property. Unlike the picker's options, though, a card can only ever come from JS: the only
tag `<chx-attachments>` accepts as a child is `<chx-attachment slot="attachment">`, and
`<chx-attachment>` itself only has one meaningful input, `.file` (a real `File`) — there's no
declarative `name`/`size`/`type` markup path, since a card with nothing actually attached has
nothing meaningful to show. Static markup only makes sense as the _output_ of JS (see below), not
something you hand-author with made-up data.

## Two modes: header row (default) vs. inline chip

`mode="header"` (the default, and everything described above/below unless stated otherwise) puts
each attached file into the card row above the input. `mode="chip"` instead inserts it as an
inline chip directly into the composer's text at the current caret position — the exact same
mechanism a resolved `chx-command-picker` chip uses:

```html
<chx-attachments id="files" mode="chip" slot="attachments"></chx-attachments>
```

Chip mode requires this element to have an `id` (same requirement `chx-command-picker` has) — the
id is stamped onto the inserted chip's `data.chipOwnerId`, purely informational data your own
`partElements.chip` renderer can key off of if you have multiple chip sources on the page. In chip
mode, `addFiles`/picking/dropping a file never touches the header row at all — no card, no
`chx-attach`-then-card flow; the file becomes a `chip` node in the document instead, and
`getAttachments()`/the card-row methods stay empty. The default chip look is a plain `<chx-chip>`
with the file name — override it with `slot="chip"` (a `<template>`, same convention as
`chx-command-picker`'s own `slot="chip"`) or `buildChip` (see Methods below) for a JS-built look.

Rendering a sent chip-mode attachment in the message list works exactly like a command-picker
chip — same `chipPartRule`/`splitMessageParts`/`partElements.chip` mechanism, see `commands.md`'s
"Rendering a sent chip in the message list". Pass `buildChip` (bound to this element) as your
`partElements.chip` renderer for the same look live and historical.

A chip-mode attachment does **not** carry the actual `File` through to the sent message the way a
header-mode one does — once sent, only whatever metadata you put in the chip's `data` survives
(strings only, via `data-*` attributes), same as a command chip's `data-path`-style app data. If
you need the file itself recoverable later (e.g. an upload URL), that's your own data to carry,
not something this library preserves for you.

## JS-driven — validation, uploads, a loading placeholder

Listen for `chx-attach` (fires for both the file picker and a drop, cancelable) and call
`preventDefault()` to take over entirely — build your own cards, upload, whatever you need:

```js
attachmentsEl.addEventListener("chx-attach", async (event) => {
  event.preventDefault(); // suppress the default <chx-attachment> auto-creation

  const MAX_SIZE = 2 * 1024 * 1024;
  const accepted = event.detail.files.filter((f) => f.size <= MAX_SIZE);

  const fragment = document.createDocumentFragment();
  const cards = accepted.map((file) => {
    const card = document.createElement("chx-attachment");
    card.slot = "attachment"; // addAttachments sets this for you too, but explicit is clearer here
    card.file = file;
    card.loading = true; // shows loadingLabel ("Uploading…") in place of the name/icon
    fragment.append(card);
    return card;
  });
  event.target.addAttachments(fragment);

  for (const card of cards) {
    await uploadFile(card.file); // your own upload path
    card.loading = false;
  }
});
```

`event.detail.source` is `"picker"` or `"drop"` if you need to tell them apart; otherwise both
behave identically.

## Custom card content

`addAttachments` only ever accepts `<chx-attachment>` — anything else in the container you pass it
is silently dropped, and `addAttachments` sets `slot="attachment"` on what it does accept even if
you forgot to. For a richer look than the default icon-over-label, build the `<chx-attachment>`
yourself and fill in its own `icon`/default slots instead of substituting a foreign element:

```js
attachmentsEl.addEventListener("chx-attach", (event) => {
  event.preventDefault();

  const fragment = document.createDocumentFragment();
  for (const file of event.detail.files) {
    const card = document.createElement("chx-attachment");
    card.file = file; // required — this is what getAttachments() reads

    const icon = document.createElement("md-icon");
    icon.slot = "icon";
    icon.innerHTML = iconForType(file.type);

    const text = document.createElement("div");
    text.innerHTML = `
      <span>${file.name}</span>
      <span>${file.type} · ${Math.round(file.size / 1024)} KB</span>
    `; // replaces the card's default name-only content — style it however you want

    card.append(icon, text);
    fragment.append(card);
  }
  event.target.addAttachments(fragment);
});
```

Note what this can't do: the card's own _box_ (the icon-over-label square) isn't restylable into,
say, a horizontal row from outside — the flex container that arranges icon/content/actions lives
inside `<chx-attachment>`'s internal `<md-card>`, one shadow level past what a single `::part()`
hop from your own CSS can reach. Customization here is scoped to _content_, not layout.

## Overriding the default auto-created card

For files added via the file picker or a drop **without** a `chx-attach` listener taking over
(the zero-JS path), the default card is a plain `<chx-attachment>`. Override its shell for every
auto-created card with `slot="card"` — the template's root must be a `<chx-attachment>` too (a
different root is ignored, falling back to the plain default, same as if no template were given
at all):

```html
<chx-attachments slot="attachments">
  <template slot="card">
    <chx-attachment>
      <md-icon slot="icon">description</md-icon>
    </chx-attachment>
  </template>
</chx-attachments>
```

## Sending — `chx-send-message` and `chx-change`

Both events include the currently attached files, read at the moment they fire:

- `chx-send-message`'s `detail` is `{ value, html, attachments }` — `attachments: File[]`, read
  from whatever's currently in the row. `chx-message-composer` clears both the textbox and the
  attachments row right after dispatching, same as it already cleared the textbox alone before.
- `chx-change`'s `detail` is `{ value, html, attachments }` too, kept live on every keystroke/edit —
  useful if you're mirroring compose-state elsewhere before the user actually sends.

Actually uploading files (as opposed to just tracking them) is your own responsibility — see the
JS-driven example above. `attachments` on send is the current `File[]` snapshot, not upload
results; nothing in this package prescribes a URL/attachment-id shape yet.

## Rendering a sent attachment in the message list (header mode)

`chx-chat.handleSend` already gives each attached file its own `{type: "attachment", attachment:
File}` part directly — unlike chip mode, there's no `html` to split. Wire `partElements.attachment`
straight to `buildAttachment`:

```js
chatEl.partElements = {
  attachment: (part) => attachmentsEl.buildAttachment(part.attachment, "message"),
};
```

A sent card has no remove button — `removable` defaults to `false`, and only `addAttachments`
(the composer tray) turns it on.

## `<chx-attachments>` reference

### Children (the cards)

Only `<chx-attachment slot="attachment">` is accepted as a card — anything else isn't rendered
(it won't match the named `attachment` slot) and is filtered out of `getAttachments()`. For a
custom look, put custom content inside a `<chx-attachment>` via its own slots rather than
substituting a different element — see "Custom card content" above. Chip mode never produces cards
at all — see "Two modes" above.

### Properties

| Property | Type                 | Default    | Notes                                                                                                           |
| -------- | -------------------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| `mode`   | `"header" \| "chip"` | `"header"` | Where an attached file goes — the card row (today's default behavior) or an inline chip. See "Two modes" above. |

### Methods

| Method             | Signature                                                                                | Notes                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `open`             | `(): void`                                                                               | Opens the native file picker via an internal hidden `<input type="file" multiple>`. Wire your own upload button's click to this.                                                                                                                                                                                                                             |
| `addFiles`         | `(files: FileList \| File[], source?: "picker" \| "drop" \| "api"): void`                | Converts each `File` into a card (header mode) or an inline chip (chip mode) — after firing `chx-attach` (see Events; `preventDefault()` suppresses creation in either mode). Called internally by the file input and by `chx-textbox`'s drop handling.                                                                                                      |
| `addAttachments`   | `(container: Element \| DocumentFragment): void`                                         | Header mode only. JS-driven escape hatch — appends each of `container`'s children as a card, bypassing the File → default-card conversion. See "Custom card shape".                                                                                                                                                                                          |
| `buildAttachment`  | `(file: File, source?: "composer" \| "message"): HTMLElement`                            | Header mode's single card-drawing point — used by both `addFiles` (live, `source: "composer"`) and your own `partElements.attachment` renderer for historical re-rendering (`source: "message"`, `part.attachment` holds the `File`). Override to customize the look everywhere at once; does not decide `.slot`, see the class-level doc comment in source. |
| `buildChip`        | `(attrs: {templateId, label, icon, data}, source: "composer" \| "message"): HTMLElement` | Chip mode's counterpart to `buildAttachment` — single draw point shared by live insertion (`insertChip`, `source: "composer"`) and your own `partElements.chip` renderer (`source: "message"`). Override for a JS-built chip look instead of `slot="chip"`. Same shape as `chx-command-picker.buildChip`.                                                    |
| `removeAttachment` | `(element: Element): void`                                                               | Header mode only. Removes one card without going through `chx-attachment-remove` — for programmatic cleanup, e.g. after a failed upload.                                                                                                                                                                                                                     |
| `clearAttachments` | `(): void`                                                                               | Header mode only. Removes all current cards.                                                                                                                                                                                                                                                                                                                 |
| `getAttachments`   | `(): File[]`                                                                             | Header mode only (chip-mode files aren't tracked as separate cards). Reads `.file` off every current card, in DOM order, skipping any that don't expose one. Backs `chx-send-message`/`chx-change`'s `attachments` field.                                                                                                                                    |

### Slots

| Slot         | Purpose                                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attachment` | Header mode only. The cards themselves — `<chx-attachment>` only, see Children above.                                                                                      |
| `card`       | Header mode only. Optional `<template>` (or plain element) overriding the shell used for every auto-created default card — see "Overriding the default auto-created card". |
| `chip`       | Chip mode only. Optional `<template>` (or plain element) overriding the chip shell for every resolution — same convention as `chx-command-picker`'s own `slot="chip"`.     |

### Events

| Event                   | Direction                                       | `detail`                                                 | Notes                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chx-attach`            | out, bubbles, composed, **cancelable**          | `{ files: File[], source: "picker" \| "drop" \| "api" }` | Fired before the default card is created, whether from the file picker or a drop. `preventDefault()` suppresses the default-card creation entirely — see "JS-driven". |
| `chx-attachment-remove` | in (also observable, bubbles past this element) | `{ file: File \| undefined, element: Element }`          | Fired by a card's own remove button (see `<chx-attachment>` below). `chx-attachments` removes the matching card from itself automatically.                            |

## `<chx-attachment>` reference

### Properties

| Property       | Type                | Notes                                                                                                         |
| -------------- | ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `file`         | `File \| undefined` | The attached file — name/size/icon all derive from this. Required for `getAttachments()` to see this card.    |
| `loading`      | `boolean`           | Shows `loadingLabel` (and a spinner) in place of the icon/name — set this while an upload is in flight.       |
| `loadingLabel` | `string`            | Defaults to `"Uploading…"`.                                                                                   |
| `removable`    | `boolean`           | Shows the hover-revealed remove button. Defaults to `false`; `chx-attachments.addAttachments` sets it `true`. |

### Slots

| Slot        | Purpose                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------- |
| _(unnamed)_ | Override the card's main content entirely.                                                    |
| `icon`      | Custom leading icon/thumbnail — default is a generic file icon.                               |
| `actions`   | Override the trailing remove control — default is a small `md-icon-button` with a close icon. |

### Events

| Event                   | Direction              | `detail`                                     | Notes                                                                                                                                                                                    |
| ----------------------- | ---------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chx-attachment-remove` | out, bubbles, composed | `{ file: File \| undefined, element: this }` | Fired by the default remove button. A custom `actions` slot control should fire this itself (or call `chx-attachments.removeAttachment(this)`) to stay inside the same removal contract. |

## Drag-and-drop

Dropping files works anywhere in `<chx-chat>` — the composer's field _and_ the message list, not
just the attachments row (which is empty/zero-height before the first attachment exists). This is
gated on a `<chx-attachments>` actually being connected: if you never slot one in, the rest of the
chat isn't a dropzone either, dropping a file just does nothing.

While a file is dragged over, **both** the composer's field and `<chx-message-list>` (if present)
show a dashed border and a hint overlay in place of their normal content — shown together
regardless of which part of the chat is currently under the cursor, same single-consistent-cue
reasoning either way. Customize the hint text on each independently via their own `drop-hint`
attribute (both default to `"Release to attach"`):

```html
<chx-message-list drop-hint="Drop to attach"></chx-message-list>
<chx-message-composer drop-hint="Drop to attach"> ... </chx-message-composer>
```

Uses native drag events on `chx-chat` itself, so it works however deeply the chat is nested in
other components' shadow roots.

## Attaching a file programmatically

`chx-chat.attachments.add(files)` attaches one `File` or an array the same way picking or dropping
would — fires `chx-attach` with `source: "api"`, still preventable by a JS-driven listener. Useful
for anything that gets you a `File` outside the picker/drop path (fetched from somewhere else,
produced by your own UI):

```js
chatEl.attachments.add(someFile);
chatEl.attachments.getFiles(); // File[] currently attached
chatEl.attachments.clear();
```

A no-op (with a one-time console warning) if no `<chx-attachments>` is connected — check
`ChatController.isAvailable("attachments")` to hide UI that depends on it. Same `mode`-based
branching as any other attach path — in chip mode, `add` inserts a chip at the current caret
position instead of adding a card. Used standalone, `<chx-attachments>` keeps its own methods
(`addFiles(files, source)`, `clearAttachments()`, `getAttachments()`, `open()`). See
[Public API](./public-api.md).

## Not yet supported

- MIME-type-to-icon mapping for the default card — `file.type` is available but the default card
  only ever renders a generic icon + name, no size/type text.
- A max-file-count/total-size guard built into `chx-attachments` itself — validate in your own
  `chx-attach` listener (see "JS-driven") for now.
- Any prescribed shape for what an _uploaded_ attachment looks like once it has a URL/id —
  `attachments` on `chx-send-message`/`chx-change` is the raw `File[]` at that moment, nothing more
  (chip mode is the same story — only whatever you put in the chip's own `data` survives to a sent
  message, see "Two modes" above).
