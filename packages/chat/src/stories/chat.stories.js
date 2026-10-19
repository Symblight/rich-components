import { html } from "lit";

import { keyed } from "lit/directives/keyed.js";
import { ref } from "lit/directives/ref.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import plus from "@material-design-icons/svg/outlined/add.svg?raw";
import computerIcon from "@material-design-icons/svg/outlined/computer.svg?raw";
import branchIcon from "@material-design-icons/svg/outlined/fork_right.svg?raw";
import "@symblight/wc-material/button";
import "@symblight/wc-material/icon";
import "@symblight/wc-material/icon-button";
import "@symblight/wc-material/avatar";
import "@symblight/wc-material/skeleton";
import "@symblight/wc-material/menu";

import "../index.js";
import "../components/typing-indicator/typing-indicator.js";
import "../components/streaming-indicator/streaming-indicator.js";
import "../components/scroll-to-bottom-affordance/scroll-to-bottom-affordance.js";
import "../components/loading-history/loading-history.js";
import "../components/unread-marker/unread-marker.js";
import "../components/divider/divider.js";
import "../components/chip/chip.js";
import { longTextPastePartRule } from "../components/paste-long-text/paste-long-text.js";
import "../components/attachments/attachments.js";
import "../components/attachment/attachment.js";
import { createSplitOnSendHandler } from "../utils/split-message-parts.js";
import {
  createPaginatedAdapter,
  createRealtimeStub,
  createReplyAdapter,
} from "./shared/adapters.js";
import { createBuiltInSentCards } from "./shared/attachments.js";
import { ASSISTANT, ME, makeMessage, makeMessages, textPart } from "./shared/fixtures.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Chat",
  component: "chx-chat",
  tags: ["autodocs"],
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */
/** @type {Story} */
export const Basic = {
  render: () => html`
    <chx-chat>
      <chx-message-list slot="message-list"></chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <div slot="leading">
          <md-icon-button variant="tonal" selected> ${unsafeSVG(plus)} </md-icon-button>
        </div>
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
      </chx-message-composer>
    </chx-chat>
  `,
};

/**
 * The empty state — a conversation-driven chat with no active conversation (the active one was
 * removed, or none is selected yet). Forced here by marking the chat conversation-driven
 * (`.conversationsPresent=${true}`) while leaving `activeConversationId` unset — the same condition
 * `chx-chat` derives after a realtime `conversation-removed` clears the active conversation, or after
 * every conversation is removed.
 *
 * Two things happen automatically: `chx-message-list` renders its `empty` slot (default text
 * "No conversation selected"), and the composer's send is disabled with the editor made read-only
 * (no active conversation to send into). Override the placeholder by slotting your own content into
 * `slot="empty"` on `<chx-message-list>` — shown commented-out below.
 */
/** @type {Story} */
export const EmptyState = {
  render: () => html`
    <div
      style="height: 100%; display: flex; border: 1px solid var(--md-sys-color-outline-variant); border-radius: 12px; overflow: hidden;"
    >
      <chx-chat .conversationsPresent=${true} style="flex: 1; min-height: 0;">
        <chx-message-list slot="message-list">
          <!-- Uncomment to override the default "No conversation selected":
          <div slot="empty">Выберите беседу, чтобы начать</div>
          -->
        </chx-message-list>
        <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
          <div slot="leading">
            <md-icon-button variant="tonal" selected> ${unsafeSVG(plus)} </md-icon-button>
          </div>
          <md-button slot="actions" variant="text">Opus 4.8</md-button>
        </chx-message-composer>
      </chx-chat>
    </div>
  `,
};

/**
 * The whole reply lands in one chunk after 1.8s, long enough to see `chx-message-list`'s
 * `streaming` go true the instant a send starts and false once the reply arrives.
 */
function createSlowReplyAdapter() {
  return createReplyAdapter({ delayMs: 1800 });
}

/**
 * Default message styles — own messages align right, the assistant's align left. Controls:
 *
 * - "Toggle compact" button — `chx-chat`'s flat density (pushed through `chx-message-list` onto every
 *   row): no bubbles, everything left-aligned, hover tint.
 * - `selectedId` — `chx-message-list`'s persistent highlight (jump-to / permalink), `aria-current`.
 * - Send a message: it shows the `status` slot's default "Sending…" until the fake adapter accepts
 *   it (~1.8s, `createSlowReplyAdapter`), while the slotted `<chx-streaming-indicator>` covers the
 *   wait for the reply.
 */
/** @type {Story} */
export const Messages = {
  args: { selectedId: "msg-5" },
  argTypes: {
    selectedId: {
      control: "select",
      options: ["", ...makeMessages(20).map((message) => message.id)],
    },
  },
  render: (args) => {
    /** @type {import("../components/base/chat.js").ChxChat | undefined} */
    let chatEl;
    return html`
      <div style="height: 100%; display: flex; flex-direction: column; gap: 0.5rem;">
        <md-button
          variant="outlined"
          style="align-self: flex-start;"
          @click=${() => {
            if (chatEl) chatEl.compact = !chatEl.compact;
          }}
        >
          Toggle compact
        </md-button>
        <chx-chat
          .userId=${"me"}
          .messages=${makeMessages(20)}
          .adapter=${createSlowReplyAdapter()}
          style="flex: 1; min-height: 0;"
          ${ref((el) => (chatEl = /** @type {import("../components/base/chat.js").ChxChat} */ (el)))}
        >
          <chx-message-list
            slot="message-list"
            scroll-behavior="smooth"
            .selectedId=${args.selectedId || undefined}
          >
            <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
          </chx-message-list>
          <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
            <md-button slot="actions" variant="text">Opus 4.8</md-button>
          </chx-message-composer>
        </chx-chat>
      </div>
    `;
  },
};

