import { html } from "lit";
import { ref } from "lit/directives/ref.js";

import "@symblight/wc-material/button";

import "../index.js";
import "../components/typing-indicator/typing-indicator.js";

import { createPaginatedAdapter, createRealtimeStub } from "./shared/adapters.js";
import { makeMessage, makeUser } from "./shared/fixtures.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Conversations API",
  component: "chx-chat",
  tags: ["autodocs"],
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** @type {import("../types/conversation.js").ChxConversation[]} */
const CONVERSATIONS = [
  {
    id: "c1",
    title: "Product team",
    participants: [makeUser("me", "user"), makeUser("Alex", "user")],
  },
  {
    id: "c2",
    title: "Support bot",
    participants: [makeUser("me", "user"), makeUser("Assistant", "assistant")],
    unreadCount: 3,
    readState: "unread",
    lastMessagePreview: "Assistant: Happy to help with that.",
  },
  {
    id: "c3",
    title: "Design review",
    participants: [makeUser("me", "user"), makeUser("Jordan", "user"), makeUser("Sam", "user")],
    unreadCount: 1,
    readState: "unread",
    lastMessagePreview: "Jordan: Ship it 🚀",
  },
];

/** @param {import("../types/conversation.js").ChxUser[]} [participants] */
function formatParticipants(participants) {
  return participants?.map((p) => p.displayName ?? p.id).join(", ") ?? "";
}

// Deliberately different from CONVERSATIONS/CONVERSATIONS[0].id below — chx-chat is given both the
// controlled props (`.conversations`/`active-conversation-id`) AND their uncontrolled counterparts
// (`.initialConversations`/`initial-active-conversation-id`) at once, on purpose: since the
// controlled ones are provided, these two are ignored outright (see chx-chat's own doc on
// `initialConversations`/`initialActiveConversationId`) — if either of these decoy values ever won
// instead, it'd show up immediately (a conversation titled "Ignored" in the sidebar, or the wrong
// row highlighted on mount).
const DECOY_INITIAL_CONVERSATIONS = [{ id: "decoy", title: "Ignored (initialConversations)" }];
const DECOY_INITIAL_ACTIVE_CONVERSATION_ID = "decoy";

const HISTORY_SIZE = 60;
const PAGE_SIZE = 15;

/**
 * @param {string} conversationId
 * @param {number} index
 */
function makeConversationMessage(conversationId, index) {
  const own = index % 3 === 0;
  const title = CONVERSATIONS.find((c) => c.id === conversationId)?.title ?? conversationId;
  return makeMessage({
    id: `${conversationId}-msg-${index}`,
    conversationId,
    own,
    createdAt: Date.now() + index,
    // incoming (not-own) messages start unread, so the real read-tracking feature (chx-message-read,
    // gated on readState === "unread") actually fires as they scroll into view — see the story doc.
    readState: own ? undefined : "unread",
    text: own ? `Me, #${index} in ${title}` : `Reply #${index} in ${title}.`,
  });
}

/**
 * One adapter instance shared across every conversation — `input.conversationId` picks which
 * conversation's own history to page through: a single, long-lived adapter, `conversationId`
 * threaded through each call, not a separate adapter per conversation. Each conversation has its own
 * independent `cursor`/`hasMore` — paged out to `HISTORY_SIZE` messages, `PAGE_SIZE` at a time —
 * tracked internally by `chx-chat`'s own `PaginationController`, not here.
 *
 * `subscribe` is a realtime stub: the story's own buttons/timers call `emitMessage`/`emitEvent` to
 * stand in for a backend pushing through `onMessage`/`onEvent`.
 */
function createConversationsAdapter() {
  return {
    ...createPaginatedAdapter({
      total: HISTORY_SIZE,
      pageSize: PAGE_SIZE,
      delayMs: 400,
      makeMessage: (index, { conversationId }) =>
        makeConversationMessage(/** @type {string} */ (conversationId), index),
    }),
    ...createRealtimeStub(),
  };
}

