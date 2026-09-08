# Suggestions API — spec

Clickable starter prompts shown above the composer, empty-thread by default:

```html
<chx-message-composer>
  <chx-suggestion-list slot="suggestions">
    <chx-suggestion value="Write an email">Write an email</chx-suggestion>
    <chx-suggestion value="Summarize a document">Summarize a document</chx-suggestion>
    <chx-suggestion value="Ask a question" auto-submit>Ask a question</chx-suggestion>
  </chx-suggestion-list>
  <md-button slot="actions">…</md-button>
</chx-message-composer>
```

Decided with the user (2026-09-06):

- **Placement**: new `suggestions` slot on `chx-message-composer` itself, rendered above
  `chx-textbox`'s bordered field (outside the field, not routed through `chx-textbox` the way
  `leading`/`attachments`/`trailing` are) — same "consumer imports and slots it in, composer never
  auto-registers it" status as `chx-attachments`.
- **Empty-thread signal**: `chx-chat` computes it and pushes it down, same `pushComposerProperties()`
  mechanism as `label`/`loading`/`commandFields`/`dragging`. **Live**, not a latch — recomputed fresh
  every render from `#internalMessages.length === 0`, same spirit as `#isWaitingForReply()`. If
  messages are later cleared back to empty (app-driven), suggestions reappear when not
  `alwaysVisible`.
- **No `messagesEmpty` property on `chx-suggestion-list`**: an earlier pass exposed the pushed
  emptiness signal as a second public property (`messagesEmpty`) alongside `alwaysVisible`, with
  `chx-suggestion-list` rendering `alwaysVisible || messagesEmpty`. Collapsed — the two were doing the
  same job under different names. `chx-suggestion-list` now has exactly one visibility-related
  property, `alwaysVisible`, and doesn't compute visibility itself at all; `chx-message-composer` owns
  the whole decision (it's the one component that actually receives the emptiness push from
  `chx-chat`) and expresses it via the standard `hidden` IDL attribute rather than a bespoke property
  — see "Visibility ownership" below.
- **Click wiring**: bubbling custom event, `chx-suggestion-select` (`{value, autoSubmit}`), dispatched
  by `chx-suggestion-list` (not by the individual `chx-suggestion` — see "Click handling" below).
  `chx-message-composer` listens on the `suggestions` slot itself.
- **`autoSubmit`**: list-level only (`<chx-suggestion-list auto-submit>`), applies to every child
  uniformly. No per-`chx-suggestion` override.
- **autoSubmit path**: insert then reuse the real send path — `setText(value)` into the textbox, then
  `form.requestSubmit()` (same mechanism `Editor`'s own Enter-to-send already uses), so the payload
  goes through the exact same `getValue()`/`getHTML()`/`chx-send-message` flow as if the user had
  typed and hit send. No direct-dispatch shortcut that bypasses the textbox.
- **Focus after non-autoSubmit fill**: yes — `focusEnd()`, cursor lands at the end of the inserted
  text, matching normal post-send behavior.
- **`value` vs label**: `value` is a required attribute on `chx-suggestion`, independent of its
  slotted content — the slot is display-only and can read differently from what gets inserted.
- **Loading state**: suggestions are always clickable — `loading` is not pushed to
  `chx-suggestion-list` and does not disable anything.
- **Chip**: `md-suggestion-chip` directly (MD3's actual "Suggestion chip", outlined by default —
  matches the screenshot with zero variant work). `chx-chip`/`chx-paste-chip`'s extra
  icon-slot-plus-wrapper layer is skipped — nothing here needs a leading icon.
- **Keyboard nav**: roving tabindex across the chip row (one Tab stop, Arrow/Home/End moves it),
  matching the precedent set by message-list's `FocusBehaviorController` — see "Focus reach-through"
  below for why this needs a one-shadow-level, single-owner reach into `md-suggestion-chip` rather
  than a shared controller.

## Public API

### `chx-suggestion` (new, `src/components/suggestion/suggestion.js`)

| Surface | Type | Default | Notes |
| --- | --- | --- | --- |
| `value` | string attribute | `""` | The text inserted into the composer. Independent of the slotted label. |
| default slot | — | — | The chip's visible label — arbitrary content (usually just text), passed through to `md-suggestion-chip`'s own default slot. |

Thin wrapper, no shadow DOM logic of its own beyond rendering `md-suggestion-chip` and two methods
`chx-suggestion-list` drives it with (see "Focus reach-through"): `focus()` (override) and
`setTabbable(isTabbable: boolean)`. No click listener of its own, no dispatched event — see "Click
handling".

### `chx-suggestion-list` (new, `src/components/suggestion-list/suggestion-list.js`)

| Surface | Type | Default | Notes |
| --- | --- | --- | --- |
| `alwaysVisible` | Boolean attribute (`always-visible`) | `false` | Render even when the active thread has messages. Read (not written) by `chx-message-composer` — see "Visibility ownership". |
| `autoSubmit` | Boolean attribute (`auto-submit`) | `false` | Applies to every child `chx-suggestion` uniformly. |
| default slot | — | — | `chx-suggestion` children, consumer-authored light DOM. |

Always renders its content — `chx-suggestion-list` has no empty-thread awareness of its own and never
gates its own template. Whether it's actually shown on screen is `chx-message-composer`'s decision
(native `hidden`), not this component's.

### `chx-message-composer` — new surface

| Surface | Type | Default | Notes |
| --- | --- | --- | --- |
| `suggestions` slot | — | — | New. Renders above `chx-textbox`, outside its bordered field. Consumer places `<chx-suggestion-list slot="suggestions">` directly. |
| `messagesEmpty` | Boolean property | `true` | New. Pushed down from `chx-chat.pushComposerProperties()`; used internally to compute `suggestionListElement.hidden`, not forwarded as a property. |

No new attribute-facing surface on `chx-chat` itself — same "composer is consumer-authored light DOM,
chx-chat only pushes config it already tracks" shape as everything else in `pushComposerProperties()`.
`messagesEmpty` is composer-internal wiring (how the emptiness signal gets from `chx-chat` down to the
composer) — it is **not** mirrored onto `chx-suggestion-list` as a property; see "Visibility
ownership" below for what the composer does with it instead.

## Visibility ownership

`chx-suggestion-list` doesn't decide whether it's shown — `chx-message-composer` does, by toggling the
slotted list's plain `hidden` IDL attribute (the standard one every `HTMLElement` already has, not a
custom property):

