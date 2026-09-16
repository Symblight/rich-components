import { html } from "lit";
import { ref } from "lit/directives/ref.js";

import "@symblight/wc-material/button";

import "../../index.js";
import "../typing-indicator/typing-indicator.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Conversations API",
  component: "chx-chat",
  tags: ["autodocs"],
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** @param {string} name @param {"system" | "user" | "assistant"} [role] @returns {import("../../types/conversation.js").ChxUser} */
function makeUser(name, role) {
  return { id: name, displayName: name, role };
}

/** @type {import("../../types/conversation.js").ChxConversation[]} */
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
  },
  {
    id: "c3",
    title: "Design review",
    participants: [makeUser("me", "user"), makeUser("Jordan", "user"), makeUser("Sam", "user")],
  },
];

/** @param {import("../../types/conversation.js").ChxUser[]} [participants] */
function formatParticipants(participants) {
  return participants?.map((p) => p.displayName ?? p.id).join(", ") ?? "";
}

// Deliberately different from CONVERSATIONS/CONVERSATIONS[0].id below — chx-chat is given both the
// controlled props (`.conversations`/`active-conversation-id`) AND their uncontrolled counterparts
// (`.initialConversations`/`initial-active-conversation-id`) at once, on purpose: since the
// controlled ones are provided, these two are ignored outright (see chx-chat's own doc on
// `initialConversations`/`initialActiveConversationId`) — if either of these decoy values ever won
// instead, it'd show up immediately (a conversation titled "Ignored" in the sidebar, or the wrong
// `<li>` highlighted on mount).
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
  return {
    id: `${conversationId}-msg-${index}`,
    conversationId,
    authorId: own ? "me" : "assistant",
    own,
    createdAt: Date.now() + index,
    status: /** @type {"sent"} */ ("sent"),
    parts: [
      {
        id: `${conversationId}-msg-${index}-t1`,
        type: "text",
        text: own ? `Me, #${index} in ${title}` : `Reply #${index} in ${title}.`,
      },
    ],
  };
}

/**
 * One adapter instance shared across every conversation — `input.conversationId` picks which
 * conversation's own history to page through. This is the shape this package's multi-conversation
 * support expects (checked against MUI X Chat's real `ChatAdapter`): a single, long-lived adapter,
 * `conversationId` threaded through each call, not a separate adapter per conversation. Each
 * conversation has its own independent `cursor`/`hasMore` — paged out to `HISTORY_SIZE` messages,
 * `PAGE_SIZE` at a time — tracked internally by `chx-chat`'s own `PaginationController`, not here.
 *
 * Also implements `subscribe` purely so this story can simulate an inbound realtime channel (see
 * `.claude/plans/messages/realtime-sync.md`) — `emit`/`emitRealtimeEvent` are test-only hooks this
 * demo calls from its own buttons/timers, mirroring MUI X Chat's own demo `emit(event)` pattern; a
 * real adapter would call the captured `onMessage`/`onEvent` itself from whatever socket/channel
 * handler it owns, never exposing methods like these. Kept as two separate hooks, not one combined
 * `emit`, because this package keeps `onMessage`/`onEvent` as two separate `subscribe` handlers
 * (Decision 1 in the spec doc) rather than MUI's single `onEvent` covering `message-added` too.
 */
function createConversationsAdapter() {
  /** @type {((message: import("../../types/message.js").ChxMessage) => void) | undefined} */
  let onMessage;
  /** @type {((event: import("../../types/realtime.js").ChxRealtimeEvent) => void) | undefined} */
  let onEvent;
  return {
    listMessages: async (
      /** @type {{conversationId?: string, cursor?: string}} */ { conversationId, cursor },
    ) => {
      await new Promise((resolve) => setTimeout(resolve, 400)); // simulated network latency
      const end = cursor ? Number(cursor) : HISTORY_SIZE;
      const start = Math.max(0, end - PAGE_SIZE);
      const messages = Array.from({ length: end - start }, (_, i) =>
        makeConversationMessage(/** @type {string} */ (conversationId), start + i),
      );
      return { messages, cursor: String(start), hasMore: start > 0 };
    },
    subscribe: (/** @type {{onMessage: typeof onMessage, onEvent: typeof onEvent}} */ handlers) => {
      onMessage = handlers.onMessage;
      onEvent = handlers.onEvent;
      return () => {
        onMessage = undefined;
        onEvent = undefined;
      };
    },
    /** Fake incoming message push — used by "Start flood chats" instead of calling `chatEl.addMessage()` directly. @param {import("../../types/message.js").ChxMessage} message */
    emit: (message) => onMessage?.(message),
    /** Fake incoming realtime event — used by the "Simulate…" buttons. @param {import("../../types/realtime.js").ChxRealtimeEvent} event */
    emitRealtimeEvent: (event) => onEvent?.(event),
  };
}