/**
 * Demonstrates `chx-message-list`'s `typing` slot. Typing has no automatic signal of its own (it
 * represents a real human on the other end, or an app-level "the other side is composing" concept,
 * not something `chx-chat` can derive from its own state) — this story drives it manually via the
 * button below, independent of sending a message at all.
 * `<chx-typing-indicator slot="typing">` has to be slotted in explicitly — same connection as
 * `<chx-command-picker>`'s own (a plain, standalone element this story imports and places itself);
 * nothing renders here without it, `setTyping()` alone is not enough.
 */
/** @type {Story} */
export const Typing = {
  render: () => {
    /** @type {import("../components/base/chat.js").ChxChat | undefined} */
    let chatEl;
    return html`
      <div
        class="typing-story"
        style="height: 100%; display: flex; flex-direction: column; gap: 0.5rem;"
        @click=${(/** @type {MouseEvent} */ event) => {
          if (!(/** @type {HTMLElement} */ (event.target).closest(".typing-story__toggle-typing")))
            return;
          if (!chatEl) return;
          chatEl.presence.setTyping(!chatEl.presence.isTyping());
        }}
      >
        <md-button
          class="typing-story__toggle-typing"
          variant="outlined"
          style="align-self: flex-start;"
        >
          Toggle "the other side is typing"
        </md-button>
        <chx-chat
          .userId=${"me"}
          .messages=${makeMessages(6)}
          style="flex: 1; min-height: 0;"
          ${ref((el) => (chatEl = /** @type {import("../components/base/chat.js").ChxChat} */ (el)))}
        >
          <chx-message-list slot="message-list">
            <chx-typing-indicator value="Alice is typing..." slot="typing"></chx-typing-indicator>
          </chx-message-list>
          <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
            <md-button slot="actions" variant="text">Opus 4.8</md-button>
          </chx-message-composer>
        </chx-chat>
      </div>
    `;
  },
};

/**
 * Demonstrates `chx-message-list`'s `streaming` slot. Unlike `Typing` above, becoming *eligible* to
 * show is fully automatic: `chx-chat` derives `streaming` from its own in-flight-delivery state (a
 * send is in progress, no reply message exists yet). What actually renders is not automatic though
 * — `<chx-streaming-indicator slot="streaming">` still has to be slotted in explicitly below, same
 * "no default content" posture `typing` has; without it, sending a message would flip `streaming`
 * true/false with nothing visible either way. Send a message and watch the dots-filled bubble
 * (styled like an incoming not-own message) appear, then disappear once the reply lands.
 */
/** @type {Story} */
export const Streaming = {
  render: () => html`
    <chx-chat .userId=${"me"} .messages=${makeMessages(6)} .adapter=${createSlowReplyAdapter()}>
      <chx-message-list slot="message-list">
        <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
      </chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
      </chx-message-composer>
    </chx-chat>
  `,
};

/**
 * `readState`-driven read tracking. `read-tracking` is an opt-in master switch (default `false`) —
 * set here on `<chx-chat>`, pushed straight through to
 * `chx-message-list.readTracking`; without it, no message is ever `observe()`d and `chx-message-read`
 * never fires at all. Every non-own message starts `readState: "unread"` (`makeUnreadMessages` below)
 * — `chx-message`'s `unread-marker` slot has `<chx-unread-marker>` as its own native fallback
 * content, so the dot appears with zero wiring here (slot your own in to replace it). Scroll up
 * through the older messages below `chx-chat`'s default
 * bottom-anchored view: each unread one fires `chx-message-read` the instant it crosses
 * `read-threshold` (`0` here, the default — any pixel visible counts) *and covers every other
 * still-unread message positioned before it* (Decision 10's coverage sweep — reading the newest message
 * after a reset below marks the whole backlog read in one event, not one event per message), which
 * (a) `chx-chat` turns into an `adapter.markRead` call, logged to the console below, and (b) this
 * story's own listener uses to close the loop itself — the recommended, durable path per that doc's
 * "Closing the loop" — by re-assigning `chx-chat.messages` with every covered id's `readState` flipped
 * to `"read"`, which drops their dots on the very next render. The "Reset unread messages" button
 * regenerates the whole set with fresh ids so the demo can be replayed — reusing the same ids wouldn't
 * re-fire anything, since `ReadTrackingController`'s fire-once `Set` never resets on a `messages`
 * reassignment (by design, see Decision 3/10 — it relies on global id uniqueness).
 *
 * "Simulate incoming read event" demonstrates the *other* direction — an inbound `ChxReadEvent`
 * (`{type: "read", conversationId, messageId}`, `src/types/realtime.js`) toggling one message's
 * `readState` via `RealtimeSyncController`, independent of the scroll-driven mechanism above. The mock
 * `adapter.subscribe()` here just captures the `onEvent` callback `chx-chat` already passes to any real
 * adapter's own `subscribe()` — the button calls it directly, standing in for a server push. Unlike the
 * coverage sweep, this toggles exactly one message (the first still-unread one), not a range.
 */