```js
pushSuggestionListProperties() {
  const list = this.suggestionListElement;
  if (!list) return;
  list.hidden = !list.alwaysVisible && !this.messagesEmpty;
}
```

This reads `alwaysVisible` off the list (a value the *consumer* set declaratively in markup) and
combines it with `messagesEmpty` (a value *`chx-chat`* pushed onto the composer) — the only place
either value is actually written is where it was declared; the composer just reads one and writes the
other's effect. `chx-suggestion-list` ends up with a single property, no visibility logic of its own,
and one clear owner (`chx-message-composer`) for the on/off decision — `hidden`'s UA-stylesheet
`[hidden] { display: none }` does the rest, no CSS of this package's own needed for it.

### Event: `chx-suggestion-select`

Dispatched by `chx-suggestion-list` (bubbles, composed, **not** cancelable — no veto use case like
`chx-send-message`'s draft-preserving cancel).

```ts
detail: { value: string, autoSubmit: boolean }
```

## Click handling — why the list dispatches, not the chip

`md-suggestion-chip` (`@symblight/wc-material`) renders a real `<button>` inside its own shadow root
(`base-chip.js`) and already fires a native `click` on activation (mouse, or Enter/Space once
focused — standard button semantics, no extra keydown handling needed for activation itself). A
native `click` is `composed: true` by default, so it retargets across both shadow boundaries
(`md-suggestion-chip` → `chx-suggestion` → light DOM) and arrives at `chx-suggestion-list` looking
like a plain bubbling click from its own slotted child.

`chx-suggestion-list`'s shadow template listens for it directly: `<slot @click=${this.#handleClick}>`.
`#handleClick` walks `event.composedPath()` for the nearest `chx-suggestion`, reads its `.value`,
updates the roving-tabindex active index to match (so a mouse click also moves the "last interacted"
chip), and dispatches `chx-suggestion-select` with `{value, autoSubmit: this.autoSubmit}`.

`chx-suggestion` itself needs **no click listener and no dispatched event of its own** — it's purely
declarative (value + label) and two imperative methods the list drives.

## Focus reach-through — the one shadow-level tradeoff

Roving tabindex means only one chip's button is a Tab stop at a time; the rest must be
`tabindex="-1"`. The actual focusable node is `md-suggestion-chip`'s internal `<button id="chip">`,
one shadow root below `chx-suggestion`'s own template — `chx-suggestion` is the one component in this
feature that owns and authored that exact one-level nesting, so it's the one allowed to reach into it
(`this.renderRoot.querySelector("md-suggestion-chip")?.shadowRoot?.querySelector("#chip")`). This is
the same category of fragile-but-contained reach CLAUDE.md already documents for
`::part()`/custom-property scoping (a rule/reach is scoped to what actually owns the tree it's
defined against) — kept to exactly one hop, inside the one file that's allowed to know
`md-suggestion-chip`'s internal `#chip` id, not spread into `chx-suggestion-list`.

`chx-suggestion` exposes two members for this, nothing else reaches across the boundary:

- `focus()` (overrides `HTMLElement.focus()`) — delegates straight to the inner button.
- `setTabbable(isTabbable)` — sets the inner button's `tabIndex` to `0`/`-1`.

`chx-suggestion-list` only ever calls these two methods and never queries into `chx-suggestion`'s
shadow root itself — from its perspective `chx-suggestion` is an opaque light-DOM child exposing a
normal method-based API, same as `chx-message-composer` drives `chx-textbox` via
`getValue()`/`focusEnd()`/etc.

### Roving tabindex mechanics

- `#activeIndex` (private field, default `0`), clamped whenever the light-DOM child list changes
  (`slotchange` on the default slot re-reads `this.querySelectorAll(":scope > chx-suggestion")`,
  clamps `#activeIndex` to the new length, calls `setTabbable` on all children accordingly).
- `keydown` on the host: `ArrowRight`/`ArrowDown` → next (clamped, no wraparound, matching
  `FocusBehaviorController`'s own clamped-not-wrapped choice); `ArrowLeft`/`ArrowUp` → previous;
  `Home`/`End` → first/last. Each move calls `setTabbable(false)` on the old active child,
  `setTabbable(true)` + `.focus()` on the new one, updates `#activeIndex`.
- A mouse click (see "Click handling" above) also updates `#activeIndex` to the clicked chip, so
  keyboard nav resumes from wherever the user last clicked.
- No id/index cache, no mount-polling, no `requestRerender` plumbing —
  `FocusBehaviorController`'s extra machinery exists specifically because `chx-infinity-scroll`
  virtualizes and re-mounts message elements out from under it. `chx-suggestion` children are plain,
  always-mounted light DOM (no virtualization), so a plain `querySelectorAll` + direct method calls
  is the whole mechanism — not extracted into a shared/reusable controller, kept inline in
  `chx-suggestion-list`.

## Implementation

### `src/components/suggestion/suggestion.js` — new, `chx-suggestion`

```js
static properties = { value: { type: String } };
render() {
  return html`<md-suggestion-chip><slot></slot></md-suggestion-chip>`;
}
get #buttonElement() {
  return this.renderRoot?.querySelector("md-suggestion-chip")?.shadowRoot?.querySelector("#chip") ?? null;
}
focus() { this.#buttonElement?.focus(); }
setTabbable(isTabbable) { const b = this.#buttonElement; if (b) b.tabIndex = isTabbable ? 0 : -1; }
```

`#buttonElement` re-queries live rather than caching — `md-suggestion-chip`'s own shadow root exists
by the time `chx-suggestion` first updates (child custom elements upgrade/render before a parent's
`firstUpdated` in practice for a static, binding-free template like this one), but re-querying avoids
depending on that ordering guarantee holding forever.

### `src/components/suggestion-list/suggestion-list.js` — new, `chx-suggestion-list`

- Properties: `alwaysVisible` (`{ type: Boolean, attribute: "always-visible" }`), `autoSubmit`
  (`{ type: Boolean, attribute: "auto-submit" }`). `alwaysVisible` is read externally by
  `chx-message-composer` (see "Visibility ownership") — this component never reads it itself.
- `render()`: unconditionally `<div class="suggestion-list" part="list" role="group"
  aria-label="Suggestions" @keydown=${this.#handleKeydown}><slot
  @slotchange=${this.#handleSlotchange} @click=${this.#handleClick}></slot></div>`.
- `#handleSlotchange`, `#handleKeydown`, `#handleClick` implement "Roving tabindex mechanics" and
  "Click handling" above.

### `src/components/suggestion-list/suggestion-list.css` — new

Flex row, wrap, gap — `display: flex; flex-wrap: wrap; gap: ...` on `.suggestion-list`, using a
`--chx-suggestion-list-gap`-style custom property for the gap, consistent with the
`--chx-message-*` theming-surface convention.

`:host([hidden]) { display: none; }` is required alongside the base `:host { display: block; }` —
confirmed live this is not optional. `:host` rules are author-origin (they run from inside this
element's own shadow root), so the plain `:host { display: block }` rule silently beats the UA
stylesheet's `[hidden] { display: none }` regardless of specificity once `chx-message-composer` sets
`.hidden = true`. Same underlying "an author rule always outranks the UA stylesheet" trap as the
`::slotted([slot="suggestions"])` rule in `message-composer.css` was written to avoid (see that file's
own comment) — missed here on the first pass because it's `:host`, not `::slotted`, but the cascade
reasoning is identical.

### `src/components/message-composer/message-composer.js`

- New property `messagesEmpty` (`{ type: Boolean }`, constructor default `true`).
- New getter `suggestionListElement` — `this.querySelector("chx-suggestion-list")`, light-DOM query,
  same status/reasoning comment as the existing `attachmentsElement` getter.
- New `pushSuggestionListProperties()` — see "Visibility ownership" above for the exact body
  (`list.hidden = !list.alwaysVisible && !this.messagesEmpty`). Called from `updated()` alongside
  nothing else needing to change, and from the new slot's `slotchange` (a composer-internal echo of
  exactly the dual-trigger reasoning already documented for `chx-chat.handleDefaultSlotchange`/
  `updated()` pushing onto the composer itself — needed here specifically because a consumer setting
  `always-visible` on the list *after* it's already slotted, or the list being (re)assigned after
  `messagesEmpty` was already pushed, both need to re-run this check).
- Template: add `<slot name="suggestions" @slotchange=${this.#handleSuggestionsSlotchange}
  @chx-suggestion-select=${this.#handleSuggestionSelect}></slot>` — placed before `<form>`, i.e.
  visually above the whole bordered field, not inside `chx-textbox`.
- `#handleSuggestionSelect(event)`:
  ```js
  const { value, autoSubmit } = event.detail;
  this.setText(value);
  if (autoSubmit) this.textboxElement?.closest("form")?.requestSubmit();
  else this.textboxElement?.focusEnd();
  ```
  (`setText` already exists and lands the value synchronously before `requestSubmit()` reads it via
  the form's `submit` → `#handleSend` → `textbox.getValue()` chain — no new plumbing needed there.)
- **Not** auto-imported/registered — `chx-suggestion-list`/`chx-suggestion` follow the
  `chx-attachments` precedent (consumer imports them, composer never `import`s the file), since the
  slot is opt-in and the list needs no default content.

### `src/components/message-composer/message-composer.css`

New rule positioning `::slotted([slot="suggestions"])` above the form (`order`, block-level, matches
the existing `::slotted(chx-message-list)`/`::slotted(chx-message-composer)` ordering approach already
used one level up in `chat.css`).

### `src/components/base/chat.js`

One line in `pushComposerProperties()`:

```js
composer.messagesEmpty = this.#internalMessages.length === 0;
```

No other change — `chx-chat` never imports or knows about `chx-suggestion-list` itself, exactly like
it doesn't know about `chx-attachments` or `chx-typing-indicator`.

## Edge cases / known limits

- `chx-suggestion` without a `value` attribute inserts `""` on click — not validated/warned, matches
  the library's general "trust the consumer" stance (e.g. `command`'s `templateId` isn't validated
  either).
- `alwaysVisible` + a non-empty thread: suggestions stay live and clickable indefinitely, not just at
  session start — accepted, matches "live, not latched."
- A bare `<chx-suggestion-list>` with no `chx-message-composer`/`chx-chat` ancestor (e.g. a Storybook
  story for the list in isolation) is never touched by `pushSuggestionListProperties()`, so its
  `hidden` attribute is whatever the consumer left it as (unset → visible) — the component is still
  independently demoable/testable, just via the standard attribute rather than a library-owned default.
- The `#buttonElement` reach-through breaks silently (button becomes unreachable, `focus()`/
  `setTabbable()` become no-ops) if `@symblight/wc-material` ever renames `md-suggestion-chip`'s
  internal `#chip` id or restructures `base-chip.js`'s template — no version pin/guard proposed here,
  same unguarded-dependency status quo as every other cross-shadow reach already in this codebase.
- Clicking a suggestion while `loading` is true (a reply is in flight) still fills/auto-submits —
  decided as "always clickable"; if that produces a second concurrent send, that's the same behavior
  a fast double-click on the real send button would already produce today (out of scope here).
- No `disabled` state on `chx-suggestion` — not requested, not built.

## Docs (implementation-time TODO, not covered by this spec)

- README: new rows under the composer's Layout/slots section for `suggestions`, plus a short
  `chx-suggestion-list`/`chx-suggestion` API blurb.
- `chat.stories.js`: a story slotting in 2-3 suggestions, one with `auto-submit`, to demo both paths.
- `CLAUDE.md`: a short paragraph in the "Composer input model" section once built, matching how
  paste-chip/paste-handlers each got one.