/**
 * A consumer-authored `<ul>`/`<li>` conversation picker — deliberately *not* a built-in
 * `chx-conversations` component (not built yet) — driving `chx-chat` purely through its public API:
 * `.conversations` (this story's own `CONVERSATIONS` array, `{id, title, participants}`, just stored
 * by `chx-chat`, never fetched or interpreted by it) and the `chx-active-conversation-change` event,
 * the same "action bubbles up, chx-chat listens on itself" shape `chx-send-message` already uses. No
 * direct property/method call onto `chx-chat` is needed to switch conversations — clicking an `<li>`
 * dispatches the event with `detail: {conversationId}`, `chx-chat` picks it up and reassigns its own
 * `activeConversationId`. The active `<li>` is highlighted with plain imperative DOM (no framework
 * re-render involved), same style this file's other click-delegated stories already use.
 *
 * `.initialConversations`/`initial-active-conversation-id` are also wired onto `chx-chat` below,
 * deliberately fed `DECOY_INITIAL_CONVERSATIONS`/`DECOY_INITIAL_ACTIVE_CONVERSATION_ID` instead of
 * the real data — since `.conversations`/`active-conversation-id` are provided on the very same
 * element, `chx-chat`'s own documented contract says the `initial*` pair must be ignored outright.
 * Kept in the template specifically to demonstrate that: if the decoy ever won, a conversation titled
 * "Ignored (initialConversations)" would appear in the sidebar, or the wrong `<li>` would highlight on
 * mount. Neither happens.
 *
 * Each conversation keeps its own cached message history and pagination cursor (see
 * `createConversationsAdapter` above) — switching away and back doesn't refetch or lose scroll
 * position (`chx-chat`'s `restoreScrollPosition`, default `true`): scroll up in one conversation to
 * load older history, switch to another, then switch back — the scroll position and already-loaded
 * pages are exactly as you left them.
 *
 * The header above the message list is likewise entirely story-owned — `chx-chat` has no header
 * concept or slot for one, so it's just a plain sibling `<div>` above it, kept in sync with the
 * active conversation the same imperative way the `<li>` highlight is: updated directly inside the
 * click handler, off the same `CONVERSATIONS` lookup, no reactive re-render involved.
 *
 * Each `<li>`'s preview line (last message + author) is synced off the real public
 * `chx-messages-change` event instead — `detail.messages` is always the *active* conversation's own
 * slice (see `chat.js`'s `#visibleMessages`), so the handler below reads `chatEl.activeConversationId`
 * to know which `<li>` to update, not the event itself. This also means a conversation's preview only
 * ever updates once you've actually visited it at least once — `chx-messages-change` only fires for
 * the conversation currently being displayed, there's no cross-conversation broadcast of it (a real
 * app wanting previews for *unvisited* conversations would need a separate summary fetch, e.g. via
 * `listConversations`, not this event) — a known, deliberate simplification for this demo. The click
 * handler additionally resyncs the just-selected `<li>`'s own preview straight from
 * `chatEl.messageListElement.messages` right after the switch — needed because *switching into* an
 * already-cached conversation isn't itself a mutation, so `chx-messages-change` correctly doesn't
 * fire for it; without this, a conversation flooded with messages while backgrounded (see "Start
 * flood chats" below) would show stale/empty previews even after you click into it and see the
 * messages are actually there.
 *
 * "Reset all chats" demonstrates the new `cache.clear()` primitive with no argument — every
 * conversation's cached messages and pagination state are dropped at once, then `refresh()` (defaults
 * to the active conversation) re-fetches just the one currently visible; the other two lazily refetch
 * the next time you switch to them, since `cache.clear()` also cleared their own `hasVisited` mark.
 *
 * "Start flood chats" fires a bounded burst of fake incoming messages at random conversations via
 * `adapter.emit({conversationId, ...})` — the story's own stand-in for a real backend pushing
 * through `adapter.subscribe`'s `onMessage`, the same handler `chx-chat` itself forwards straight
 * into `addMessage()` (see `chat.js`'s `#subscribeAdapter()`). A message for a conversation you're
 * not currently looking at lands silently in that conversation's cache (see `chat.js`'s
 * `#applyMessages`/background-delivery doc) without disturbing whatever's on screen. Switch to a
 * different conversation mid-flood to see this live: its messages keep accumulating in the
 * background exactly as if you'd never left.
 *
 * The three "Simulate…" buttons drive `adapter.subscribe`'s new `onEvent` handler (see
 * `.claude/plans/messages/realtime-sync.md`), via `createConversationsAdapter`'s own
 * `emitRealtimeEvent` test hook — not a real transport, just a stand-in for "the app's own socket
 * handler called `onEvent(...)`":
 * - "Simulate typing (this chat)" fires a `typing` event scoped to whichever conversation is
 *   currently active — `RealtimeSyncController` forwards it straight to the existing
 *   `chx-typing-indicator`, slotted into `chx-message-list` below, exactly as `setTyping()` would.
 * - "Simulate typing (background chat)" fires the same event for a *different* conversation and is
 *   the negative case: nothing visibly changes, since `chx-message-list` only ever renders the
 *   active conversation and `RealtimeSyncController` filters on `conversationId` before touching
 *   any state.
 * - "Simulate conversation removed" fires `conversation-removed` for the active conversation.
 *   `chx-chat` clears its own `activeConversationId` and dispatches `chx-active-conversation-change`
 *   outward (now bidirectional, see the same spec doc) — this story listens for that and clears the
 *   header/highlight the same way a real app would. The conversation deliberately **stays** in the
 *   sidebar `<ul>` afterwards: actually removing it from `conversations` is explicitly out of scope
 *   for what's implemented today (`<chx-conversations>` territory, not built yet) — only the
 *   `activeConversationId` reset is live.
 */
