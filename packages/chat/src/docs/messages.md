# Messages

`chx-chat` owns an internal, optimistic message store — sending, streaming replies, retrying, and
scroll behavior all work out of the box. `<chx-message-list>` is where messages actually render;
`chx-chat` pushes its store down to whatever list is slotted in, the same way it pushes
`label`/`loading` to the composer.

## Quick start

```html
<chx-chat label="Write your prompt..." id="chat">
  <chx-message-list></chx-message-list>
  <chx-message-composer>
    <md-button slot="actions" variant="text">Send</md-button>
  </chx-message-composer>
</chx-chat>

<script>
  chatEl.userId = "me";
  chatEl.messages = [
    {
      id: "msg-0",
      authorId: "me",
      own: true,
      createdAt: Date.now(),
      status: "sent",
      parts: [{ id: "msg-0-t1", type: "text", text: "Hey, can you review this PR?" }],
    },
    {
      id: "msg-1",
      authorId: "assistant",
      own: false,
      createdAt: Date.now(),
      status: "sent",
      parts: [{ id: "msg-1-t1", type: "text", text: "Sure — link it and I'll take a look." }],
    },
  ];
</script>
```

Sending is already wired: the composer's `chx-send-message` (text + attachments + resolved
commands) is picked up by `chx-chat` automatically, appended to the internal store, and rendered —
no `chx-send-message` listener needed just to see your own message appear.

`messages` is a **controlled override**, not the only way messages get in — a local send, a
streamed reply, or an ingested `adapter.subscribe`/`addMessage` message all update the same
internal store directly. Reassign `messages` only when you want to replace the whole array
yourself (bulk load, external edit/delete) — always with a **new array reference**, the same
identity rule `commandFields` already has.

```js
chatEl.addEventListener("chx-messages-change", (event) => {
  persistToMyOwnStore(event.detail.messages); // optional — the UI already updated itself
});
```

## Streaming replies — `adapter.sendMessage`

For an AI-reply flavor, give `chx-chat` an `adapter`. `sendMessage` receives the just-sent
message and an `AbortSignal`, and may return a `ReadableStream` of chunks:

```js
chatEl.adapter = {
  sendMessage: async (message, { signal }) => {
    const response = await fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ prompt: message.parts[0].text }),
      signal,
    });
    return response.body.pipeThrough(myChunkTransformStream); // see the SSE example below for a
    //   real implementation of this transform
  },
};
```

Chunks patch one part of a message at a time, keyed by `messageId`/`partId` — an unseen
`messageId` creates the reply on the fly:

```js
{ messageId: "reply-1", authorId: "assistant", partId: "reply-1-t1", delta: { text: "Hel" } }
{ messageId: "reply-1", partId: "reply-1-t1", delta: { text: "lo!" } }
{ kind: "finish", messageId: "reply-1" } // required — moves status "sending" → "sent"
```

`{ kind: "abort" }` marks a reply `"cancelled"` instead; a stream that just closes without either
is treated as a disconnect (`status: "failed"` on the _original_ message, plus `chx-send-error`).
Chunks are batched (`chunkBatchIntervalMs`, default `16`) so a token-by-token stream doesn't
re-render on every single token.

```js
chatEl.retry(messageId); // re-send a message currently status: "failed"
chatEl.regenerate(replyIdOrItsAnchoringSendId); // redo an assistant reply (needs adapter.regenerate)
chatEl.cancel(messageId); // abort an in-flight send/regenerate
```

### SSE example

A real backend most often streams via Server-Sent Events. `EventSource` can't be used directly
here — it's GET-only, and sending the prompt needs a POST body — so `fetch` reads the response
body itself, framed as SSE (`data: ...` lines separated by a blank line), and maps each frame into
a `ChxMessageChunk`. This example assumes a server emitting `data: {"text":"..."}` per token and a
final `data: [DONE]`, but the framing/parsing below applies regardless of your own payload shape:

