# Mentions

`<chx-mention-field>` adds "type a trigger character, pick from a menu" behavior to
`chx-message-composer` (`@`, `/`, or any character you choose) — entirely opt-in. Neither
`chx-chat` nor `chx-message-composer` know anything about mentions unless you slot a
`<chx-mention-field>` in yourself.

> **Status**: composing/inserting a chip works end-to-end (see Quick start). The
> keystroke-detection state machine that watches the textbox for a trigger character and
> dispatches `mention-query` automatically is **not implemented yet** — today, triggering the
> flow (dispatching `mention-query`, opening the menu) is up to your own code. Sections below
> that depend on it are marked **Planned**.

## Quick start

```html
<chx-chat label="Write your prompt...">
  <chx-mention-field mentionCharacter="@" id="files" slot="mention-field"></chx-mention-field>
  <chx-mention-field mentionCharacter="/" id="command" slot="mention-field"></chx-mention-field>
</chx-chat>

<md-menu id="files-menu" for="files"></md-menu>
<md-menu id="command-menu" for="command"></md-menu>

<script>
  const filesEl = document.getElementById("files");
  const filesMenuEl = document.getElementById("files-menu");

  // Planned: composer will dispatch this automatically while the user types
  // "@query" in the textbox. For now, trigger it yourself (e.g. from a
  // toolbar button) to see the rest of the flow work.
  async function openFilesMention() {
    const options = await fetchTreeFiles(); // your own data source
    // ...append options as <md-menu-item> children of filesMenuEl...
    filesMenuEl.open = true;
  }

  filesMenuEl.addEventListener("change", (event) => {
    filesEl.value = event.target.value; // resolves the chip — see below
    filesMenuEl.open = false;
  });
</script>
```

Setting `.value` on the registered `<chx-mention-field>` is what finalizes the chip: composer
is listening for it and replaces the current selection in the textbox with a real, inserted
chip instance.

## `<chx-mention-field>`

| Attribute / property | Type     | Default | Description                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mentionCharacter`   | `string` | `"@"`   | The trigger character this instance represents. Read by your own trigger-detection code (until the built-in one lands) — purely data, not styled off in CSS.                                                                                                                                                                                               |
| `value`              | `string` | `""`    | The resolved display text. **Empty** = this instance is a plain registration/config node (used for discovery + `<md-menu for="id">` anchoring) and renders nothing at all. **Non-empty** = renders as a chip (composes `md-input-chip` internally — padding, radius, colors, ripple, hover state all come from that, nothing to theme separately for now). |
| `id`                 | `string` | —       | Plain DOM id, not mentions-specific — used for `<md-menu for="id">` anchoring and to tell registered instances apart in event handlers.                                                                                                                                                                                                                    |

Setting `.value` on a _registered_ instance (the one you declared in markup) is what triggers
insertion — composer creates a **new**, separate `<chx-mention-field>` instance for the actual
inserted chip (same tag, fresh element) rather than moving/cloning the registered one, so the
registered instance keeps existing for the next mention.

## Events

| Event              | Dispatched by                                                    | Bubbles / composed | `detail`                | Status                                                                                                                                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------- | ------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `change`           | `<chx-mention-field>`                                            | no / no            | —                       | ✅ Implemented. Internal signal (not part of the public API) — fires whenever `.value` changes; `chx-message-composer` listens for it to know when to insert the chip.                                                                                                                              |
| `mention-click`    | `<chx-mention-field>`                                            | yes / yes          | `{ value, id }`         | ✅ Implemented. Fires on click, whether the chip is sitting in the composer's textbox or (once message-list support lands) rendered inside a sent message. `composed: true` because a chip inside `chx-message-list` → `chx-message` crosses two shadow boundaries to reach a listener on your app. |
| `mention-hover`    | `<chx-mention-field>`                                            | yes / yes          | `{ value, id, active }` | ✅ Implemented. One event for both phases — `active: true` on mouseenter, `active: false` on mouseleave (hover has no single-shot "click" equivalent).                                                                                                                                              |
| `mention-query`    | `chx-message-composer` (on the registered `<chx-mention-field>`) | yes / no           | `{ value, character }`  | 🚧 **Planned** — the event shape is settled but nothing dispatches it yet. Will fire while the user types after a trigger character, `value: null` on close (space/Escape/deleted past the trigger).                                                                                                |
| `mention-selected` | `chx-message-composer`                                           | yes / yes          | `{ value, id }`         | 🚧 **Planned** — confirmation fired after the controller finalizes a chip. Not yet dispatched (the insertion code path exists — see below — but this event isn't wired into it yet).                                                                                                                |
| `sendMessage`      | `chx-message-composer`                                           | yes / yes          | `{ value, html }`       | ✅ Implemented. `value` — plain text (chip display text included, no structured data). `html` — the composer's raw contenteditable markup, including any inserted `<chx-mention-field>` chips as real elements, for rich reconstruction in `chx-message-list`.                                      |

## How insertion actually works today

1. You set `.value` on a registered `<chx-mention-field>` (see Quick start).
2. `chx-message-composer`'s `MentionFieldController` (`src/controllers/MentionFieldController.js`)
   is listening for that instance's `change` event.
3. It creates a **new** `<chx-mention-field>` instance (`document.createElement`, not a clone —
   the registered element's `id` shouldn't be duplicated), sets its `.value` and
   `contenteditable="false"`, and inserts it at the current selection in the textbox.

**Known gap**: step 3 inserts at wherever the caret currently is — it does not yet delete the
raw "@query" text the user typed, because nothing tracks _where_ that query started (that's
the same not-yet-built state machine mentioned above). Until it lands, this only behaves
correctly for a collapsed/empty selection.

## Cursor behavior around an inserted chip

No special code needed — this is native browser behavior for a `contenteditable="false"` node
inside a `contenteditable="true"` container:

- Arrow keys / clicking jump over the chip as one atomic unit (the caret can't land inside it).
- One Backspace right after a chip deletes the whole chip, not a piece of it.

(There's no trailing zero-width-space workaround in the code — an earlier draft had one and it
was removed specifically because it broke the one-Backspace-deletes-the-chip behavior above.)

## Multiple trigger characters

Just register more than one `<chx-mention-field>` — no wrapper element needed, they can all go
in the same `slot="mention-field"`:

```html
<chx-mention-field mentionCharacter="@" id="files" slot="mention-field"></chx-mention-field>
<chx-mention-field mentionCharacter="/" id="command" slot="mention-field"></chx-mention-field>
```

Each gets its own `<md-menu for="...">` anchored by `id`, and its own `change` listener in your
app code to resolve picks independently.

## Not yet supported

- Automatic trigger detection while typing (`mention-query` isn't dispatched yet — see Status).
- Deleting the raw query text on insertion (see "Known gap" above).
- Rendering/interactivity inside `chx-message-list` for already-sent messages.
- Icons/avatar in the chip (`md-input-chip` supports `leading-icon`/`avatar` slots already —
  `chx-mention-field` doesn't expose them yet).
- A defined format for how a mention chip's structured data (e.g. a user id, not just display
  text) should round-trip through `sendMessage`/`getMessages` beyond the raw `html` field.
