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

`src/components/stories/agent.stories.js` (`AgenticToolCalls`) is a complete working wiring — all
four part renderers, the page-level CSS that strips the bubble down to a full-width document, and
the permission round-trip. Copy from it.

**There is no whole-message hook.** `partElements` is the only rendering override; the
`<chx-message>` wrapper is always the library's, so every row reliably carries the part names and
roving-focus wiring. Restyling the wrapper is CSS — see "Styling messages" in
[`messages.md`](./messages.md).

## Stopping a turn

`chx-chat` derives the active conversation's turn state; nothing assigns it:

| `chat.status` | meaning                                                        |
| ------------- | -------------------------------------------------------------- |
| `ready`       | nothing in flight                                              |
| `submitted`   | a send is out, its first chunk hasn't landed yet               |
| `streaming`   | a reply is filling in                                          |
| `error`       | the last delivery failed uncancelled; cleared by the next send |

`chat.busy` is the same thing narrowed to `submitted || streaming`, and it raises
`chx-message-composer`'s `loading` on its own — so `chx-textbox`'s action button turns into a stop
button for the whole turn with no wiring at all. That button is `type="button"` (it cannot submit the
form) and dispatches **`chx-stop`**, which `chx-chat` answers with `stop()`. To intercept, listen
lower and call `stopPropagation()`.

```js
chat.stop(); // abort every delivery for the active conversation
chat.cancel(messageId); // abort one, backgrounded conversations included
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

## `chx-tool-call`

One card per `toolCallId`; `tool_call_update` deltas patch the same part in place.

| Property       | Type                   | Notes                                                                                                                                                        |
| -------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `toolCallId`   | `string`               | carried for your own correlation, never interpreted here                                                                                                     |
| `label`        | `string`               | ACP's `title` — named `label` so it doesn't collide with the native `title` tooltip attribute                                                                |
| `kind`         | `string`               | `read \| edit \| delete \| move \| search \| execute \| think \| fetch \| switch_mode \| other`, drives the header icon; anything unknown renders as `other` |
| `status`       | `string`               | `pending \| in_progress \| awaiting-permission \| completed \| failed \| cancelled` — an unknown value falls back to `pending`'s look, collapsed             |
| `locations`    | `Array<{path, line?}>` | chips inside the card                                                                                                                                        |
| `maxLocations` | `number`               | chips past this many collapse into one `+N more`; default `8`, `0` renders all                                                                               |
| `error`        | `string`               | shown whenever non-empty, outside the disclosure so a collapsed card still says why                                                                          |
| `open`         | `boolean`              | disclosure state                                                                                                                                             |

Fires `chx-tool-call-toggle` (`{open}`) on a disclosure change it didn't make itself — enough to
persist expansion across a reload or a conversation switch, which is the app's job either way.

The card is a `<details>` disclosure, expanded by default while `pending`/`in_progress`/
`awaiting-permission` and folded once the call settles. A manual toggle latches: after the user
touches it, `status` never moves it again. The latch is set from the `click`, not the `toggle` —
`toggle` is a queued task, and a `tool_call_update` arriving in between would otherwise re-render
the card open over the user's collapse and swallow the latch entirely.

`error` is not gated on `status === "failed"`: a cancel, or a status ACP adds later, can carry
failure text too, and an error that is set but never rendered is a silent failure.

Content is the **default slot** — the component renders the header and status, and never interprets
ACP content blocks. Build the children in your renderer: a `chx-code-block` for
terminal output, a `chx-tool-call-diff` for a diff, anything else you like.

### Permission is not a state of the card

`chx-tool-call` renders **no** permission UI: no `options`, no `requestId`, no respond event. All
`status: "awaiting-permission"` does is accent the card and keep it expanded, so the banner's
question has a visible subject.

The reason is the virtualized list. A card scrolled out of view is recycled out of the DOM, so its
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

`text`, `streaming`, `label` (default `Reasoning`), `streamingLabel` (default `Thinking…`), `open`.
A `<details>` disclosure, expanded while `streaming` so reasoning can be watched as it arrives,
folded once the part settles — with the same click-set manual-toggle latch, and the same
`chx-thought-toggle` event. The default slot overrides `text` if you want to render the thought
yourself.

## `chx-plan`

`entries` (`Array<{content, priority?, status?}>`) and `label`. Renders a checklist with a
completed/total count. ACP re-sends the **whole plan** on every update and the merge replaces arrays
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
   the finish/abort lock, so a trailing `tool_call_update` after a cancel still lands. An `abort`
   settles anything still mid-flight as `cancelled`; a real later update overrides that.
7. **Answer outstanding permission requests on cancel.** ACP requires it, and nothing in this
   package does it for you — `sendMessage`/`regenerate`'s `AbortSignal` aborts the stream only, and
   the banner is yours to clear.
8. **Multi-conversation apps: attribute every chunk** with `conversationId` for a message the chat
   hasn't seen yet, or a backgrounded conversation's chunks land against the active one.
