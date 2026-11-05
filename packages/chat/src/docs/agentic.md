# Agentic parts — tool calls, thoughts, plans

Three standalone components render an agent turn's structured content: `chx-tool-call`,
`chx-thought`, `chx-plan`. Plus `chx-input-mode-banner`, the banner above the composer where a
permission request is answered, and `chx-tool-call-diff`, a thin composition over `chx-code-block`.

**This package renders, it does not speak ACP.** The connection (JSON-RPC to `claude`/`codex`,
`session/update` streaming, `session/request_permission` round-trips) is the app's. Design notes and
the open questions live in `.claude/plans/agentic-tools.spec.md`.

## Nothing is registered for you

None of these is imported by `chx-chat`/`chx-message-list`, and none is a built-in renderer for its
part type — same contract `chx-command-field`/`chx-typing-indicator` have. They live behind their own
entry point, `@symblight/chat/agent`, so a messenger that never imports it bundles none of this.

**The package ships the elements, not the renderers.** Importing the entry registers
`chx-thought`/`chx-plan`/`chx-tool-call`/`chx-tool-call-diff`/`chx-input-mode-banner`; turning a part
into one of them is your `partElements` renderer, and it is small enough that a ready-made one would
only get in the way of the first thing you want to change:

```js
import "@symblight/chat/agent"; // registers the elements

chat.partElements = {
  thought: (part, previous) => {
    const el = previous ?? document.createElement("chx-thought");
    el.text = part.text ?? "";
    el.streaming = part.state === "streaming";
    return el;
  },
  plan: (part, previous) => {
    const el = previous ?? document.createElement("chx-plan");
    el.entries = part.entries ?? [];
    return el;
  },
  tool_call: renderToolCall, // see agent.stories.js
};
```

So reuse the elements as they are, restyle them through their own `--chx-*` properties, or render
your own — a renderer returning `<my-tool-call>` is as valid as one returning `chx-tool-call`, and
nothing in this package needs to know which you picked.

**The one rule: reuse `previous`.** A fresh element per chunk looks like a brand-new, never-measured
row to the virtualized list, and the row re-measures on every flush.

`src/stories/agent.stories.js` (`AgenticComposerKit`) is a complete working wiring — all
four part renderers, the page-level CSS that strips the bubble down to a full-width document, and
the permission round-trip. Copy from it. `AgenticToolCalls` in the same file shows every element standalone, in each status
and kind.

**There is no whole-message hook.** `partElements` is the only rendering override; the
`<chx-message>` wrapper is always the library's, so every row reliably carries the part names and
roving-focus wiring. Restyling the wrapper is CSS — see "Styling messages" in
[`messages.md`](./messages.md).

## Stopping a turn

`chx-chat` derives the active conversation's turn state; nothing assigns it:

| `chat.delivery.getStatus()` | meaning                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `ready`                     | nothing in flight                                              |
| `submitted`                 | a send is out, its first chunk hasn't landed yet               |
| `streaming`                 | a reply is filling in                                          |
| `error`                     | the last delivery failed uncancelled; cleared by the next send |

`chat.delivery.isBusy()` is the same thing narrowed to `submitted || streaming` (in your own Lit
element, read `ChatController.status`/`.busy` instead — they re-render it), and it raises
`chx-message-composer`'s `loading` on its own — so `chx-textbox`'s action button turns into a stop
button for the whole turn with no wiring at all. That button is `type="button"` (it cannot submit the
form) and dispatches **`chx-stop`**, which `chx-chat` answers with `delivery.stop()`. To intercept, listen
lower and call `stopPropagation()`.

```js
chat.delivery.stop(); // abort every delivery for the active conversation
chat.delivery.cancel(messageId); // abort one, backgrounded conversations included
```

Slot `stop` on `chx-message-composer` replaces the icon inside that button (it falls back to a stop
glyph), and `send-label`/`stop-label` are its accessible names.