/** @type {Story} */
export const ReadTracking = {
  render: () => {
    // bumped on every "Reset unread messages" click so regenerated messages get fresh ids —
    // ReadTrackingController's fire-once Set never resets on a `messages` reassignment (Decision
    // 3/10, relies on global id uniqueness), so reusing the same ids would never re-fire anything.
    let generation = 0;

    /** @param {number} count */
    const makeUnreadMessages = (count) =>
      makeMessages(count, {
        prefix: `read-msg-${generation}`,
        isOwn: (i) => i % 3 === 0,
        text: (i, own) =>
          own ? `My message #${i}` : `Unread reply #${i} — scroll past me to mark me read.`,
      }).map((message) =>
        message.own ? message : { ...message, readState: /** @type {const} */ ("unread") },
      );

    /** @type {import("../components/base/chat.js").ChxChat | undefined} */
    let chatEl;
    // Stands in for a server pushing a ChxReadEvent through the adapter's own subscribe().
    const realtime = createRealtimeStub();

    return html`
      <div
        class="read-tracking-story"
        style="height: 100%; display: flex; flex-direction: column; gap: 0.5rem;"
        @click=${(/** @type {MouseEvent} */ event) => {
          const target = /** @type {HTMLElement} */ (event.target);
          if (target.closest(".read-tracking-story__reset")) {
            if (!chatEl) return;
            generation++;
            chatEl.messages = makeUnreadMessages(24);
            return;
          }
          if (target.closest(".read-tracking-story__simulate-read-event")) {
            if (!chatEl) return;
            // Toggles the first still-unread message — same messageId shape a real ChxReadEvent
            // carries, per src/types/realtime.js.
            const message = chatEl.messages.find((m) => m.readState === "unread");
            if (!message) return;
            realtime.emitEvent({
              type: "read",
              conversationId: message.conversationId,
              messageId: message.id,
            });
          }
        }}
      >
        <div style="display: flex; gap: 0.5rem;">
          <md-button class="read-tracking-story__reset" variant="outlined">
            Reset unread messages
          </md-button>
          <md-button class="read-tracking-story__simulate-read-event" variant="outlined">
            Simulate incoming read event
          </md-button>
        </div>
        <chx-chat
          .userId=${"me"}
          .messages=${makeUnreadMessages(24)}
          .adapter=${{
            markRead: async (/** @type {{conversationId?: string, messageId: string}} */ input) => {
              console.log("adapter.markRead", input);
            },
            subscribe: realtime.subscribe,
          }}
          read-tracking
          style="flex: 1; min-height: 0;"
          ${ref((el) => (chatEl = /** @type {import("../components/base/chat.js").ChxChat} */ (el)))}
          @chx-message-read=${(
            /** @type {CustomEvent<{messageId: string, messageIds: string[]}>} */ event,
          ) => {
            const chat = /** @type {any} */ (event.currentTarget);
            const covered = new Set(event.detail.messageIds);
            chat.messages = chat.messages.map((/** @type {any} */ message) =>
              covered.has(message.id) ? { ...message, readState: "read" } : message,
            );
          }}
        >
          <chx-message-list slot="message-list" read-threshold="0"></chx-message-list>
          <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
            <md-button slot="actions" variant="text">Opus 4.8</md-button>
          </chx-message-composer>
        </chx-chat>
      </div>
    `;
  },
};

/**
 * Demonstrates `chx-message-list`'s `scroll-to-bottom` slot on its own. Like `streaming` above,
 * becoming *eligible* to show is fully automatic — `chx-infinity-scroll` tracks scroll position
 * itself and flips a boolean once the list has scrolled more than `buffer` px away from the bottom
 * (150px here, the default, set explicitly to make the story's own point) — but what actually
 * renders still needs `<chx-scroll-to-bottom-affordance slot="scroll-to-bottom">` slotted in
 * explicitly, same "no default content" posture `typing`/`streaming` have. The button below jumps
 * the list to the top so the affordance appears without having to scroll manually first; scrolling
 * back down past the buffer on your own makes it disappear again, same as scrolling up does the
 * reverse. The affordance's own `scroll-behavior="instant"` governs only the scroll *its* click
 * triggers — independent of `chx-message-list`'s own `scroll-behavior` (which only governs the
 * automatic stick-to-bottom follow and the public `scrollToBottom()` method).
 */
/** @type {Story} */
export const ScrollToBottomAffordance = {
  render: () => {
    /** @type {import("../components/base/chat.js").ChxChat | undefined} */
    let chatEl;
    return html`
      <div
        class="scroll-to-bottom-story"
        style="height: 100%; display: flex; flex-direction: column; gap: 0.5rem;"
        @click=${(/** @type {MouseEvent} */ event) => {
          if (
            !(
              /** @type {HTMLElement} */ (event.target).closest(
                ".scroll-to-bottom-story__scroll-up",
              )
            )
          )
            return;
          const firstId = chatEl?.store.getMessages()[0]?.id;
          if (firstId) chatEl?.viewport.toMessage(firstId, { align: "start" });
        }}
      >
        <md-button
          class="scroll-to-bottom-story__scroll-up"
          variant="outlined"
          style="align-self: flex-start;"
        >
          Scroll away from bottom
        </md-button>
        <chx-chat
          .userId=${"me"}
          .messages=${makeMessages(40)}
          style="flex: 1; min-height: 0;"
          ${ref((el) => (chatEl = /** @type {import("../components/base/chat.js").ChxChat} */ (el)))}
        >
          <chx-message-list slot="message-list" buffer="150">
            <chx-scroll-to-bottom-affordance
              slot="scroll-to-bottom"
              scroll-behavior="instant"
            ></chx-scroll-to-bottom-affordance>
          </chx-message-list>
          <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
            <md-button slot="actions" variant="text">Opus 4.8</md-button>
          </chx-message-composer>
        </chx-chat>
      </div>
    `;
  },
};

const PAGINATION_TOTAL_HISTORY = 1000;
const PAGINATION_PAGE_SIZE = 40;

