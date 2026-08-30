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
<chx-chat label="Write your prompt...">
  <chx-message-composer>
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
button. `chx-send-message`'s `detail` gains a third field for exactly this: `attachments: File[]`
— see "Sending" below.

Like `chx-command-picker`'s options, `<chx-attachments>`' children ARE its cards — no `.files`
array property. Unlike the picker's options, though, a card can only ever come from JS: the only
tag `<chx-attachments>` accepts as a child is `<chx-attachment slot="attachment">`, and
`<chx-attachment>` itself only has one meaningful input, `.file` (a real `File`) — there's no
declarative `name`/`size`/`type` markup path, since a card with nothing actually attached has
nothing meaningful to show. Static markup only makes sense as the _output_ of JS (see below), not
something you hand-author with made-up data.

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

## `<chx-attachments>` reference

### Children (the cards)

Only `<chx-attachment slot="attachment">` is accepted as a card — anything else isn't rendered
(it won't match the named `attachment` slot) and is filtered out of `getAttachments()`. For a
custom look, put custom content inside a `<chx-attachment>` via its own slots rather than
substituting a different element — see "Custom card content" above.

### Methods

| Method             | Signature                                                                 | Notes                                                                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open`             | `(): void`                                                                | Opens the native file picker via an internal hidden `<input type="file" multiple>`. Wire your own upload button's click to this.                                                                                                                                                             |
| `addFiles`         | `(files: FileList \| File[], source?: "picker" \| "drop" \| "api"): void` | Converts each `File` into a card — the default `<chx-attachment>` unless `slot="card"` overrides it — after firing `chx-attach` (see Events). Called internally by the file input and by `chx-textbox`'s drop handling; call it yourself only if you're building a custom drop/pick trigger. |
| `addAttachments`   | `(container: Element \| DocumentFragment): void`                          | JS-driven escape hatch — appends each of `container`'s children as a card, bypassing the File → default-card conversion. See "Custom card shape".                                                                                                                                            |
| `removeAttachment` | `(element: Element): void`                                                | Removes one card without going through `chx-attachment-remove` — for programmatic cleanup, e.g. after a failed upload.                                                                                                                                                                       |
| `clearAttachments` | `(): void`                                                                | Removes all current cards.                                                                                                                                                                                                                                                                   |
| `getAttachments`   | `(): File[]`                                                              | Reads `.file` off every current card, in DOM order, skipping any that don't expose one. Backs `chx-send-message`/`chx-change`'s `attachments` field.                                                                                                                                         |

### Slots

| Slot         | Purpose                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attachment` | The cards themselves — `<chx-attachment>` only, see Children above.                                                                                      |
| `card`       | Optional `<template>` (or plain element) overriding the shell used for every auto-created default card — see "Overriding the default auto-created card". |

### Events

| Event                   | Direction                                       | `detail`                                                 | Notes                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chx-attach`            | out, bubbles, composed, **cancelable**          | `{ files: File[], source: "picker" \| "drop" \| "api" }` | Fired before the default card is created, whether from the file picker or a drop. `preventDefault()` suppresses the default-card creation entirely — see "JS-driven". |
| `chx-attachment-remove` | in (also observable, bubbles past this element) | `{ file: File \| undefined, element: Element }`          | Fired by a card's own remove button (see `<chx-attachment>` below). `chx-attachments` removes the matching card from itself automatically.                            |

## `<chx-attachment>` reference

### Properties

| Property       | Type                | Notes                                                                                                      |
| -------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `file`         | `File \| undefined` | The attached file — name/size/icon all derive from this. Required for `getAttachments()` to see this card. |
| `loading`      | `boolean`           | Shows `loadingLabel` (and a spinner) in place of the icon/name — set this while an upload is in flight.    |
| `loadingLabel` | `string`            | Defaults to `"Uploading…"`.                                                                                |

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

Built on [`@atlaskit/pragmatic-drag-and-drop`](https://atlassian.design/components/pragmatic-drag-and-drop)'s
external (OS file) adapter.

## Attaching a file programmatically

`chx-chat.attachFile(file)` attaches a `File` the same way picking or dropping one would — fires
`chx-attach` with `source: "api"`, still preventable by a JS-driven listener. Useful for anything
that gets you a `File` outside the picker/drop path (pasted from the clipboard, fetched from
somewhere else, produced by your own UI):

```js
chatEl.attachFile(someFile);
```

A no-op if no `<chx-attachments>` is connected. `chx-message-composer` exposes the same method,
if you're working one level down.

## Not yet supported

- MIME-type-to-icon mapping for the default card — `file.type` is available but the default card
  only ever renders a generic icon + name, no size/type text.
- A max-file-count/total-size guard built into `chx-attachments` itself — validate in your own
  `chx-attach` listener (see "JS-driven") for now.
- Any prescribed shape for what an _uploaded_ attachment looks like once it has a URL/id —
  `attachments` on `chx-send-message`/`chx-change` is the raw `File[]` at that moment, nothing more.