`chx-delivery-start` (`{messageId, conversationId}`) and `chx-delivery-end`
(`{messageId, conversationId, outcome}`, outcome `completed`/`cancelled`/`failed`) bracket every
delivery — `chx-delivery-start` is also the only place a send's generated `messageId` surfaces, which
is what `cancel()` needs.

`stop()` settles chx-chat's own turn state immediately — it does not wait for the stream to unwind,
because an adapter that never closes would otherwise strand the composer in its stop state forever.
**Ending the turn's messages is still the stream's job**: an adapter that returns from `start()` on
abort without closing leaves the reply's parts marked `streaming` for good, even though the button
already went back to send. Give every exit path one terminator:

```js
return new ReadableStream({
  async start(controller) {
    try {
      /* … stream the turn, bailing out on signal.aborted … */
    } finally {
      controller.enqueue({ kind: signal.aborted ? "abort" : "finish", messageId });
      controller.close();
    }
  },
});
```

**Aborting is one-sided.** The `AbortSignal` chx-chat passes to `sendMessage`/`regenerate` only stops
this client reading the stream. Nothing reaches the agent unless your adapter subscribes to that
signal and acts: send ACP's `session/cancel`, and answer any outstanding
`session/request_permission` (ACP requires an answer either way — `createBannerPermissionPrompt`
resolves `null` on abort for exactly this). Without that the agent keeps running with nobody
listening, while the UI already reads `cancelled`. Closing the stream with an explicit
`{kind: "abort"}` chunk is cleaner than letting the read throw.

## Composer for agent controls

The package doesn't ship model, mode or context controls. The app builds them (with ACP's
`configOptions`, `usage_update`, …) and slots them in. `chx-message-composer` provides the layout:

```html
<chx-message-composer
  slot="message-composer"
  layout="stacked"
  send-button="always"
  busy-action="stop"
>
  <md-icon-button slot="leading" aria-label="Attach">…</md-icon-button>
  <my-model-picker slot="leading"></my-model-picker>
  <my-mode-chip slot="actions"></my-mode-chip>
  <my-context-ring slot="actions"></my-context-ring>
  <div slot="footer">…Local ▾ · main ▾…</div>
</chx-message-composer>
```