/**
 * The built-in `<chx-conversations>`/`<chx-conversation-item>` sidebar, bound to `<chx-chat>` by
 * `for="conversations-demo-chat"` (matching the chat's own `id`) — the native `<label for>` idiom.
 * This replaces the hand-rolled `<ul>`/`<li>` picker earlier revisions of this story carried.
 *
 * **`chx-chat.conversations` is the single source of truth**; `<chx-conversations>` is a view synced
 * to it. Nothing here sets the sidebar's own `.conversations` — it reads the chat's. Selection is
 * pure `chx-active-conversation-change`: clicking a row makes `<chx-conversations>` dispatch it on the
 * chat (which reassigns its own `activeConversationId`) and move its own highlight optimistically —
 * no direct property poke. The header above the message list is still story-owned (`chx-chat` has no
 * header slot), kept in sync via a `@chx-active-conversation-change` listener on `<chx-chat>` that now
 * fires for **both** directions: a user click (dispatched on the chat by the sidebar) and a realtime
 * `conversation-removed` clearing the active conversation (dispatched by `chx-chat` itself).
 *
 * `.initialConversations`/`initial-active-conversation-id` are wired onto `chx-chat` with the decoy
 * values on purpose — since `.conversations`/`active-conversation-id` are provided on the same
 * element, the `initial*` pair must be ignored; if a decoy ever won, "Ignored (initialConversations)"
 * would appear in the sidebar or the wrong row would highlight on mount. Neither happens.
 *
 * There is no row-render override: `chx-conversations` always authors the `<chx-conversation-item>`
 * itself, so every row reliably carries its part names and keyboard-navigation wiring. The row draws
 * title + `lastMessagePreview` + an unread `md-badge`, and its avatar comes from the data —
 * `conversation.avatarUrl`, falling back to the first participant's (`makeUser` above supplies one).
 * Slotting your own `avatar` into the row still wins over that; restyling is `::part()` on
 * `chx-conversations` (`item`, `item-active`, `item-unread`, `item-typing`, and the row's interior
 * `item-avatar`/`item-title`/`item-preview`/`item-badge`).
 *
 * Each conversation keeps its own cached message history and pagination cursor (see
 * `createConversationsAdapter` above) — switching away and back doesn't refetch or lose scroll
 * position (`chx-chat`'s `restoreScrollPosition`, default `true`).
 *
 * Row previews are kept fresh by writing `lastMessagePreview` back onto `chx-chat.conversations`
 * (the source of truth): `chx-messages-change` (the active conversation's own slice) patches the
 * matching conversation and reassigns the array, which fires `chx-conversations-change` and re-renders
 * the sidebar. A conversation only updates once visited — `chx-messages-change` only fires for the
 * displayed conversation (a real app wanting previews for unvisited ones sets `lastMessagePreview`
 * from the backend, e.g. via a `conversation-updated` realtime event). Switching into an
 * already-cached conversation also resyncs its preview from the now-visible messages, since a plain
 * switch isn't itself a message mutation.
 *
 * **Unread badges are driven by the real read-tracking feature, not a standalone counter.** `chx-chat`
 * has `read-tracking` enabled and inbound (not-own) messages start `readState: "unread"`, so
 * `chx-message-list`'s `ReadTrackingController` fires `chx-message-read` (fire-once, watermark-covered)
 * as they scroll into view. This story listens for that and subtracts `detail.messageIds.length` from
 * the active conversation's `unreadCount` (writing it back onto `chx-chat.conversations`) — so opening a
 * conversation and reading it clears its badge. The reverse direction: a not-own flood message landing
 * in a *backgrounded* conversation bumps that conversation's badge by one. `chx-chat` itself never
 * touches `ChxConversation.unreadCount` (that stays app/`<chx-conversations>` territory) — this
 * wiring is the app closing that loop.
 *
 * "Reset all chats" clears every conversation's message cache (`store.clear()`, no argument) and
 * their previews, then `refresh()` re-fetches the visible one. "Start flood chats" pushes a bounded
 * burst of fake inbound messages via `adapter.emitMessage` (the story's stand-in for a backend calling
 * `subscribe`'s `onMessage`) at random conversations — a backgrounded conversation accumulates them
 * silently in its cache, its unread badge climbing as they arrive.
 *
 * The "Simulate…" buttons drive `adapter.subscribe`'s `onEvent` via `emitEvent`:
 * - "Simulate typing" — fires a `typing` event for the active conversation. Typing is now
 *   per-conversation in `chx-chat` (`TypingController` keyed by `conversationId`), so this single event
 *   lights up both indicators with no story glue: the chat one (`RealtimeSyncController` →
 *   `setTyping(isTyping, conversationId)` → `<chx-typing-indicator slot="typing">` in
 *   `chx-message-list` for the active conversation) and the sidebar row's own `typing` slot
 *   (`chx-chat` fires `chx-typing-change`, `chx-conversations` toggles the matching row's `typing`
 *   property and fills that slot with a `<chx-typing-indicator>` from its own template — the row
 *   itself has no fallback content, and nothing outside can reach the slot). Because it's per-conversation, switching away and back mid-typing keeps both in sync —
 *   and a `typing` event for a *background* conversation would light only its row, not the chat.
 * - "Simulate unread bump" — the *realtime* path to the same badge (vs. read-tracking above): a
 *   `conversation-updated` event raising a background conversation's `unreadCount` directly; `chx-chat`
 *   patches its own `conversations` and the sidebar badge updates live. Mimics a backend that tracks
 *   unread counts server-side rather than deriving them from local read events.
 * - "Simulate conversation removed" — a `conversation-removed` event for the active conversation;
 *   `chx-chat` both clears `activeConversationId` (→ header/highlight reset) **and** removes the row
 *   from `conversations` (now that `#applyConversations` exists), so the sidebar shrinks by one.
 */