```js
chatEl.adapter = {
  sendMessage: async (message, { signal }) => {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: message.parts[0].text }),
      signal, // forwarded straight through — this is what makes cancel(messageId) actually abort
      //   the underlying HTTP request, not just chx-chat's own bookkeeping
    });
    if (!response.ok || !response.body) throw new Error(`Chat request failed: ${response.status}`);

    // fresh id every attempt — retrying a failed send must never reuse a previous reply's id
    const replyId = crypto.randomUUID();
    const partId = `${replyId}-t1`;
    const lines = response.body.pipeThrough(new TextDecoderStream());

    return new ReadableStream({
      async start(controller) {
        const reader = lines.getReader();
        let buffer = "";
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;

            // SSE frames are separated by a blank line; the last split part may be a partial
            // frame still waiting on more bytes, so it goes back into the buffer, not emitted yet
            const frames = buffer.split("\n\n");
            buffer = frames.pop() ?? "";

            for (const frame of frames) {
              const data = frame
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice("data:".length).trim())
                .join("\n");
              if (!data) continue; // a comment line (`:`) or a frame with no `data:` field

              if (data === "[DONE]") {
                controller.enqueue({ kind: "finish", messageId: replyId });
                continue;
              }
              const { text } = JSON.parse(data);
              controller.enqueue({
                messageId: replyId,
                authorId: "assistant",
                partId,
                delta: { text },
              });
            }
          }
        } finally {
          controller.close(); // reached on a clean end, an error, or the signal aborting mid-read —
          //   deliverStream() itself is what notices a missing "finish"/"abort" chunk and fails
          //   the send accordingly, nothing extra needed here
        }
      },
    });
  },
};
```

Cancellation needs no special handling in the adapter itself: aborting `signal` rejects the
in-flight `reader.read()`, the `try`/`finally` above still runs, and `chx-chat`'s own delivery
logic tells a genuine abort apart from a real failure via `signal.aborted` — see `cancel()` above.

## Live updates — `adapter.subscribe`/`getMessages`

For a messenger flavor (or just syncing history), set the other adapter hooks:

```js
chatEl.adapter = {
  getMessages: async () => ({ messages: await fetchHistory() }), // called once on connect
  subscribe: ({ onMessage, onChunk, onConnectionChange }) => {
    const socket = myOwnSocket();
    socket.on("message", onMessage);
    socket.on("chunk", onChunk); // same chunk shape as streaming, above
    socket.on("status", (s) => onConnectionChange(s)); // "connecting" | "connected" | "error"
    return () => socket.close(); // unsubscribe, called on disconnectedCallback
  },
};
```

`chatEl.connectionState` reflects the latest report; `chx-connection-change` fires on every
transition, if you'd rather listen than poll.

## Custom rendering — `messageElement` / `partElements`

Unset, every message renders as a plain `<chx-message>` and every part falls back to
`part.html ?? part.text`. Override either, per `part.type` or for the whole message — both are
always a function, `(data, previousElement?) => HTMLElement`, so a real custom element can reuse
`previousElement` instead of rebuilding on every update:

```js
chatEl.partElements = {
  reasoning: (part, previousElement) => {
    const el = previousElement ?? document.createElement("my-reasoning-block");
    el.part = part; // your own element reads whatever fields it needs off `part`
    return el;
  },
  "file-diff": (part) => {
    const el = document.createElement("my-diff-chip");
    el.part = part;
    return el;
  },
};
```

`chatEl.messageElement` replaces the whole `<chx-message>` wrapper the same way — set it and
`chx-chat` stops building per-part children itself, leaving that entirely to your function.

## Keyboard navigation & accessibility

`<chx-message-list>` is a single roving Tab stop: Arrow Up/Down and Home/End move between
messages (clamped, no wraparound), Enter drills into a message's interior controls, Escape
returns to the message. Every message gets `role="article"`, a coarse `aria-label`
(`"Your message"`/`"Message"`, until author metadata exists), and `aria-busy` while any of its
parts are still streaming. The list itself is a `role="log"`/`aria-live="polite"` region, with a
separate visually-hidden status announcement on a streaming start/complete edge — not per token.

## Long lists & scroll behavior

`<chx-message-list>` virtualizes automatically (`@tanstack/lit-virtual`) — only the visible
messages (plus a small overscan) are ever mounted, regardless of history length, and each
message's real rendered height is measured, not assumed uniform.

It also sticks to the bottom for you: a new message (local send, streamed chunk, or an ingested
one) auto-scrolls into view _only if you were already at the bottom_ — scroll up to read earlier
history and incoming messages won't yank you back down.

```js
messageListEl.scrollToBottom(); // e.g. a "jump to latest" button after scrolling up
messageListEl.addEventListener("chx-scroll-to-bottom", () => hideJumpToLatestButton());
```

## Reference

### `chx-chat` — properties

