# Conversations

`chx-chat` can hold more than one conversation's worth of messages at once — each cached
independently (messages, pagination cursor, scroll position) — and switch which one is on screen by
reassigning `activeConversationId`. There's no built-in conversation-list component yet; you bring
your own picker UI (a `<ul>`/`<li>`, a sidebar, whatever) and drive `chx-chat` through its public
API. Single-conversation apps are unaffected — none of this activates unless you set
`activeConversationId` (or its uncontrolled counterpart) at least once.

## Quick start

```html
<chx-chat id="chat">
  <chx-message-list slot="message-list"></chx-message-list>
  <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
    <md-button slot="actions" variant="text">Send</md-button>
  </chx-message-composer>
</chx-chat>

<ul id="conversation-list"></ul>

<script>
  chatEl.userId = "me";
  chatEl.adapter = {
    // conversationId is threaded through every adapter call — one shared adapter, not one per
    // conversation
    listMessages: ({ conversationId, cursor }) => fetchHistory(conversationId, cursor),
    sendMessage: (message, { signal }) => sendToBackend(message, signal), // message.conversationId
    //   already tells the backend which conversation this belongs to
  };
  chatEl.initialConversations = [
    { id: "c1", title: "Product team", participants: [{ id: "alex", displayName: "Alex" }] },
    {
      id: "c2",
      title: "Support bot",
      participants: [{ id: "assistant", displayName: "Assistant" }],
    },
  ];
  chatEl.initialActiveConversationId = "c1";

  conversationListEl.addEventListener("click", (event) => {
    const id = event.target.closest("li")?.dataset.conversationId;
    if (!id) return;
    chatEl.dispatchEvent(
      new CustomEvent("chx-active-conversation-change", {
        detail: { conversationId: id },
        bubbles: true,
        composed: true,
      }),
    );
  });
</script>
```

Clicking a conversation dispatches `chx-active-conversation-change` — `chx-chat` listens for it on
itself, the same "action bubbles up" shape `chx-send-message` already uses, so no direct reference
to `chatEl` is required from wherever the click actually happens.

## Uncontrolled vs. controlled

`initialConversations`/`initialActiveConversationId` (above) seed `chx-chat` **once**, at connect,
and are ignored from then on. Assign `conversations`/`activeConversationId` directly instead if your
app wants to keep owning that state (e.g. conversation metadata that changes over time — unread
counts, a renamed title):

```js
chatEl.conversations = myConversations; // controlled — chx-chat never mutates this array itself
chatEl.activeConversationId = "c2"; // controlled — chx-active-conversation-change still works
//   the same way, it just reassigns this property instead of an internal-only field
```

Providing the controlled prop makes its `initial*` counterpart inert outright, even if both are set
at once — there's no merge between them.

## Caching & background delivery

Each conversation keeps its own messages, pagination cursor/`hasMore`, and (if
`restoreScrollPosition` isn't disabled) scroll position — switching away and back doesn't refetch or
lose your place. A conversation you're not currently looking at keeps working normally in the
background: a reply still streaming in when you switch away keeps streaming, a `subscribe`d message
for a different conversation lands in its cache silently. None of this needs your adapter to know or
care which conversation is currently visible.

```js
chatEl.store.refresh(); // re-fetch the active conversation from scratch
chatEl.store.refresh("c2"); // ...or a specific one, active or not
chatEl.store.clear(); // drop every conversation's cache, no re-fetch
chatEl.store.clear("c2"); // ...or just one
```

`store.refresh(id)` is `store.clear(id)` followed by re-invoking `adapter.listMessages` for `id` — the
general "reset chat state" hook, including for a single-conversation app that never sets
`activeConversationId` at all.

## Not yet supported

- A built-in conversation-list component (`chx-conversations`/`chx-conversation-item`) — bring your
  own, as in Quick start above.
- A conversation's preview (last message/unread count) updating for one you haven't visited yet —
  `chx-messages-change` only fires for the conversation currently on screen, there's no
  cross-conversation broadcast of it. A `listConversations`-style summary fetch would need to be
  layered on separately.
- Pluggable cache storage (persisting to `localStorage`/a server instead of in-memory).

## Reference

### `chx-chat` — properties

| Property                      | Type                             | Notes                                                                                       |
| ----------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------- |
| `activeConversationId`        | `string \| undefined`            | Reflected attribute `active-conversation-id`. Controlled — see Uncontrolled vs. controlled. |
| `initialActiveConversationId` | `string \| undefined`            | Attribute `initial-active-conversation-id`. Uncontrolled seed, consulted once.              |
| `conversations`               | `ChxConversation[] \| undefined` | Picker metadata — stored only, never fetched or interpreted by `chx-chat`.                  |
| `initialConversations`        | `ChxConversation[] \| undefined` | Attribute `initial-conversations` (JSON-encoded). Uncontrolled seed, consulted once.        |
| `restoreScrollPosition`       | `boolean`                        | Attribute `restore-scroll-position`. Default `true`.                                        |

### `chx-chat` — methods

Under the `store` namespace — see [Public API](./public-api.md).

| Method          | Signature                         | Notes                                                               |
| --------------- | --------------------------------- | ------------------------------------------------------------------- |
| `store.refresh` | `(conversationId?: string): void` | Clears and re-fetches one conversation. Defaults to the active one. |
| `store.clear`   | `(conversationId?: string): void` | Clears without re-fetching. No argument clears every conversation.  |

### `chx-chat` — events

| Event                            | `detail`                     | Notes                                                                                  |
| -------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------- |
| `chx-active-conversation-change` | `{ conversationId: string }` | Listened for on `chx-chat` itself — dispatch it from anywhere to switch conversations. |

### `ChxConversation` / `ChxUser`

```ts
type ChxRole = "system" | "user" | "assistant";

type ChxUser = {
  id: string;
  displayName?: string;
  avatarUrl?: string;
  isOnline?: boolean;
  role?: ChxRole;
  metadata?: Record<string, unknown>;
};

type ChxConversation = {
  id: string;
  title?: string;
  subtitle?: string;
  avatarUrl?: string; // takes precedence over participant avatars in a conversation list
  participants?: ChxUser[];
  unreadCount?: number;
  readState?: "read" | "unread";
  lastMessageAt?: string; // ISO 8601
  metadata?: Record<string, unknown>;
};
```

See [`conversations.stories.js`](../components/stories/conversations.stories.js) for a complete,
working `<ul>`/`<li>` picker — including per-conversation previews synced off `chx-messages-change`
and reset/flood test buttons exercising the `store` namespace directly.