const WORDS = [
  "the",
  "quick",
  "brown",
  "fox",
  "jumps",
  "over",
  "lazy",
  "dog",
  "chat",
  "message",
  "history",
  "scroll",
  "virtual",
  "list",
  "render",
  "component",
  "async",
  "stream",
  "reply",
  "assistant",
  "user",
  "prompt",
  "context",
  "token",
  "model",
  "response",
  "pagination",
  "cursor",
  "anchor",
];

/** Deterministic in [0, 1) — seeded so story content is stable across reloads. @param {number} seed */
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/** @param {number} seed */
function makeSentence(seed) {
  const wordCount = 4 + Math.floor(seededRandom(seed) * 12); // 4-15 words
  const words = Array.from(
    { length: wordCount },
    (_, i) => WORDS[Math.floor(seededRandom(seed * 31 + i) * WORDS.length)],
  );
  return `${words[0][0].toUpperCase()}${words[0].slice(1)} ${words.slice(1).join(" ")}.`;
}

// wildly varied length (one short line vs. several sentences) — exercises the virtualizer's
// estimateSize -> real-height correction across a real size spread, not a uniform row height
/** @param {number} index */
function makeRandomText(index) {
  const sentenceCount = 1 + Math.floor(seededRandom(index) * 7); // 1-7 sentences
  return Array.from({ length: sentenceCount }, (_, i) => makeSentence(index * 97 + i)).join(" ");
}

const HISTORY_MESSAGES_PER_DAY = 60;

/**
 * Ending now, a minute apart within a day (distinct times in the meta, same-author neighbours group
 * into runs), stepping back a whole day every 60 messages — a date divider every page and a half.
 * @param {number} index
 */
function historyCreatedAt(index) {
  const back = PAGINATION_TOTAL_HISTORY - 1 - index;
  const days = Math.floor(back / HISTORY_MESSAGES_PER_DAY);
  const minutes = back % HISTORY_MESSAGES_PER_DAY;
  return Date.now() - days * 86_400_000 - minutes * 60_000;
}

/** A tiny inline SVG, so the image card has a real preview to show. @param {string} name @param {string} fill */
function mockImageFile(name, fill) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="${fill}"/><circle cx="80" cy="60" r="28" fill="#fff" opacity=".7"/></svg>`;
  return new File([svg], name, { type: "image/svg+xml" });
}

/** `size` zero bytes — only the card's name/type/size matter. @param {string} name @param {string} type @param {number} size */
function mockFile(name, type, size) {
  return new File([new Uint8Array(size)], name, { type });
}

const MOCK_FILES = [
  () => mockFile("report.pdf", "application/pdf", 245_760),
  () => mockImageFile("diagram.svg", "#6750a4"),
  () => mockFile("notes.txt", "text/plain", 3_120),
  () => mockImageFile("screenshot.svg", "#386a20"),
  () => mockFile("dataset.csv", "text/csv", 58_400),
];

/** Every 7th message carries one or two files, picked deterministically. @param {number} index */
function mockAttachmentParts(index) {
  if (index % 7 !== 3) return [];
  const count = 1 + Math.floor(seededRandom(index * 13) * 2);
  return Array.from({ length: count }, (_, i) => ({
    id: `hist-${index}-a${i}`,
    type: "attachment",
    attachment: MOCK_FILES[Math.floor(seededRandom(index * 17 + i) * MOCK_FILES.length)](),
  }));
}

/** @param {number} index @param {boolean} [withAttachments] */
function makeHistoryMessage(index, withAttachments = false) {
  const own = index % 3 === 0;
  return makeMessage({
    id: `hist-${index}`,
    own,
    author: own ? ME : ASSISTANT,
    createdAt: historyCreatedAt(index),
    parts: [
      textPart(`hist-${index}-t1`, `#${index}: ${makeRandomText(index)}`),
      ...(withAttachments ? mockAttachmentParts(index) : []),
    ],
  });
}

/**
 * A fake `adapter.listMessages` backed by `PAGINATION_TOTAL_HISTORY` messages, paginated
 * `PAGINATION_PAGE_SIZE` at a time — `cursor` is just the (stringified) index to page backward
 * from. The first call (no cursor, made by chx-chat itself on connect) returns the newest page;
 * `store.loadMore()` (scroll to the top, or the composer's "Load older messages" button below)
 * walks backward one page at a time until `hasMore: false`. `delayMs` defaults to the same 600ms
 * `Pagination` story below uses — the initial-loading stories pass a longer one so the indicator
 * stays comfortably visible while looking at the story, not just for one paint.
 * @param {number} [delayMs]
 * @param {{withAttachments?: boolean}} [options] - mock files on some messages (needs `partElements.attachment`)
 */
function createHistoryAdapter(delayMs = 600, { withAttachments = false } = {}) {
  return createPaginatedAdapter({
    total: PAGINATION_TOTAL_HISTORY,
    pageSize: PAGINATION_PAGE_SIZE,
    delayMs,
    makeMessage: (index) => makeHistoryMessage(index, withAttachments),
  });
}