| Property               | Type                                                                   | Notes                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `userId`               | `string`                                                               | Identifies the local user — required for `own`/`adapter.subscribe`/`addMessage` to classify correctly. |
| `messages`             | `ChxMessage[]`                                                         | Optional controlled override — see Quick start. Default `[]`.                                          |
| `messageElement`       | `(message, previousElement?) => HTMLElement \| undefined`              | Whole-message render override — see Custom rendering.                                                  |
| `partElements`         | `Record<string, (part, previousElement?) => HTMLElement> \| undefined` | Per-`part.type` render overrides — see Custom rendering.                                               |
| `adapter`              | `ChxChatAdapter \| undefined`                                          | `{ getMessages?, subscribe?, sendMessage?, regenerate? }` — see Streaming/Live updates.                |
| `connectionState`      | `"connecting" \| "connected" \| "error" \| undefined`                  | Reflected attribute `connection-state`. Read-only in practice.                                         |
| `chunkBatchIntervalMs` | `number`                                                               | Default `16`. Read once at construction — set before first connecting the element.                     |

### `chx-chat` — methods

| Method                                                 | Signature                                                                      | Notes                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `addMessage`                                           | `(message: Omit<ChxMessage, "own" \| "createdAt"> & {own?, createdAt?}): void` | Ingests one message into the store, matched by `id`.                                                       |
| `retry`                                                | `(messageId: string): void`                                                    | Re-sends a `status: "failed"` message. No-op otherwise.                                                    |
| `regenerate`                                           | `(messageId: string): void`                                                    | Redoes an assistant reply (needs `adapter.regenerate`). Accepts the reply's id or its anchoring send's id. |
| `cancel`                                               | `(messageId: string): void`                                                    | Aborts an in-flight send/regenerate.                                                                       |
| `attachFile` / `setText` / `focus` / `insertAtCommand` | —                                                                              | Delegate to the composer — see the attachments/commands docs.                                              |

### `chx-chat` — events

| Event                   | `detail`                     | Notes                                                                                                                             |
| ----------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `chx-messages-change`   | `{ messages: ChxMessage[] }` | Fired after every local mutation (send, chunk, retry, ingest). Purely a notification — the UI already reflects `detail.messages`. |
| `chx-send-error`        | `{ messageId, error }`       | Fired alongside `chx-messages-change` when `adapter.sendMessage` throws.                                                          |
| `chx-connection-change` | `{ state, error? }`          | Fired on every `adapter.subscribe` connection-state transition.                                                                   |

### `chx-message-list` — properties

| Property                                       | Type     | Notes                                                                                            |
| ---------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `messages` / `messageElement` / `partElements` | —        | Normally pushed down from `chx-chat` — set directly only if using `chx-message-list` standalone. |
| `messagesLabel`                                | `string` | `aria-label` for the `role="log"` region. Default `"Messages"`.                                  |
| `dropHint`                                     | `string` | Attachment drag-over hint text. Default `"Release to attach"`.                                   |

### `chx-message-list` — methods & events

| Member                 | Signature          | Notes                                                                                        |
| ---------------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| `scrollToBottom`       | `(): void`         | Scrolls to the newest message. No-op on an empty list — see Scroll behavior above.           |
| `chx-scroll-to-bottom` | event, no `detail` | Fired every time `scrollToBottom()` runs — explicit call or automatic stick-to-bottom alike. |

### `ChxMessage` / `ChxMessagePart`

```ts
type ChxMessagePart = {
  id: string;
  type: "text" | "attachment" | string; // open — reasoning/tool-call/file-diff/whatever you register
  text?: string;
  html?: string; // preferred over `text` by the built-in fallback when present
  state?: "streaming" | "done"; // absent for parts that were never streamed
  [key: string]: unknown; // whatever your own registered renderer needs
};

type ChxMessage = {
  id: string; // client-generated (crypto.randomUUID()) — a backend must echo it back, not reassign it
  authorId?: string;
  own: boolean; // computed from authorId === userId unless explicitly supplied
  createdAt: number;
  status?: "sending" | "sent" | "failed" | "cancelled";
  error?: { message: string };
  replyToId?: string; // set on a reply created via a streamed chunk
  parts: ChxMessagePart[];
};
```

`<chx-message>` (the built-in per-message element) reflects `own` and `busy` (`aria-busy`). Styling
hooks are intentionally minimal: `chx-message[own]`/`chx-message:not([own])` for left/right
alignment, and `--chx-message-max-width` (default `480px`) — everything else about its look is up
to your own CSS.

## Not yet supported

- Author display metadata (name/avatar) — messages render with a generic `"Message"`/
  `"Your message"` label until this lands.
- Pagination merge behavior for a second `getMessages()` page (prepend vs. replace).
- A `retry`/error **UI** — `retry(messageId)` is the hook, no built-in affordance for it yet.
- `userId` changing mid-session retroactively recomputing already-rendered messages' `own`.
- `sequence`-based out-of-order chunk reordering (only duplicate-`eventId` dedup is handled).