/** @type {Story} */
export const ConversationsList = {
  render: () => {
    /** @type {(import("../base/chat.js").ChxChat & {activeConversationId?: string}) | undefined} */
    let chatEl;
    /** @type {HTMLElement | undefined} */
    let headerTitleEl;
    /** @type {HTMLElement | undefined} */
    let headerSubtitleEl;
    /** @type {HTMLElement | undefined} */
    let listEl;
    /** @type {Map<string, HTMLElement>} */
    const previewEls = new Map();
    const adapter = createConversationsAdapter();

    // Only reacts to chx-chat clearing the active conversation itself (a realtime
    // conversation-removed event, see "Simulate conversation removed" below) — a click-originated
    // switch is already handled synchronously inside the <ul>'s own click handler further down.
    const handleActiveConversationChange = (
      /** @type {CustomEvent<{conversationId?: string}>} */ event,
    ) => {
      if (event.detail.conversationId !== undefined) return;
      for (const li of Array.from(listEl?.children ?? [])) {
        /** @type {HTMLElement} */ (li).style.background = "";
      }
      if (headerTitleEl) headerTitleEl.textContent = "No conversation selected";
      if (headerSubtitleEl) headerSubtitleEl.textContent = "";
    };

    const handleSimulateTyping = (/** @type {string | undefined} */ conversationId) => {
      if (!conversationId) return;
      adapter.emitRealtimeEvent({ type: "typing", conversationId, userId: "them", isTyping: true });
      setTimeout(
        () => adapter.emitRealtimeEvent({ type: "typing", conversationId, userId: "them", isTyping: false }),
        2500,
      );
    };

    const handleSimulateConversationRemoved = () => {
      if (!chatEl?.activeConversationId) return;
      adapter.emitRealtimeEvent({
        type: "conversation-removed",
        conversationId: chatEl.activeConversationId,
      });
    };
    /** @param {any} message */
    const formatPreview = (message) => {
      if (!message) return "No messages yet";
      const author = message.own ? "You" : (message.authorId ?? "Them");
      const text = message.parts?.find((/** @type {any} */ p) => p.text)?.text ?? "";
      return `${author}: ${text}`;
    };
    const handleMessagesChange = (/** @type {CustomEvent<{messages: any[]}>} */ event) => {
      const conversationId = chatEl?.activeConversationId;
      const previewEl = conversationId ? previewEls.get(conversationId) : undefined;
      if (!previewEl) return;
      const { messages } = event.detail;
      previewEl.textContent = formatPreview(messages[messages.length - 1]);
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
      chatEl.cache.clear(); // no argument — every conversation's cache, not just the active one
      chatEl.refresh(); // re-fetches just the currently-visible conversation
      for (const previewEl of previewEls.values()) previewEl.textContent = "No messages yet";
    };

    const handleStartFlood = () => {
      if (!chatEl || floodTimer) return; // already running — no-op
      let count = 0;
      floodTimer = setInterval(() => {
        count++;
        const conversation = CONVERSATIONS[Math.floor(Math.random() * CONVERSATIONS.length)];
        const own = Math.random() < 0.3;
        const id = `flood-${conversation.id}-${Date.now()}-${count}`;
        // Pushed through the simulated subscribe channel's `onMessage` (via `adapter.emit`), not
        // `chatEl.addMessage()` directly — `onMessage` already just calls `addMessage` internally
        // (see `chat.js`'s `#subscribeAdapter()`), so the observable effect is identical, but this
        // way the flood is a realistic stand-in for "the backend pushed these," same as the
        // "Simulate…" buttons above do for `onEvent`.
        adapter.emit({
          id,
          conversationId: conversation.id,
          authorId: own ? "me" : "assistant",
          own,
          createdAt: Date.now(),
          status: "sent",
          parts: [
            {
              id: `${id}-t1`,
              type: "text",
              text: `Flood message #${count} in ${conversation.title}`,
            },
          ],
        });
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
        <md-button
          variant="outlined"
          @click=${() => handleSimulateTyping(chatEl?.activeConversationId)}
        >
          Simulate typing (this chat)
        </md-button>
        <md-button
          variant="outlined"
          @click=${() =>
            handleSimulateTyping(CONVERSATIONS.find((c) => c.id !== chatEl?.activeConversationId)?.id)}
        >
          Simulate typing (background chat)
        </md-button>
        <md-button variant="outlined" @click=${handleSimulateConversationRemoved}>
          Simulate conversation removed
        </md-button>
      </div>
      <div style="display: flex; gap: 0; height: 500px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: 12px; overflow: hidden;">
        <ul
          style="list-style: none; margin: 0; padding: 0; width: 220px; border-right: 1px solid var(--md-sys-color-outline-variant); overflow-y: auto;"
          ${ref((el) => (listEl = /** @type {HTMLElement} */ (el)))}
          @click=${(/** @type {MouseEvent} */ event) => {
            const target = /** @type {HTMLElement} */ (event.target);
            const li = /** @type {HTMLElement | null} */ (target.closest("li[data-conversation-id]"));
            if (!li || !chatEl) return;
            for (const sibling of Array.from(li.parentElement?.children ?? [])) {
              /** @type {HTMLElement} */ (sibling).style.background = "";
            }
            li.style.background = "var(--md-sys-color-secondary-container)";
            const conversation = CONVERSATIONS.find((c) => c.id === li.dataset.conversationId);
            if (headerTitleEl) headerTitleEl.textContent = conversation?.title ?? "";
            if (headerSubtitleEl) {
              headerSubtitleEl.textContent = formatParticipants(conversation?.participants);
            }
            chatEl.dispatchEvent(
              new CustomEvent("chx-active-conversation-change", {
                detail: { conversationId: li.dataset.conversationId },
                bubbles: true,
                composed: true,
              }),
            );
            // resyncs this <li>'s own preview from whatever's now visible — chx-messages-change
            // doesn't fire just from switching into an already-cached conversation (see doc above),
            // so a conversation flooded while backgrounded wouldn't otherwise update its preview
            // until its *next* new message arrives while active
            const conversationId = li.dataset.conversationId;
            const previewEl = conversationId ? previewEls.get(conversationId) : undefined;
            chatEl.updateComplete.then(() => {
              if (!previewEl) return;
              const messages = chatEl?.messageListElement?.messages ?? [];
              previewEl.textContent = formatPreview(messages[messages.length - 1]);
            });
          }}
        >
          ${CONVERSATIONS.map(
            (conversation, index) => html`
              <li
                data-conversation-id=${conversation.id}
                style="padding: 0.75rem 1rem; cursor: pointer; border-bottom: 1px solid var(--md-sys-color-outline-variant); background: ${index === 0
                  ? "var(--md-sys-color-secondary-container)"
                  : "transparent"};"
              >
                <div style="font-weight: 600;">${conversation.title}</div>
                <div style="font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant);">
                  ${formatParticipants(conversation.participants)}
                </div>
                <div
                  style="font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0.125rem;"
                  ${ref((el) => {
                    if (el) previewEls.set(conversation.id, /** @type {HTMLElement} */ (el));
                  })}
                >
                  No messages yet
                </div>
              </li>
            `,
          )}
        </ul>
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
            .userId=${"me"}
            .conversations=${CONVERSATIONS}
            active-conversation-id=${CONVERSATIONS[0].id}
            initial-conversations=${JSON.stringify(DECOY_INITIAL_CONVERSATIONS)}
            initial-active-conversation-id=${DECOY_INITIAL_ACTIVE_CONVERSATION_ID}
            .adapter=${adapter}
            style="flex: 1; min-height: 0;"
            @chx-messages-change=${handleMessagesChange}
            @chx-active-conversation-change=${handleActiveConversationChange}
            ${ref((el) => (chatEl = /** @type {import("../base/chat.js").ChxChat} */ (el)))}
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