/**
 * Scroll `chx-message-list` to the top to load older history — a sentinel + IntersectionObserver
 * inside the list requests it automatically; the button below calls `chatEl.store.loadMore()`
 * directly, the same public method, for a way to
 * trigger it without scrolling. Scroll position is preserved across a load — the messages visible
 * before the load stay in place rather than jumping.
 *
 * Also demonstrates `chx-message-list`'s `scroll-to-bottom` slot: with 1000 history messages there's
 * plenty of room to scroll up and away from the bottom — past the list's `buffer` (150px default) —
 * at which point the slotted `<chx-scroll-to-bottom-affordance slot="scroll-to-bottom">` appears on
 * its own, no story-level wiring needed (same automatic-eligibility, opt-in-content posture as
 * `streaming` above). Click it to jump back to the newest message.
 *
 * And `chx-message-list`'s `loading-history` slot — the second kind of loading, distinct from
 * `InitialLoadingDefault`/`InitialLoadingCustom` below (those fire once, with no messages on screen
 * yet; this one fires every subsequent older-page fetch, with messages already visible). Unlike
 * `streaming`/`scroll-to-bottom` above, nothing is slotted here at all — the slot's own native
 * fallback is a plain `<chx-loading-history>`, so it shows up with zero story-level wiring the
 * instant a scroll-triggered (or button-triggered) `store.loadMore()` starts, and disappears the
 * instant it settles. See `LoadingHistoryCustomDelay` below for overriding it explicitly.
 *
 * `<chx-divider slot="divider" sticky>` adds date dividers — the history steps back a day every 60
 * messages (see `historyCreatedAt`) — and a sticky day label while scrolling.
 *
 * `<chx-attachments>` in the composer (the leading `+` opens the picker; drop or paste files too) —
 * sent files render as cards in the list via `partElements.attachment`, and so do the mocked files
 * every 7th history message carries (`mockAttachmentParts`).
 *
 * The Virtualization control switches `no-virtualization` — every message in real DOM instead of a
 * windowed list; the chat is recreated on a switch, starting from the newest page again.
 */
/** @type {Story} */
export const Pagination = {
  args: { compact: false, virtualization: true },
  argTypes: {
    compact: { name: "Compact mode", control: "boolean" },
    virtualization: { name: "Virtualization", control: "boolean" },
  },
  render: (args) => {
    const sentCards = createBuiltInSentCards();
    return html`
      <div
        class="pagination-story"
        style="height: 100%; display: flex; flex-direction: column; gap: 0.5rem;"
        @click=${(/** @type {MouseEvent} */ event) => {
          if (!(/** @type {HTMLElement} */ (event.target).closest(".pagination-story__load-more")))
            return;
          const container = /** @type {HTMLElement} */ (event.currentTarget);
          container.querySelector("chx-chat")?.store.loadMore();
        }}
      >
        <md-button
          class="pagination-story__load-more"
          variant="outlined"
          style="align-self: flex-start;"
        >
          Load older messages
        </md-button>
        ${keyed(
          args.virtualization,
          html`<chx-chat
            ?no-virtualization=${!args.virtualization}
            .userId=${"me"}
            .adapter=${createHistoryAdapter(600, { withAttachments: true })}
            .compact=${args.compact}
            .partElements=${sentCards.partElements}
            style="flex: 1; min-height: 0;"
          >
            <chx-message-list slot="message-list" author-display="all" scroll-behavior="smooth">
              <chx-divider slot="divider" sticky></chx-divider>
              <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
              <chx-scroll-to-bottom-affordance
                slot="scroll-to-bottom"
              ></chx-scroll-to-bottom-affordance>
            </chx-message-list>
            <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
              <md-icon-button slot="leading" @click=${sentCards.open}>
                ${unsafeSVG(plus)}
              </md-icon-button>
              <chx-attachments slot="attachments" ${sentCards.attachmentsRef}></chx-attachments>
              <md-button slot="actions" variant="text">Opus 4.8</md-button>
            </chx-message-composer>
          </chx-chat>`,
        )}
      </div>
    `;
  },
};

/**
 * `chx-loading-history` is only ever touched directly to customize it — `Pagination` above shows it
 * needs no wiring at all for the default look. Here the app slots its own instance with two
 * customizations at once: `delay="800"` (ms to wait, once connected, before actually rendering —
 * skips the flash entirely on a fetch that settles faster than that) and a custom `<md-skeleton
 * variant="circular">` in place of the default `<md-progress-circular>`, via `chx-loading-history`'s
 * own plain `<slot>`. `createHistoryAdapter`'s delay here (3s) is well past `delay`, so the
 * indicator is still visible — try setting `delay` above 3000 instead to see a fetch settle with the
 * indicator never appearing at all.
 */
/** @type {Story} */
export const LoadingHistoryCustomDelay = {
  render: () => html`
    <div
      class="pagination-story"
      style="height: 100%; display: flex; flex-direction: column; gap: 0.5rem;"
      @click=${(/** @type {MouseEvent} */ event) => {
        if (!(/** @type {HTMLElement} */ (event.target).closest(".pagination-story__load-more")))
          return;
        const container = /** @type {HTMLElement} */ (event.currentTarget);
        container.querySelector("chx-chat")?.store.loadMore();
      }}
    >
      <md-button
        class="pagination-story__load-more"
        variant="outlined"
        style="align-self: flex-start;"
      >
        Load older messages
      </md-button>
      <chx-chat
        .userId=${"me"}
        .adapter=${createHistoryAdapter(3000)}
        style="flex: 1; min-height: 0;"
      >
        <chx-message-list slot="message-list">
          <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
          <chx-loading-history slot="loading-history" delay="800"></chx-loading-history>
          <chx-scroll-to-bottom-affordance
            slot="scroll-to-bottom"
          ></chx-scroll-to-bottom-affordance>
        </chx-message-list>
        <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
          <md-button slot="actions" variant="text">Opus 4.8</md-button>
        </chx-message-composer>
      </chx-chat>
    </div>
  `,
};