| Attribute     | Values                        | Effect                                                                                                                                                                                                                                                                                                |
| ------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout`      | `auto` (default) \| `stacked` | `stacked`: text always on top, `leading` (start) and `actions` (end) always on a row below. `auto` stays on one row until the text wraps.                                                                                                                                                             |
| `send-button` | `auto` (default) \| `always`  | `always`: an empty draft shows the action button disabled instead of hiding it, so controls next to it don't move on the first keystroke. A draft with attachments only counts as non-empty.                                                                                                          |
| `busy-action` | `send` (default) \| `stop`    | `stop`: while `loading`, the button stays Stop even with text in the draft. Enter still fires the cancelable `chx-send-message`, so the app queues the message or calls `preventDefault()` to keep the draft.                                                                                         |
| `prompt-history` | boolean | Up on the first row and Down on the last recall this chat's sent prompts, newest first, then the draft. A prompt comes back from its `composerState`, then `composer.promptDoc(message)` (a document, for a replayed message; `null` for its text), then its text. Off by default, since an app may want Up for something else. |
| `disabled`    | boolean                       | Blocks sending and editing (e.g. no agent to send to): the draft goes read-only, Enter does nothing and the action button disables (hides under `send-button="auto"`). Stop still works mid-turn. Set by the app; `chx-chat` never touches it — its own empty state disables the composer separately. |

**`footer` slot.** Content slotted here goes under the field. Once the slot has content, the
composer draws a surface around field and footer:

| Token                                      | Default                                            |
| ------------------------------------------ | -------------------------------------------------- |
| `--chx-message-composer-background`        | `transparent`                                      |
| `--chx-message-composer-shape`             | `calc(var(--_chx-shape-corner-extra-large) / 1.4)` |
| `--chx-message-composer-footer-padding`    | `0.125rem 0.75rem`                                 |
| `--chx-message-composer-footer-min-height` | `40px`                                             |

With nothing slotted, nothing changes: no surface and no footer row.

**Field outline.** `chx-textbox` draws its outline as an inset `box-shadow`, so it causes no layout
shift. The focus ring appears only while the editor has focus, not while focus is on a control in
the controls row. While the editor is focused, the hover tint is off.

| Token                               | Default                                                      |
| ----------------------------------- | ------------------------------------------------------------ |
| `--chx-textbox-outline-color`       | `transparent`                                                |
| `--chx-textbox-outline-width`       | `1px`                                                        |
| `--chx-textbox-focus-outline-color` | `transparent`                                                |
| `--chx-textbox-focus-outline-width` | `2px`                                                        |
| `--chx-textbox-disabled-opacity`    | `0.38` (MD3)                                                 |
| `--chx-textbox-row-gap`             | `0.25rem` (`0` compact) — between the text and controls rows |

```css
chx-message-composer {
  --chx-message-composer-background: var(--md-sys-color-surface-container-high);
}
chx-message-composer::part(textbox) {
  --chx-textbox-background-color: var(--md-sys-color-surface-container-lowest);
  --chx-textbox-outline-color: var(--md-sys-color-outline-variant);
  --chx-textbox-focus-outline-color: var(--md-sys-color-primary);
}
```

**Parts.** On top of its own `surface`, `textbox` and `footer` parts, the composer re-exports the
parts of its inner `chx-textbox` with a `textbox-` prefix: `textbox-box`, `textbox-row`,
`textbox-content`, `textbox-leading`, `textbox-trailing`, `textbox-action` (the send/stop button),
`textbox-attachments`, `textbox-drop-hint`.

**Narrow composer.** The composer's `<form>` is an inline-size query container named
`chx-message-composer`. Slotted controls can condense with `@container (width < 28rem)` in their own
styles. Use an unnamed query: whether a named query matches a container from another shadow tree has
not been checked in WebKit.

## Row layout and density

`chx-thought`, `chx-plan` and `chx-tool-call` share one row shape (`agent-row.css`): no card, no
border — an icon, a verb, metadata, a chevron, and an MD3 state layer on hover. Expanded content
sits under a thin rule dropped from the icon's centre line, so a turn reads as one list rather than
three components. Only code blocks inside the body keep a fill.

Density is pure CSS inheritance. A compact `chx-message` sets the part density tokens
(`--chx-part-row-height`, `-icon-size`, `-gap`, `-padding-inline`: 28px rows, 16px icons), and they
inherit through its slot into every part; each component reads them with its default (36/20) as the
fallback. Text sizes don't change with density — they come from the chat type scale
(`--chx-chat-body-medium-font-size`, `-body-small-font-size`, `-code-font-size`), same as message
text. Outside a chat, the `compact` attribute on a part sets the same four tokens on itself. So `chx-chat compact`
reaches agent parts with no wiring. Retune compact from a page with
`chx-message-list::part(message-compact) { --chx-part-row-height: … }`; standalone, set the tokens
on any ancestor. `--chx-part-*` is not agent-specific — any element rendered as a part can read it.

Theming has two layers:

- **Component tokens** — each block declares its own on `:host`: `--chx-thought-*`, `--chx-plan-*`,
  `--chx-tool-call-*`, `--chx-tool-call-diff-*` (row height, font/icon size, gap, colors, plus
  block-specific ones like `--chx-plan-progress-color` or
  `--chx-tool-call-awaiting-permission-background-color`). Set them on the element itself to
  retune one block.
- **Global tokens** — every component token defaults to an inherited global, so setting one on
  `chx-chat` or any ancestor retunes all three: part elements sit several shadow roots deep, where
  no page-level selector reaches but inheritance does. Sizes come from `--chx-part-*` above; the
  row's look from `--chx-agent-border-radius`, `-color`, `-label-color`, `-rule-color`,
  `-state-layer-color`, `-focus-ring-color` (then the `--chx-chat-*` tier, see
  the README's "Chat tokens").

The shared row mix (`agent-row.css`) owns no tokens — each block maps its own onto the private
`--_chx-agent-row-*` bridges the mix reads.

## `chx-tool-call`

One row per `toolCallId`; `tool_call_update` deltas patch the same part in place.

| Property     | Type                   | Notes                                                                                                                                                                                                                        |
| ------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toolCallId` | `string`               | carried for your own correlation, never interpreted here                                                                                                                                                                     |
| `label`      | `string`               | ACP's `title`, rendered as the row's verb — named `label` so it doesn't collide with the native `title` tooltip attribute                                                                                                    |
| `kind`       | `string`               | `read \| edit \| delete \| move \| search \| execute \| think \| fetch \| switch_mode \| other`, drives the row icon; anything unknown renders as `other`                                                                    |
| `status`     | `string`               | `pending \| in_progress \| awaiting-permission \| completed \| failed \| rejected \| cancelled` — an unknown value falls back to `pending`'s look, collapsed                                                                 |
| `locations`  | `Array<{path, line?}>` | only the first is shown, as a `chx-chip` after the verb (the command picker's chip): the file name as its label, the full path and line as its value (`data-path`/`data-line`, tooltip); built by `buildLocation`, see below |
| `meta`       | `string`               | the result at a glance (`46 passed`); the `meta` slot overrides it                                                                                                                                                           |
| `additions`  | `number \| undefined`  | an edit's added lines, shown green as `+N` before `meta` (`--chx-tool-call-additions-color`)                                                                                                                                 |
| `deletions`  | `number \| undefined`  | an edit's removed lines, shown red as `−N` (`--chx-tool-call-deletions-color`)                                                                                                                                               |
| `error`      | `string`               | first thing in the expanded body, whenever non-empty                                                                                                                                                                         |
| `open`       | `boolean`              | disclosure state                                                                                                                                                                                                             |

`completed` shows no status icon — success needs no attention. `in_progress` colors the verb
`primary` with a spinner; `failed`/`rejected` color it `error`; `awaiting-permission` gives the row
the turn's only fill (`tertiary-container`, with every text/icon role on `on-tertiary-container`) and a `back_hand` icon. A click on the file chip fires
`chx-tool-call-location-click` (`{path, line}`) instead of toggling the row — open the file from it.

Fires `chx-tool-call-toggle` (`{open}`) on a disclosure change it didn't make itself — enough to
persist expansion across a reload or a conversation switch, which is the app's job either way.

The row is a `<details>` disclosure, expanded by default while `in_progress`/`failed`/`rejected`
and folded otherwise. With nothing in the body (no slotted content, no `error`) there's no chevron
and a click doesn't open it. A manual toggle latches: after the user
touches it, `status` never moves it again. The latch is set from the `click`, not the `toggle` —
`toggle` is a queued task, and a `tool_call_update` arriving in between would otherwise re-render
the row open over the user's collapse and swallow the latch entirely.

`error` is not gated on `status === "failed"`: a cancel, or a status ACP adds later, can carry
failure text too, and an error that is set but never rendered is a silent failure.

Content is the **default slot** — the component renders the header and status, and never interprets
ACP content blocks. Build the children in your renderer: a `chx-code-block` for
terminal output (set `lineNumbers = false` for `kind: "execute"` — a shell transcript has no lines
worth numbering), a `chx-tool-call-diff` for a diff, anything else you like.

### Customizing the location chip

`buildLocation(location)` builds the element shown after the verb for `locations[0]`. Override it, by
assigning or subclassing, the same way as `chx-command-picker.buildChip`. Whatever it returns gets
`part="file"`. A click on it never toggles the row and still fires `chx-tool-call-location-click`, so
an override can add its own listener or rely on the event:

```js
function renderToolCallPart(part, previous) {
  const el = previous ?? document.createElement("chx-tool-call");
  el.buildLocation = (location) => {
    const chip = document.createElement("chx-chip");
    chip.innerHTML = `<md-icon slot="icon">${iconForFile(location.path)}</md-icon>`;
    chip.append(location.path.split("/").pop());
    chip.addEventListener("click", () => openInEditor(location));
    return chip;
  };
  el.locations = part.locations ?? [];
  // …
}
```

It runs again only when `locations[0]`'s path or line changes, or when `buildLocation` itself is
replaced. A streamed update that re-sends the same location reuses the element and its listeners.

### Permission is not a state of the row

`chx-tool-call` renders **no** permission UI: no `options`, no `requestId`, no respond event. All
`status: "awaiting-permission"` does is accent the row, so the banner's question has a visible
subject.

The reason is the virtualized list. A row scrolled out of view is recycled out of the DOM, so its
buttons would be unreachable — not focusable, not in the accessibility tree — while the agent turn
sits blocked on them, and the user would see a stalled chat with no visible cause.
`chx-input-mode-banner` is docked above the composer, where nothing can recycle it away.

## `chx-input-mode-banner`

A generic banner for "here's what the next send will do" — a permission question, `replying to…`,
`plan mode`, `editing message`. It knows what none of those mean:

| Property       | Type      | Notes                                                                              |
| -------------- | --------- | ---------------------------------------------------------------------------------- |
| `label`        | `string`  | overridden by anything in the default slot                                         |
| `variant`      | `string`  | `default` \| `danger` — drives the container color and the icon's accent           |
| `dismissible`  | `boolean` | renders a close button that fires `chx-input-mode-banner-dismiss` and nothing else |
| `dismissLabel` | `string`  | that button's `aria-label`, default `Dismiss`                                      |

Slots: `icon`, the default slot (overrides `label`), and `actions`. The host carries `role="status"`.

`chx-chat` provides a bare `input-banner` slot, laid out between the list and the composer at the
composer's own width. It never gates, fills, or clears it — **the app does all of that**:

```html
<chx-chat>
  <chx-message-list slot="message-list"></chx-message-list>
  <chx-input-mode-banner slot="input-banner" hidden></chx-input-mode-banner>
  <chx-message-composer slot="message-composer"></chx-message-composer>
</chx-chat>
```

`createBannerPermissionPrompt` from `@symblight/chat/agent` is this round-trip ready-made — hand it a
getter for your banner and it resolves with the chosen option id, or `null` if the turn was cancelled
first:

```js
import { createBannerPermissionPrompt } from "@symblight/chat/agent";

const requestPermission = createBannerPermissionPrompt({ getBanner: () => banner });
const optionId = await requestPermission({ requestId, label, options }, signal);
if (optionId !== null) adapter.respondToPermission({ requestId, optionId });
```

`buildOption(option, request)` swaps the answer control for your own design system's button
(`OPTION_VARIANTS` is exported if you want the same kind→variant mapping); `optionSlot` and `variant`
cover the rest. Setting `.slot` and wiring the answer-once click stay with the factory, so a custom
button can't drop them:

```js
createBannerPermissionPrompt({
  getBanner: () => banner,
  buildOption: (option) =>
    Object.assign(document.createElement("my-button"), {
      textContent: option.label,
      tone: option.kind?.startsWith("allow") ? "primary" : "neutral",
    }),
});
```

Three things it does that a hand-rolled one has to do too:

- **Keep the banner mounted and toggle `hidden`.** It carries `role="status"`, and a live region
  already in the DOM announces a text change far more reliably than one inserted along with its own
  text.
- **Answer once.** Tear the whole action row down on the first click (`{once: true}`), or a
  double-click answers a request that accepts a single answer.
- **Correlate on `requestId`, not `toolCallId`.** `session/request_permission` is a JSON-RPC request
  with its own id, and one tool call can be the subject of several over its lifetime — the obvious
  case being the agent re-prompting after a `reject_once`.

## `chx-thought`

`text`, `streaming`, `label` (default `Thought`), `streamingLabel` (default `Thinking`), `duration`
(ms), `open`. A collapsed `<details>` row: `Thinking` with a shimmer while `streaming`,
then `Thought for 4s`. `duration` wins when set; without it the component times the streaming window
itself, which is right until a reload. Override `formatSettledLabel(durationMs)` to localize. A
settle folds it back unless the user has toggled it — the same click-set latch and
`chx-thought-toggle` event as `chx-tool-call`. The default slot overrides `text` if you want to render the thought
yourself.

## `chx-plan`

`entries` (`Array<{content, priority?, status?}>`), `label`, `open`. A row with an
`md-progress-linear` bar and a `done/total` count, expanded into its checklist while work is left
and folded into the row once every entry is `completed` — same latch, `chx-plan-toggle` event.
The running step is `primary` and medium weight; a done step is muted with a check, never struck
through. ACP re-sends the **whole plan** on every update and the merge replaces arrays
outright, so this works as long as the adapter keeps a stable `partId` for the plan across the turn.

## `chx-tool-call-diff`

`path` and `diff` — **ready-made unified-diff text**. ACP's diff block is `{path, oldText, newText}`
with no diff in it; computing one is the app's job, the same way parsing markdown is. Renders through
`chx-code-block` with `lang="diff"`, which gives added/removed lines a full-row background and keeps
the `+`/`−` sign beside it. The file path goes into `chx-code-block`'s `filename`, after the language
label; a terminal block instead replaces the language label with its command via `label`.

## Adapter contract

The delta merge is a blanket shallow-merge — everything but `text` replaces outright. That is not
self-documenting, so:

1. **Send whole arrays, never patches.** `locations` and a plan's `entries` replace outright. A
   partial update silently discards what came before.
2. **Use `text` for anything that appends.** It is the only append-capable field in the pipeline.
   Streaming terminal output rides in the tool call's own `text`; re-sending a `content` array in
   full each chunk is O(n²) in both payload and merge cost over a turn.
3. **Never send `id`/`type`/`state` in a delta** — they're stripped silently. A part's type is fixed
   at creation, so the first chunk for a `toolCallId` must already carry `partType: "tool_call"`.
4. **Hold a stable `partId` per logical object for the whole turn** — one per tool call
   (= `toolCallId`), one for the plan, one per contiguous text/thought run.
5. **Synthesize a `messageId` per agent turn, and keep a `toolCallId → messageId` map.** ACP has no
   message identity; a `tool_call_update` for an earlier turn otherwise creates a stray empty
   message shell. `toolCallId` becomes the `partId`, and part-element caching is keyed by part id
   across the whole list, so those ids must be session-unique (ACP's are).
6. **A tool-call part outlives the turn's `done`.** Carrying a `status` is what exempts a part from
   the finish/abort lock, so a trailing `tool_call_update` after a cancel still lands. Every ending
   (finish, failure, abort) settles anything still mid-flight as `cancelled`; a real later update
   overrides that. Work that keeps running after its turn (a subagent) sets `detached: true` on the
   part: a finish or a failure then leaves its status alone, an abort still settles it.
7. **Answer outstanding permission requests on cancel.** ACP requires it, and nothing in this
   package does it for you — `sendMessage`/`regenerate`'s `AbortSignal` aborts the stream only, and
   the banner is yours to clear.
8. **Multi-conversation apps: attribute every chunk** with `conversationId` for a message the chat
   hasn't seen yet, or a backgrounded conversation's chunks land against the active one.
