# Commands

"Type a trigger character, pick from a menu, get a chip" — entirely opt-in. Neither `chx-chat`
nor `chx-message-composer` know anything about commands unless you slot something into
`slot="command-field"` yourself.

Two ways to do that:

- **`<chx-command-picker>`** (this doc's main content) — a batteries-included component: give it
  a `commandCharacter` and a list of options (declaratively, or built dynamically), it owns the
  menu, keyboard navigation, positioning, and chip resolution for you.
- **`<chx-command-field>`** (see "Full customization" at the end) — a bare trigger/config marker
  with no behavior of its own, for when you want to build the menu, positioning, and chip
  markup completely yourself.

Start with `<chx-command-picker>` — reach for `<chx-command-field>` only once you hit something
the picker's public API genuinely doesn't cover.

## Quick start

The minimal case needs zero JavaScript — options are just light-DOM children, the same mental
model as native `<select>`/`<option>`:

```html
<chx-chat label="Write your prompt...">
  <chx-command-picker commandCharacter="@" id="files" slot="command-field">
    <md-menu-item value="index.js">index.js</md-menu-item>
    <md-menu-item value="chat.js">chat.js</md-menu-item>
    <md-menu-item value="command-field.js">command-field.js</md-menu-item>
  </chx-command-picker>
</chx-chat>
```

Typing `@` opens the menu positioned at the caret, arrow keys move a highlight (you keep typing
while navigating), Enter or a click resolves the highlighted item into a chip. That's the entire
contract for a static list.

## Dynamic filtering

For anything beyond a fixed list, listen for `chx-command-query` (fires on every keystroke while
a search is open) and rebuild the option set with `clearOptions()`/`addOptions()`:

```js
const filesEl = document.getElementById("files");
const FILES = [
  "index.js",
  "message-composer.js",
  "command-field.js",
  "chat.js",
  "text-formatter.js",
];

filesEl.addEventListener("chx-command-query", (event) => {
  const { value: query } = event.detail;
  filesEl.clearOptions();
  if (query === null) return; // closed: Escape, or the trigger character deleted

  const matches = FILES.filter((f) => f.toLowerCase().includes(query.toLowerCase()));
  const template = document.createElement("template");
  template.innerHTML = matches
    .map((f) => `<md-menu-item value="${f}">${f}</md-menu-item>`)
    .join("");
  filesEl.addOptions(template); // a <template> is detected automatically, `.content` is read for you
});
```

`clearOptions()`/`addOptions(container)` are the picker's only two methods — see the reference
table below for the full signature. Passing zero matching options (`addOptions` with an empty
container, or never calling it after `clearOptions()`) is what closes the menu when a query
stops making sense; the picker itself never decides that for you.

Async works exactly the same way, just `await`ed:

```js
filesEl.addEventListener("chx-command-query", async (event) => {
  const { value: query } = event.detail;
  filesEl.clearOptions();
  if (query === null) return;

  const results = await fetchTreeFiles(query); // any source — fetch, IndexedDB, a worker
  const fragment = document.createDocumentFragment();
  for (const r of results) {
    const item = document.createElement("md-menu-item");
    item.value = r.path;
    const icon = document.createElement("md-icon");
    icon.slot = "leading";
    icon.textContent = r.iconName; // rich content per option — just markup, see below
    item.append(icon, r.name);
    fragment.append(item);
  }
  filesEl.addOptions(fragment);
});
```

Options can carry whatever markup you want (icons, badges, a `supporting-text` line) — it's
`<md-menu-item>`'s own slots, nothing picker-specific. This only affects the **menu row**,
though — see the next section for what the **resolved chip** gets by default.

A query can contain spaces — typing "John Smith" after `@` keeps the search open. Note:
**a space in the query hides the picker's menu** (matching Slack/GitHub/Discord conventions) —
the search itself stays open and `chx-command-query` keeps firing with the space included in
`value`, only the menu's visibility is affected. Backspacing the space back out reopens it.

## Customizing the resolved chip

By default, resolving an option builds `<chx-chip>${optionText}</chx-chip>` — plain text, no
icon, regardless of how rich the matching menu row was. Two ways to get more than plain text
into the chip, both explicit rather than automatic:

**A fixed shell for every resolution of this field** — `slot="chip"` with a `<template>`:

```html
<chx-command-picker commandCharacter="@" id="files" slot="command-field">
  <template slot="chip">
    <chx-chip><md-icon slot="icon">description</md-icon></chx-chip>
  </template>
</chx-command-picker>
```

Every chip resolved through this field gets the same icon; only the label text varies per
resolution (filled in automatically).

**Per-resolution, computed in JS** — `chx-command-picked` fires the moment an option is
resolved, before the chip is actually inserted, with a `setChip(element)` escape hatch:

```js
filesEl.addEventListener("chx-command-picked", (event) => {
  const template = document.getElementById("js-file-chip-template"); // a real, static <template>
  const clone = template.content.cloneNode(true).firstElementChild;
  const icon = clone.querySelector('[slot="icon"]');
  if (icon) icon.textContent = iconFor(event.detail.value); // vary the icon per resolved option
  clone.append(event.detail.value); // <chx-chip>'s default slot is its text content
  event.detail.setChip(clone);
});
```

Pass a clone of a real, stable `<template>` you already own (not something built ad hoc) — this
is what lets the resolved chip survive correctly later on. Must be called synchronously from
this listener.

The default chip (no `slot="chip"`, no `chx-command-picked` listener) is always plain text —
varying the icon per option needs the `setChip` path above.

## `<chx-command-picker>` reference

### Properties

| Property           | Type     | Default | Notes                                                                                                                              |
| ------------------ | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `commandCharacter` | `string` | `"@"`   | The trigger character this instance represents.                                                                                    |
| `id`               | `string` | —       | Plain DOM id — derives the internal chip `<template>`'s id (`{id}-chip-template`) unless a `slot="chip"` template already has one. |

### Children (the options)

Any light-DOM child element with a readable `value` is treated as an option — `<md-menu-item>`
is the expected one (it already has `value`/`disabled`/rich slots). Options are always real
elements, built however you like (`document.createElement`, cloning a `<template>`, a plain HTML
string via `.innerHTML`, Lit's `render()`, a different framework). Declared statically as
children, they're picked up once at first render; added later via `addOptions`, same effect
either way.

### Methods

| Method         | Signature                                                               | Notes                                                                                                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clearOptions` | `(): void`                                                              | Removes all current options. Doesn't itself open/close the menu.                                                                                                                                                                            |
| `addOptions`   | `(container: Element \| DocumentFragment \| HTMLTemplateElement): void` | Adds each of `container`'s children as an option. A `<template>` is detected automatically and its `.content` read (and cloned) for you — pass the `<template>` itself, not `.content.cloneNode(true)`. An empty container closes the menu. |

Always called as a pair on `chx-command-query`: `clearOptions()` then, unless `value === null`,
`addOptions(...)` with the new set — see Dynamic filtering above.

### Slots

| Slot        | Purpose                                                                                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| _(unnamed)_ | The options themselves — see Children above.                                                                                                                                                                                   |
| `chip`      | Optional `<template>` for the resolved chip's shell, shared by every resolution of this field. Omit it and the picker builds a default `<chx-chip>` from the resolved option's text — see Customizing the resolved chip above. |

### Events

| Event                                          | Direction     | `detail`                             | Notes                                                                                                                                    |
| ---------------------------------------------- | ------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `chx-command-query`                            | in/out        | `{ value, character, target, x, y }` | The only event you need to handle — see Dynamic filtering. `value: null` means closed.                                                   |
| `chx-command-navigate` / `chx-command-confirm` | internal only | —                                    | Consumed entirely inside the picker (arrow-key highlight, Enter-resolves-highlighted). No listener needed.                               |
| `chx-command-picked`                           | out           | `{ target, value, setChip }`         | Fires the moment an option is resolved, before insertion — see Customizing the resolved chip. `value` is the resolved option's `.value`. |
| `chx-command-selected`                         | out           | `{ target, id }`                     | Fires after the chip is actually inserted into the textbox.                                                                              |

## `<chx-chip>` reference

The picker's default chip renderer — a styled chip wrapper. Standalone and reusable outside the
commands feature entirely.

```html
<chx-chip><md-icon slot="icon">description</md-icon>message-composer.js</chx-chip>
```

| Member           | Kind | Notes                                    |
| ---------------- | ---- | ---------------------------------------- |
| _(default slot)_ | slot | Chip text/content.                       |
| `icon` slot      | slot | Optional leading icon or avatar element. |

Exposes `--chx-chip-container-color`/`--chx-chip-label-color`/`--chx-chip-icon-color` custom
properties for theming.

## Positioning

The menu opens with a `top-start` placement and a 20px gap from the caret line by default.
These aren't currently exposed as picker-level properties — see Not yet supported.

## Multiple trigger characters

Just register more than one `<chx-command-picker>` — no wrapper element needed, they can all go
in the same `slot="command-field"`, each with its own `id`/`commandCharacter`/query handler:

```html
<chx-command-picker
  commandCharacter="@"
  id="files"
  slot="command-field"
  @chx-command-query="${handleFilesQuery}"
></chx-command-picker>
<chx-command-picker
  commandCharacter="/"
  id="commands"
  slot="command-field"
  @chx-command-query="${handleCommandsQuery}"
></chx-command-picker>
```

Only one can be "open" at a time, but each is otherwise fully independent (own menu, own chip
template, own options).

## Not yet supported

- **Per-picker `placement`/`offset` customization** — currently fixed, not exposed as a public
  property yet.
- **Rendering/interactivity inside `chx-message-list`** for already-sent messages.
- **A defined format** for how a chip's structured data (e.g. a user id, not just display text)
  should round-trip through `chx-send-message`/`getMessages` beyond the raw `html` field.
- **No marks** (bold/italic/etc.) yet in the composer's text.

---

## Full customization — `<chx-command-field>`

Reach for this when `<chx-command-picker>`'s public API doesn't cover what you need — full
control over the menu element, positioning, and chip markup, at the cost of wiring all of it
yourself.

### Quick start

```html
<chx-chat label="Write your prompt...">
  <chx-command-field commandCharacter="@" id="files" slot="command-field"></chx-command-field>
  <chx-command-field commandCharacter="/" id="commands" slot="command-field"></chx-command-field>
</chx-chat>

<!-- for="..." is a harmless static fallback, not the active anchor —
     chx-command-query's x/y (below) drive the real, caret-following position
     via openAtPoint(). -->
<md-menu id="files-menu" for="files"></md-menu>
<md-menu id="commands-menu" for="commands"></md-menu>

<!--
  Chip markup is entirely app-owned — chx-chat never constructs it. The
  chip's DOM is (re)built by re-cloning THIS <template> every time it
  renders — first insertion, undo/redo, or a reload — which is why the
  root chip element must carry data-template-id pointing back at this
  <template>'s own id, so the library can always find it again. The
  <script> below runs once per clone (real DOM insertion executes it,
  unlike innerHTML) and wires up click/hover — that's your responsibility,
  not chx-command-field's.
-->

<template id="files-chip-template">
  <md-input-chip data-template-id="files-chip-template"></md-input-chip>
  <script>
    const chip = document.currentScript.previousElementSibling;
    chip.addEventListener("click", (event) => console.log(event.target));
  </script>
</template>

<script>
  const filesEl = document.getElementById("files");
  const filesMenuEl = document.getElementById("files-menu");

  // Opaque token from chx-command-query's detail — hold onto it and pass it
  // back unchanged to insertAtCommand, so chx-chat can reject a stale
  // resolution (e.g. the user already backspaced past the trigger, or
  // opened a second command, before this fetch resolved).
  let activeTarget = null;

  // Composer dispatches this automatically while the user types "@query" in
  // the textbox (character matches this instance's commandCharacter).
  filesEl.addEventListener("chx-command-query", async (event) => {
    activeTarget = event.detail.target;
    if (event.detail.value === null) {
      filesMenuEl.toggle({ force: false }); // closed: Escape/deleted past the trigger
      return;
    }
    // event.detail.value can contain spaces — up to you to decide when a
    // query has stopped making sense (e.g. close when your own filter has
    // 0 matches).
    const options = await fetchTreeFiles(event.detail.value); // your own data source
    // ...append options as <md-menu-item> children of filesMenuEl...
    // Highlight the first one yourself — do NOT call menu.focusFirstItem()
    // here, it moves real DOM focus into the menu and breaks typing.
    filesMenuEl.querySelector("md-menu-item")?.setAttribute("selected", "");
    // event.detail.x/y are the trigger character's viewport coordinates —
    // openAtPoint anchors the menu right where the user is typing, not to
    // filesEl's own (fixed, off-screen) position.
    filesMenuEl.openAtPoint(event.detail.x, event.detail.y);
  });

  // Shared by both "picked with the mouse" and "confirmed with Enter" below
  // — resolves whichever value was chosen the same way either time.
  function resolveFiles(value) {
    const template = document.getElementById("files-chip-template");
    const node = template.content.cloneNode(true);
    const chip = node.querySelector("md-input-chip");
    if (chip) chip.textContent = value;
    chatEl.insertAtCommand(activeTarget, node); // replaces the tracked "@query" text
    filesMenuEl.open = false;
  }

  filesMenuEl.addEventListener("select", (event) => resolveFiles(event.detail.value));

  // Enter is swallowed by the composer while a search is open (it won't
  // submit the message) and re-dispatched here instead — decide what
  // "confirm" means yourself, since only your app knows which item is
  // currently highlighted. Read `.value` off it directly rather than
  // simulating a click/keydown on the item: a synthetic (non-trusted)
  // event doesn't reliably trigger an <md-menu-item>'s own selection logic.
  filesEl.addEventListener("chx-command-confirm", () => {
    const highlighted = filesMenuEl.querySelector("md-menu-item[selected]");
    if (highlighted) resolveFiles(highlighted.value);
  });

  // ArrowUp/ArrowDown while a search is open — same swallow-and-redispatch
  // shape as Enter above. Focus deliberately stays in the composer the
  // whole time (so typing keeps working), so the highlight is your own
  // state, driven via <md-menu-item>.selected — independent of real focus
  // (unlike menu.focusFirstItem(), which moves real focus into the menu
  // and breaks typing).
  filesEl.addEventListener("chx-command-navigate", (event) => {
    const menuItems = [...filesMenuEl.querySelectorAll("md-menu-item")];
    if (menuItems.length === 0) return;
    let index = menuItems.findIndex((item) => item.selected);
    index += event.detail.direction === "down" ? 1 : -1;
    index = ((index % menuItems.length) + menuItems.length) % menuItems.length;
    for (const item of menuItems) item.selected = false;
    menuItems[index].selected = true;
  });
</script>
```

Calling `chatEl.insertAtCommand(target, node)` is what finalizes the chip: composer replaces
the raw typed text (from the trigger character to the caret) with `node`, made non-editable.
`target` must match the token the composer is currently tracking — a stale/late resolution
(after the trigger closed or a different command opened) is silently ignored rather than
inserting into the wrong place.

### `<chx-command-field>`

| Attribute / property | Type     | Default | Description                                                                                                                                                                 |
| -------------------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commandCharacter`   | `string` | `"@"`   | The trigger character this instance represents.                                                                                                                             |
| `id`                 | `string` | —       | Plain DOM id — used to tell registered instances apart in event handlers and to derive your `<md-menu>`/`<template>` ids by convention (`{id}-menu`, `{id}-chip-template`). |

Pure trigger/config, nothing more — it never renders anything itself and has no `.value`. It
exists purely so `chx-chat` can discover it (`slot="command-field"`). The inserted chip is a
completely separate, app-defined `Node`, not an instance of this component. Your `<md-menu>`
doesn't need to anchor to this field at all — `chx-command-query`'s `x`/`y` (see Events) let
you open it right at the caret via `openAtPoint`.

### `chx-chat.insertAtCommand(target, node)`

Resolves the command search identified by `target` (the token from that search's
`chx-command-query` events) by replacing its tracked "@query" range with a chip. `node` is
inspected **once** — the library reads `data-template-id` and the text content off it, then
discards `node` itself; it's never inserted verbatim. The actual chip DOM is rebuilt from those
values by re-cloning your `<template>` every time it needs to render — first insertion,
undo/redo, or reconstructing the document from saved state after a reload — the same code path
every time. `contenteditable="false"` is set on the chip automatically — you don't need to. The
`<script>` inside your `<template>` runs once per clone and wires up click/hover — that's your
responsibility. A `target` that no longer matches the currently active search is a no-op
(prevents a late-resolving async fetch from inserting into a range the user has already moved
past).

### Events

| Event                  | Dispatched by                                                             | Bubbles / composed | `detail`                             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------- | ------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chx-command-query`    | `chx-message-composer` (on the matching registered `<chx-command-field>`) | yes / no           | `{ value, character, target, x, y }` | Fires on every keystroke while a trigger character is "open" (at the start of a line, or right after whitespace — `user@domain` mid-word never triggers, and the caret has to sit at the end of the query, not merely inside/before already-typed text). `value` is the text typed since the trigger, spaces included. `value: null` signals close (Escape pressed, or the trigger character deleted). `target` is an opaque token identifying this search session — pass it back to `insertAtCommand`. `x`/`y` are the trigger character's viewport coordinates, fixed for the whole session, meant for `menu.openAtPoint(x, y)`; not present when `value` is `null`. |
| `chx-command-confirm`  | `chx-message-composer` (on the matching registered `<chx-command-field>`) | yes / no           | `{ target }`                         | Fires when Enter is pressed while a search is open — the composer swallows Enter itself (so it never submits the message mid-search) and leaves "what does confirm mean" entirely to you, since only your app knows which item is currently highlighted.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `chx-command-navigate` | `chx-message-composer` (on the matching registered `<chx-command-field>`) | yes / no           | `{ target, direction }`              | Fires when ArrowUp/ArrowDown is pressed while a search is open. `direction` is `"up"` or `"down"`. Focus is never moved to the menu for this — see Quick start's `handleNavigate` for driving `<md-menu-item>.selected` directly instead of `menu.focusFirstItem()`/real DOM focus.                                                                                                                                                                                                                                                                                                                                                                                    |
| `chx-command-selected` | `chx-message-composer`                                                    | yes / yes          | `{ target, id }`                     | Confirmation, fired after the node is actually inserted into the textbox.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `chx-send-message`     | `chx-message-composer`                                                    | yes / yes          | `{ value, html }`                    | `value` — plain text (chip display text included, no structured data). `html` — a serialized markup snapshot; a `command` chip serializes to a static placeholder, not the live interactive markup.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

`command-click`/`command-hover` are not part of this component's public API — since the
inserted chip is an app-defined `Node`, click/hover wiring is the app's own responsibility, done
inside the `<template>`'s self-wiring `<script>` (see Quick start above).

### Cursor behavior around an inserted chip

No special code needed — a chip is atomic, non-editable, and behaves like any atomic
non-editable node in a text field:

- Arrow keys / clicking jump over the chip as one atomic unit (the caret can't land inside it).
- One Backspace right after a chip deletes the whole chip, not a piece of it.

### Multiple trigger characters

Just register more than one `<chx-command-field>` — no wrapper element needed, they can all go
in the same `slot="command-field"`:

```html
<chx-command-field commandCharacter="@" id="files" slot="command-field"></chx-command-field>
<chx-command-field commandCharacter="/" id="commands" slot="command-field"></chx-command-field>
```

Each gets its own `<md-menu>`/`<template>` pair (found by `id` convention, see `<chx-command-
field>` above), and its own `chx-command-query` listener in your app code — detection, resolution,
and insertion are all handled per-character independently; only one can be "open" at a time
since it's driven by a single caret position.