/**
 * `chx-message-list`'s `initial-loading` slot overridden with a consumer-supplied element — the
 * default `<md-progress-circular>` fallback only ever renders when the slot is empty (same
 * slot-with-fallback-content mechanics as `chx-loading-history`'s own default slot), so slotting
 * anything into `slot="initial-loading"` replaces it outright, no opt-out flag needed. Here it's
 * seven `<md-skeleton variant="rectangular">` bubbles of varied width/height, sized/aligned to
 * roughly preview a denser message history about to load, alternating side like `Messages`' real
 * messages do — `chx-chat`
 * doesn't know or care what's in the slot, it only toggles whether the slot renders at all. Fixed px
 * widths, not percentages: once content is actually assigned (as opposed to the slot's own native
 * fallback, which the sibling `InitialLoadingDefault` story exercises instead), it renders as a direct
 * flex item of `chx-infinity-scroll`'s internal column rather than inheriting `.message-list__initial-
 * loading`'s own sizing rules — a percentage width here has no definite containing block to resolve
 * against and collapses to 0, confirmed live.
 */
/** @type {Story} */
export const InitialLoadingCustom = {
  render: () => html`
    <chx-chat .userId=${"me"} .adapter=${createHistoryAdapter(2500)} style="height: 500px;">
      <chx-message-list slot="message-list">
        <div
          slot="initial-loading"
          style="display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem 0; width: 100%;"
        >
          <md-skeleton
            variant="rectangular"
            style="width: 220px; height: 2.5rem; border-radius: 1rem; align-self: flex-start;"
          ></md-skeleton>
          <md-skeleton
            variant="rectangular"
            style="width: 160px; height: 2rem; border-radius: 1rem; align-self: flex-end;"
          ></md-skeleton>
          <md-skeleton
            variant="rectangular"
            style="width: 780px; height: 4.5rem; border-radius: 1rem; align-self: flex-start;"
          ></md-skeleton>
          <md-skeleton
            variant="rectangular"
            style="width: 390px; height: 2.5rem; border-radius: 1rem; align-self: flex-end;"
          ></md-skeleton>
          <md-skeleton
            variant="rectangular"
            style="width: 440px; height: 3rem; border-radius: 1rem; align-self: flex-start;"
          ></md-skeleton>
          <md-skeleton
            variant="rectangular"
            style="width: 530px; height: 2rem; border-radius: 1rem; align-self: flex-end;"
          ></md-skeleton>
          <md-skeleton
            variant="rectangular"
            style="width: 260px; height: 3.5rem; border-radius: 1rem; align-self: flex-start;"
          ></md-skeleton>
        </div>
        <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
      </chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
      </chx-message-composer>
    </chx-chat>
  `,
};

/**
 * `chx-message-list`'s `content-align` attribute — with only a couple of messages inside a tall
 * container, `"end"` (the default, see `Messages` above) pushes them to the bottom like a real
 * chat; `"start"` here leaves them at the top instead, with the leftover space falling below. Only
 * affects the idle/under-full case — scroll to the bottom of `Messages` and this behaves
 * identically either way once there's enough content to actually scroll.
 */
/** @type {Story} */
export const ContentAlignStart = {
  render: () => html`
    <chx-chat
      .userId=${"me"}
      .messages=${makeMessages(2)}
      .adapter=${createSlowReplyAdapter()}
      style="height: 100%;"
    >
      <chx-message-list slot="message-list" content-align="start">
        <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
      </chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
      </chx-message-composer>
    </chx-chat>
  `,
};

/** chx-message-list is optional — chx-chat lays out just the composer fine without one. */
/** @type {Story} */
export const ComposerOnly = {
  args: { compact: false },
  argTypes: {
    compact: { name: "Compact mode", control: "boolean" },
  },
  render: (args) => html`
    <chx-chat .compact=${args.compact}>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
      </chx-message-composer>
    </chx-chat>
  `,
};

const composerFooterStyles = html`
  <style>
    .composer-footer-story {
      --chx-message-composer-background: var(--md-sys-color-surface-container-high);
    }
    .composer-footer-story::part(textbox) {
      --chx-textbox-background-color: var(--md-sys-color-surface-container-lowest);
      --chx-textbox-outline-color: var(--md-sys-color-outline-variant);
      --chx-textbox-focus-outline-color: var(--md-sys-color-primary);
    }
    .composer-footer-story__tray {
      display: flex;
      gap: 0.25rem;
    }
  </style>
`;

/**
 * The `footer` slot holds an app-owned tray under the field (here: where the agent runs and on which
 * branch). Once it has content the composer draws one surface around field and tray —
 * `--chx-message-composer-background` — and the field gets an outline through the `textbox` part.
 * `layout="stacked"` keeps the controls on their own row, `send-button="always"` keeps the send button
 * in place (disabled while empty), and `busy-action="stop"` keeps it on stop for the whole reply.
 */