/** @type {Story} */
export const ConversationsList = {
  render: () => {
    /** @type {(import("../components/base/chat.js").ChxChat & {activeConversationId?: string, conversations?: import("../types/conversation.js").ChxConversation[]}) | undefined} */
    let chatEl;
    /** @type {HTMLElement | undefined} */
    let headerTitleEl;
    /** @type {HTMLElement | undefined} */
    let headerSubtitleEl;
    const adapter = createConversationsAdapter();

    /** @param {string} conversationId @param {string} text */
    const setPreview = (conversationId, text) => {
      const list = chatEl?.conversations ?? [];
      if (!chatEl) return;
      chatEl.conversations = list.map((c) =>
        c.id === conversationId ? { ...c, lastMessagePreview: text } : c,
      );
    };

    // Sidebar unreadCount is derived from the real read-tracking feature, not tracked independently:
    // the `chx-message-read` event (fired by chx-message-list's ReadTrackingController as unread
    // messages scroll into view) drives it down, and inbound unread messages to a backgrounded
    // conversation drive it up. Written back onto chx-chat.conversations (the source of truth), which
    // re-renders the badge.
    /** @param {string} conversationId @param {number} delta */
    const adjustUnread = (conversationId, delta) => {
      if (!chatEl) return;
      chatEl.conversations = (chatEl.conversations ?? []).map((c) => {
        if (c.id !== conversationId) return c;
        const unreadCount = Math.max(0, (c.unreadCount ?? 0) + delta);
        return { ...c, unreadCount, readState: unreadCount > 0 ? "unread" : "read" };
      });
    };

    // The real feature's output: `detail.messageIds` is every message this event covered (the
    // watermark sweep), so subtract exactly that many from the active conversation's badge.
    const handleMessageRead = (
      /** @type {CustomEvent<{messageId: string, messageIds: string[]}>} */ event,
    ) => {
      const conversationId = chatEl?.activeConversationId;
      if (!conversationId) return;
      adjustUnread(conversationId, -(event.detail.messageIds?.length ?? 1));
    };

    /** @param {any} message */
    const formatPreview = (message) => {
      if (!message) return "No messages yet";
      const author = message.own ? "You" : (message.authorId ?? "Them");
      const text = message.parts?.find((/** @type {any} */ p) => p.text)?.text ?? "";
      return `${author}: ${text}`;
    };

    // Fires for both directions now: a user click (the sidebar dispatches it on the chat) and a
    // realtime conversation-removed clearing the active conversation (chx-chat dispatches it itself).
    const handleActiveConversationChange = (
      /** @type {CustomEvent<{conversationId?: string}>} */ event,
    ) => {
      const id = event.detail.conversationId;
      const conversation = chatEl?.conversations?.find((c) => c.id === id);
      if (headerTitleEl)
        headerTitleEl.textContent = conversation?.title ?? "No conversation selected";
      if (headerSubtitleEl)
        headerSubtitleEl.textContent = formatParticipants(conversation?.participants);
      if (!id) return;
      chatEl?.updateComplete.then(() => {
        // Resync this conversation's preview from whatever's now visible — switching into an
        // already-cached conversation isn't a message mutation, so chx-messages-change won't fire for it.
        const messages = chatEl?.store.getMessages() ?? [];
        if (messages.length) setPreview(id, formatPreview(messages[messages.length - 1]));
        // Typing needs no story reconciliation anymore — chx-chat's TypingController is per-conversation,
        // so switching back to a still-typing conversation restores its chat indicator on its own.
      });
    };

    const handleMessagesChange = (/** @type {CustomEvent<{messages: any[]}>} */ event) => {
      const conversationId = chatEl?.activeConversationId;
      if (!conversationId) return;
      const { messages } = event.detail;
      setPreview(conversationId, formatPreview(messages[messages.length - 1]));
    };

    // Per-conversation "typing" is not a built-in feature — RealtimeSyncController only forwards a
    // `typing` event to the global setTyping() (chx-message-list's typing slot, active conversation
    // Typing is now per-conversation in chx-chat, so the story just emits the realtime event: chx-chat
    // keys it by conversationId, shows the active conversation's in chx-message-list, and fires
    // chx-typing-change (which chx-conversations turns into the matching sidebar row's `typing` slot).
    const handleSimulateTyping = () => {
      const conversationId = chatEl?.activeConversationId;
      if (!conversationId) return;
      adapter.emitEvent({ type: "typing", conversationId, userId: "them", isTyping: true });
      setTimeout(
        () =>
          adapter.emitEvent({
            type: "typing",
            conversationId,
            userId: "them",
            isTyping: false,
          }),
        2500,
      );
    };

    const handleSimulateUnreadBump = () => {
      const background = chatEl?.conversations?.find((c) => c.id !== chatEl?.activeConversationId);
      if (!background) return;
      adapter.emitEvent({
        type: "conversation-updated",
        conversation: { id: background.id, unreadCount: (background.unreadCount ?? 0) + 1 },
      });
    };

    const handleSimulateConversationRemoved = () => {
      if (!chatEl?.activeConversationId) return;
      adapter.emitEvent({
        type: "conversation-removed",
        conversationId: chatEl.activeConversationId,
      });
    };

    /** @type {ReturnType<typeof setInterval> | undefined} */
    let floodTimer;
    const FLOOD_MESSAGE_COUNT = 24;
    const FLOOD_INTERVAL_MS = 350;

    const handleResetAll = () => {
      if (!chatEl) return;
      if (floodTimer) {
        clearInterval(floodTimer);
        floodTimer = undefined;
      }
      chatEl.store.clear(); // no argument — every conversation's cache, not just the active one
      chatEl.store.refresh(); // re-fetches just the currently-visible conversation
      chatEl.conversations = (chatEl.conversations ?? []).map((c) => ({
        ...c,
        lastMessagePreview: "No messages yet",
      }));
    };

    const handleStartFlood = () => {
      if (!chatEl || floodTimer) return; // already running — no-op
      let count = 0;
      floodTimer = setInterval(() => {
        count++;
        const conversation = CONVERSATIONS[Math.floor(Math.random() * CONVERSATIONS.length)];
        const own = Math.random() < 0.3;
        const id = `flood-${conversation.id}-${Date.now()}-${count}`;
        // Pushed through the simulated subscribe channel's `onMessage` (via `adapter.emitMessage`), not
        // `chatEl.store.add()` directly — `onMessage` already goes through the same path internally
        // (see `chat.js`'s `#subscribeAdapter()`), so the observable effect is identical, but this
        // way the flood is a realistic stand-in for "the backend pushed these," same as the
        // "Simulate…" buttons above do for `onEvent`.
        adapter.emitMessage(
          makeMessage({
            id,
            conversationId: conversation.id,
            own,
            readState: own ? undefined : "unread",
            text: `Flood message #${count} in ${conversation.title}`,
          }),
        );
        // A not-own message landing in a backgrounded conversation bumps its unread badge — the
        // active conversation's incoming messages are instead cleared by read-tracking as they show.
        if (!own && conversation.id !== chatEl?.activeConversationId) {
          adjustUnread(conversation.id, +1);
        }
        if (count >= FLOOD_MESSAGE_COUNT && floodTimer) {
          clearInterval(floodTimer);
          floodTimer = undefined;
        }
      }, FLOOD_INTERVAL_MS);
    };

    return html`
      <div style="display: flex; gap: 0.5rem; padding-bottom: 0.75rem; flex-wrap: wrap;">
        <md-button variant="outlined" @click=${handleResetAll}>Reset all chats</md-button>
        <md-button variant="outlined" @click=${handleStartFlood}>Start flood chats</md-button>
        <md-button variant="outlined" @click=${handleSimulateTyping}>Simulate typing</md-button>
        <md-button variant="outlined" @click=${handleSimulateUnreadBump}>
          Simulate unread bump
        </md-button>
        <md-button variant="outlined" @click=${handleSimulateConversationRemoved}>
          Simulate conversation removed
        </md-button>
      </div>
      <div
        style="display: flex; gap: 0; height: 100%; border: 1px solid var(--md-sys-color-outline-variant); border-radius: 12px; overflow: hidden;"
      >
        <chx-conversations
          for="conversations-demo-chat"
          aria-label="Conversations"
          style="width: 260px; border-right: 1px solid var(--md-sys-color-outline-variant);"
        ></chx-conversations>
        <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
          <div
            style="display: flex; flex-direction: column; gap: 0.125rem; padding: 0.75rem 1rem; border-bottom: 1px solid var(--md-sys-color-outline-variant);"
          >
            <span
              style="font-weight: 600;"
              ${ref((el) => (headerTitleEl = /** @type {HTMLElement} */ (el)))}
              >${CONVERSATIONS[0].title}</span
            >
            <span
              style="font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant);"
              ${ref((el) => (headerSubtitleEl = /** @type {HTMLElement} */ (el)))}
              >${formatParticipants(CONVERSATIONS[0].participants)}</span
            >
          </div>
          <chx-chat
            id="conversations-demo-chat"
            read-tracking
            .userId=${"me"}
            .conversations=${CONVERSATIONS}
            active-conversation-id=${CONVERSATIONS[0].id}
            initial-conversations=${JSON.stringify(DECOY_INITIAL_CONVERSATIONS)}
            initial-active-conversation-id=${DECOY_INITIAL_ACTIVE_CONVERSATION_ID}
            .adapter=${adapter}
            style="flex: 1; min-height: 0;"
            @chx-messages-change=${handleMessagesChange}
            @chx-message-read=${handleMessageRead}
            @chx-active-conversation-change=${handleActiveConversationChange}
            ${ref((el) => (chatEl = /** @type {import("../components/base/chat.js").ChxChat} */ (el)))}
          >
            <chx-message-list slot="message-list">
              <chx-typing-indicator value="Typing..." slot="typing"></chx-typing-indicator>
            </chx-message-list>
            <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
              <md-button slot="actions" variant="text">Opus 4.8</md-button>
            </chx-message-composer>
          </chx-chat>
        </div>
      </div>
    `;
  },
};