/** @type {Story} */
export const ComposerFooter = {
  args: {
    compact: false,
    layout: "stacked",
    sendButton: "always",
    busyAction: "stop",
    footer: true,
  },
  argTypes: {
    compact: { name: "Compact mode", control: "boolean" },
    layout: { control: "inline-radio", options: ["auto", "stacked"] },
    sendButton: { name: "send-button", control: "inline-radio", options: ["auto", "always"] },
    busyAction: { name: "busy-action", control: "inline-radio", options: ["send", "stop"] },
    footer: { name: "Footer content", control: "boolean" },
  },
  render: (args) => html`
    ${composerFooterStyles}
    <chx-chat .compact=${args.compact} .adapter=${createReplyAdapter({ delayMs: 2500 })}>
      <chx-message-list slot="message-list">
        <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
      </chx-message-list>
      <chx-message-composer
        slot="message-composer"
        class="composer-footer-story"
        placeholder="Describe a task, @ to mention, / for commands"
        layout=${args.layout}
        send-button=${args.sendButton}
        busy-action=${args.busyAction}
      >
        <md-icon-button slot="leading" aria-label="Attach">
          <md-icon>${unsafeSVG(plus)}</md-icon>
        </md-icon-button>
        <md-button slot="leading" variant="text">Codex · GPT 5.6</md-button>
        <md-button slot="actions" variant="text">Agent</md-button>
        ${
          args.footer
            ? html`
                <div slot="footer" class="composer-footer-story__tray">
                  <md-button id="composer-footer-env" variant="text">
                    <md-icon slot="icon">${unsafeSVG(computerIcon)}</md-icon>
                    Local
                  </md-button>
                  <md-menu for="composer-footer-env" placement="bottom-start">
                    <md-menu-item value="local" selected>Local</md-menu-item>
                    <md-menu-item value="worktree">Worktree</md-menu-item>
                    <md-menu-item value="docker">Docker</md-menu-item>
                  </md-menu>
                  <md-button id="composer-footer-branch" variant="text">
                    <md-icon slot="icon">${unsafeSVG(branchIcon)}</md-icon>
                    main
                  </md-button>
                  <md-menu for="composer-footer-branch" placement="bottom-start">
                    <md-menu-item value="main" selected>main</md-menu-item>
                    <md-menu-item value="develop">develop</md-menu-item>
                  </md-menu>
                </div>
              `
            : ""
        }
      </chx-message-composer>
    </chx-chat>
  `,
};

const handlePasteChipMessagesChange = createSplitOnSendHandler([longTextPastePartRule]);

/**
 * Renders a `type: "longText"` message part as a native `<details>` disclosure — collapsed by
 * default, showing the pasted line count; expand to read the full text. A `chx-chat.partElements`
 * entry, the same generic extension point `messageElement`/other part types already use.
 * @param {import("../types/message.js").ChxMessagePart} part
 * @param {HTMLElement} [previous]
 * @returns {HTMLElement}
 */
function renderLongTextPart(part, previous) {
  const details = /** @type {HTMLDetailsElement} */ (previous ?? document.createElement("details"));
  details.replaceChildren();

  const summary = document.createElement("summary");
  summary.textContent = `${/** @type {any} */ (part).lines ?? 0} lines`;
  details.append(summary);

  const pre = document.createElement("pre");
  pre.textContent = part.text ?? "";
  details.append(pre);

  return details;
}

/**
 * A paste of `paste-threshold`+ lines collapses to a "N lines" chip instead of flooding the field
 * (threshold lowered from the 205 default so it's demoable — paste any 3+-line text). The chip is
 * an atom: Backspace removes it whole, and on send `value` expands back to the full text. Sending
 * also re-splits the message via `partElements.longText` (`renderLongTextPart` above), so the
 * pasted text stays a collapsed native `<details>` disclosure in the message list too, instead of
 * flooding the conversation with a wall of text. Override the live composer chip's own look by
 * overriding `<chx-paste-long-text>`'s `.buildElement()`.
 */
/** @type {Story} */
export const PasteChip = {
  render: () => html`
    <chx-chat
      .partElements=${{ longText: renderLongTextPart }}
      @chx-messages-change=${handlePasteChipMessagesChange}
    >
      <chx-message-list slot="message-list"></chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <chx-paste-long-text paste-threshold="200"></chx-paste-long-text>
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
      </chx-message-composer>
    </chx-chat>
  `,
};

/**
 * `chx-chat.partElements` is a `Record<partType, renderer>` keyed by `part.type`, consumed by
 * `chx-message-list` (`#renderPart`) ahead of the built-in `text`/`html` fallback. `part.type`
 * accepts any string (see `ChxMessagePart`), so a custom type needs no library-side registration —
 * just a `partElements` entry.
 *
 * Unlike a chip/paste chip, a custom part isn't typed live in the composer — it arrives already
 * structured, straight from the adapter/model (a tool-call result, typically), so there's no
 * `splitMessageParts` step involved at all; this story seeds it directly via `.messages` for the
 * demo, and `partElements` alone is what renders it.
 */
/**
 * @param {import("../types/message.js").ChxMessagePart} part
 * @param {HTMLElement} [previous]
 * @returns {HTMLElement}
 */
function renderTicketSummaryPart(part, previous) {
  const card = /** @type {HTMLElement} */ (previous ?? document.createElement("div"));
  card.replaceChildren();
  card.style.border = "1px solid var(--md-sys-color-outline-variant)";
  card.style.borderRadius = "12px";
  card.style.padding = "0.75rem 1rem";
  card.style.background = "var(--md-sys-color-surface-container)";
  card.style.display = "flex";
  card.style.flexDirection = "column";
  card.style.gap = "0.25rem";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.gap = "0.5rem";

  const title = document.createElement("span");
  title.style.fontWeight = "600";
  title.textContent = `Ticket ${/** @type {any} */ (part).ticketId}`;
  header.append(title);

  const status = document.createElement("span");
  status.textContent = /** @type {any} */ (part).status;
  status.style.fontSize = "0.75rem";
  status.style.color = "var(--md-sys-color-on-surface-variant)";
  header.append(status);

  card.append(header);

  const summary = document.createElement("p");
  summary.style.margin = "0";
  summary.textContent = /** @type {any} */ (part).summary;
  card.append(summary);

  return card;
}

const DAY_MS = 86_400_000;

/**
 * Messages spread across seven calendar days (six days ago … today), twelve per day, with a couple of
 * `type: "system"` action entries ("Alex added Max…", "Sasha renamed the chat") interleaved between
 * days. Enough content to scroll for several screens so the sticky label crosses many day boundaries.
 * `createdAt` is strictly ascending across the whole array so ordering and the day-change comparison
 * both hold.
 */
function makeDatedMessages() {
  const now = Date.now();
  const dayCount = 7;
  const perDay = 12;
  const dayBases = Array.from({ length: dayCount }, (_, d) => now - (dayCount - 1 - d) * DAY_MS);
  const actions = {
    1: "Alex added Max to the conversation",
    3: "Sasha renamed the chat “Release planning”",
  };
  /** @type {import("../types/message.js").ChxMessage[]} */
  const messages = [];
  let n = 0;
  dayBases.forEach((base, day) => {
    for (let i = 0; i < perDay; i++) {
      const own = n % 2 === 0;
      messages.push(
        makeMessage({
          id: `dm-${n}`,
          own,
          createdAt: base + n * 1000, // ascending overall — day base dominates, n breaks ties
          text: own ? `My message #${n}` : `Assistant reply #${n} (day ${day + 1}).`,
        }),
      );
      n++;
    }
    // an action divider (a system part) after the day's messages, on a couple of days
    const action = /** @type {Record<number, string>} */ (actions)[day];
    if (action) {
      messages.push(
        makeMessage({
          id: `dm-sys-${n}`,
          own: false,
          authorId: "system",
          createdAt: base + n * 1000,
          parts: [{ id: `dm-sys-${n}-t1`, type: "system", text: action }],
        }),
      );
      n++;
    }
  });
  return messages;
}

/**
 * An action divider, drawn chrome-free in pure CSS. A message whose first part is `type: "system"`
 * gets the `message-system` part name from `chx-message-list` automatically (one of the closed
 * vocabulary `messagePartNames` stamps on every row), so stripping the bubble is just a rule. The
 * interior — padding and background live on `.message__content` inside chx-message's shadow — is
 * reached through `--chx-message-*`, since part selectors don't nest; `width`/`max-width` apply
 * straight to the host, and a page-level `::part()` rule outranks the component's own `:host` rules.
 * Date dividers are a separate, library-driven feature: `<chx-divider slot="divider">` below.
 */
const actionDividerStyles = html`
  <style>
    .dividers-story::part(message-system) {
      --chx-message-padding: 0;
      --chx-message-background-color: transparent;
      --chx-message-max-width: 100%;
      width: 100%;
    }
    /* the line-label-line chx-divider draws, rebuilt as pseudo-elements on the row's own part box —
       ::part() takes a pseudo-element after it, and they become flex children of chx-message's host.
       text-align/font-size/color are inherited properties, so they cross into the shadow tree and
       reach .message__content without a (nonexistent) nested part selector. */
    .dividers-story::part(message-system) {
      align-items: center;
      text-align: center;
      font-size: 0.75rem;
      color: var(--md-sys-color-on-surface-variant);
    }
    .dividers-story::part(message-system)::before,
    .dividers-story::part(message-system)::after {
      content: "";
      flex: 1 1 0;
      border-block-start: 1px solid var(--md-sys-color-outline-variant);
    }
    /* margins rather than a flex gap: the empty avatar column is still a flex child, so a gap
       would count twice on the leading side and pull the label off center */
    .dividers-story::part(message-system)::before {
      margin-inline-end: 0.75rem;
    }
    .dividers-story::part(message-system)::after {
      margin-inline-start: 0.75rem;
    }
  </style>
`;

/**
 * Date dividers + action dividers across a week of history. `<chx-divider slot="divider">` on
 * `<chx-message-list>` is the config carrier: `chx-message-list` reads its `formatDate`/
 * `shouldShowDivider` and prepends a divider inside the first message of each calendar day (the default
 * `formatDate` gives "Today"/"Yesterday"/a weekday). It renders nothing itself — it's discovered via a
 * hidden slot and drives per-row insertion through `DividerController`. Adding `sticky` pins the current
 * day's label at the top like a native sticky section header: it stays stuck while that day is in view,
 * the next day's divider pushes it up and swaps it as you scroll (one label, no overlap — the inline
 * divider under it is occluded), and it's **clickable** — click it to jump to that day's boundary. The
 * "Alex added Max…"/"Sasha renamed…" rows are *not* date dividers — they're ordinary
 * `type: "system"` messages, stripped of their bubble by the `message-system` part name
 * `chx-message-list` stamps on them automatically (`actionDividerStyles` above). Remove the
 * `<chx-divider slot="divider">` and the date dividers vanish while the action dividers stay — the
 * date feature is inert unless the carrier is slotted.
 */
/** @type {Story} */
export const Dividers = {
  render: () => html`
    ${actionDividerStyles}
    <chx-chat .userId=${"me"} .messages=${makeDatedMessages()} style="height: 100%;">
      <chx-message-list slot="message-list" class="dividers-story">
        <chx-divider slot="divider" sticky></chx-divider>
      </chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
      </chx-message-composer>
    </chx-chat>
  `,
};

/** @type {Story} */
export const CustomParts = {
  render: () => html`
    <chx-chat
      .userId=${"me"}
      .partElements=${{ "ticket-summary": renderTicketSummaryPart }}
      .messages=${[
        makeMessage({ id: "msg-1", own: true, text: "What's the status on my last ticket?" }),
        makeMessage({
          id: "msg-2",
          own: false,
          parts: [
            textPart("msg-2-t1", "Here's the latest:"),
            {
              id: "msg-2-c1",
              type: "ticket-summary",
              ticketId: "SUP-4821",
              status: "blocked",
              summary: "Waiting on a screen recording from the customer to reproduce the issue.",
            },
          ],
        }),
      ]}
    >
      <chx-message-list slot="message-list"></chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
      </chx-message-composer>
    </chx-chat>
  `,
};
