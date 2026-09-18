import { html } from "lit";

import { ref } from "lit/directives/ref.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import stop from "@material-design-icons/svg/outlined/stop.svg?raw";
import plus from "@material-design-icons/svg/outlined/add.svg?raw";
import contentCopyIcon from "@material-design-icons/svg/outlined/content_copy.svg?raw";
import "@symblight/wc-material/button";
import "@symblight/wc-material/icon";
import "@symblight/wc-material/icon-button";
import "@symblight/wc-material/avatar";
import "@symblight/wc-material/skeleton";

import "../../index.js";
import "../typing-indicator/typing-indicator.js";
import "../streaming-indicator/streaming-indicator.js";
import "../scroll-to-bottom-affordance/scroll-to-bottom-affordance.js";
import "../loading-history/loading-history.js";
import "../unread-marker/unread-marker.js";
import "../chip/chip.js";
import "../paste-long-text/paste-long-text.js";
import { createSplitOnSendHandler } from "../../utils/split-message-parts.js";

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
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
};

/**
 * The empty state — a conversation-driven chat with no active conversation (the active one was
 * removed, or none is selected yet). Forced here by marking the chat conversation-driven
 * (`.conversationsPresent=${true}`) while leaving `activeConversationId` unset — the same condition
 * `chx-chat` derives after a realtime `conversation-removed` clears the active conversation, or after
 * every conversation is removed. See `.claude/plans/messages/empty-state.md`.
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
      style="height: 480px; display: flex; border: 1px solid var(--md-sys-color-outline-variant); border-radius: 12px; overflow: hidden;"
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
          <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
        </chx-message-composer>
      </chx-chat>
    </div>
  `,
};

/** @param {number} count */
function makeMessages(count) {
  return Array.from({ length: count }, (_, i) => {
    const own = i % 2 === 0;
    return {
      id: `msg-${i}`,
      authorId: own ? "me" : "assistant",
      own,
      createdAt: Date.now() + i,
      status: /** @type {"sent"} */ ("sent"),
      parts: [
        {
          id: `msg-${i}-t1`,
          type: "text",
          text: own
            ? `My message #${i}`
            : `Assistant reply #${i}, a bit longer to see wrapping happen.`,
        },
      ],
    };
  });
}

const FAKE_REPLIES = [
  "That's a great question — let me think about that for a moment.",
  "Sure thing, here's what I'd suggest based on what you described.",
  "Good point. Let's walk through this step by step.",
  "Here's a quick breakdown of the key points to consider.",
  "I hear you — that's a common thing to run into, here's how I'd approach it.",
];

/**
 * A fake `adapter.sendMessage` with a real delay *before* the first chunk arrives — long enough to
 * see `chx-message-list`'s `streaming` property (auto-derived from `chx-chat`'s own
 * `#activeDeliveries` vs. reply-shell state) go true the instant the send starts, then false the
 * instant the reply's first chunk lands. No placeholder message, no word-by-word animation — the
 * whole reply arrives in one chunk once the delay is up; the `streaming` indicator (a slotted
 * `<chx-streaming-indicator>`) is what carries the "thinking" feedback instead.
 */
function createSlowReplyAdapter() {
  let replyCount = 0;
  return {
    sendMessage: async (
      /** @type {any} */ message,
      /** @type {{signal: AbortSignal}} */ { signal },
    ) => {
      await new Promise((resolve) => setTimeout(resolve, 1800)); // nothing sent yet — chx-chat's own
      //   state (a delivery in flight, no reply message) is what drives `streaming`, not this story
      if (signal.aborted) return;
      const replyId = `reply-${message.id}`;
      const partId = `${replyId}-t1`;
      const text = FAKE_REPLIES[replyCount++ % FAKE_REPLIES.length];
      return new ReadableStream({
        start(controller) {
          controller.enqueue({
            messageId: replyId,
            authorId: "assistant",
            partId,
            partType: "text",
            delta: { text },
          });
          controller.enqueue({ kind: "finish", messageId: replyId });
          controller.close();
        },
      });
    },
  };
}

/**
 * Own messages align right, the assistant's align left; enough messages to scroll. `scroll-behavior=
 * "smooth"` on `chx-message-list` animates `scrollToBottom()` instead of jumping instantly. Sending a
 * message gets a fake reply after a "thinking" delay (`createSlowReplyAdapter` above) — the slotted
 * `<chx-streaming-indicator slot="streaming">` below shows automatically for that whole window (no
 * story-level wiring needed, `chx-chat` derives `streaming` from its own in-flight-delivery state)
 * and disappears the instant the reply lands.
 */
/** @type {Story} */
export const WithMessages = {
  render: () => html`
    <chx-chat
      .userId=${"me"}
      .messages=${makeMessages(20)}
      .adapter=${createSlowReplyAdapter()}
    >
      <chx-message-list slot="message-list" scroll-behavior="smooth">
        <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
      </chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
};

/**
 * `chx-message-list`'s `messageElement` override, building a `<chx-message>` with its `avatar`/
 * `meta`/`actions` slots populated — an app-level renderer, chx-message itself has no avatar/meta
 * concept, just the slots. Own messages get no avatar slotted at all — chx-message's avatar column
 * costs zero width automatically when nothing's assigned, no per-message conditional needed here
 * either.
 *
 * The hover/focus reveal on the action button is wired here in plain JS, not CSS: `chx-message`
 * ends up several shadow levels deep (chx-message-list's own shadow → chx-infinity-scroll's own
 * shadow → chx-message itself), and `::part()` only forwards one shadow level at a time without an
 * `exportparts` chain at every intermediate host — confirmed live, a page-level `chx-message::part
 * (actions)` rule silently never matches anything at this nesting depth. `mouseenter`/`mouseleave`/
 * `focusin`/`focusout` on the host element itself don't have that limitation (they're just DOM
 * events, composed and bubbling normally), so this toggles the action button's own inline style
 * directly instead. `previousElement` is reused across re-renders (streaming, edits), so the
 * listeners are wired exactly once per host (`dataset.hoverWired` guard) and always look up the
 * *current* action button via `querySelector` rather than closing over one — the button itself is
 * rebuilt fresh every call below, so a captured reference would go stale after the first re-render.
 * @type {import("../../types/adapter.js").ChxMessageRenderer}
 */
function renderCustomMessage(message, previousElement) {
  const el = /** @type {any} */ (previousElement ?? document.createElement("chx-message"));
  el.own = message.own;
  el.busy = message.parts.some((/** @type {any} */ part) => part.state === "streaming");
  el.ariaLabel = message.own ? "Your message" : "Message";
  el.replaceChildren();

  if (!message.own) {
    const avatar = document.createElement("md-avatar");
    avatar.slot = "avatar";
    /** @type {any} */ (avatar).src = "https://i.pravatar.cc/64?img=12";
    avatar.style.setProperty("--md-avatar-size", "16px");
    el.append(avatar);
  }

  const meta = document.createElement("span");
  meta.slot = "meta";
  meta.style.fontSize = "0.75rem";
  meta.style.fontWeight = "600";
  meta.style.color = "var(--md-sys-color-on-surface-variant)";
  meta.textContent = message.own ? "You" : "Alex";
  el.append(meta);

  for (const part of message.parts) {
    if (part.html) {
      const span = document.createElement("span");
      span.innerHTML = part.html;
      el.append(span);
    } else {
      el.append(document.createTextNode(part.text ?? ""));
    }
  }

  const actionButton = document.createElement("md-icon-button");
  actionButton.slot = "actions";
  actionButton.setAttribute("variant", "standard");
  actionButton.style.setProperty("--md-icon-button-font-size", "1.125rem");
  actionButton.style.opacity = "0";
  actionButton.style.transition = "opacity 0.15s";
  actionButton.innerHTML = `<md-icon>${contentCopyIcon}</md-icon>`;
  el.append(actionButton);

  if (!el.dataset.hoverWired) {
    el.dataset.hoverWired = "true";
    const setVisible = (/** @type {boolean} */ visible) => {
      const button = el.querySelector('[slot="actions"]');
      if (button) button.style.opacity = visible ? "1" : "0";
    };
    el.addEventListener("mouseenter", () => setVisible(true));
    el.addEventListener("mouseleave", () => setVisible(false));
    el.addEventListener("focusin", () => setVisible(true));
    el.addEventListener("focusout", () => setVisible(false));
  }

  return el;
}

/**
 * Same `chx-chat`/`chx-message-list`/`chx-message-composer` shape as `WithMessages` above, with a
 * custom `messageElement` (`renderCustomMessage`) instead of the built-in `<chx-message>` look:
 * an `md-avatar` (not-own messages only), an author label above the bubble, and a small
 * `md-icon-button` action that only appears on hover/focus.
 */
/** @type {Story} */
export const CustomizedMessages = {
  render: () => html`
    <chx-chat
      .userId=${"me"}
      .messages=${makeMessages(8)}
      .messageElement=${renderCustomMessage}
      .adapter=${createSlowReplyAdapter()}
    >
      <chx-message-list slot="message-list" scroll-behavior="smooth">
        <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
      </chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
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
    /** @type {import("../base/chat.js").ChxChat | undefined} */
    let chatEl;
    return html`
      <div
        class="typing-story"
        style="height: 500px; display: flex; flex-direction: column; gap: 0.5rem;"
        @click=${(/** @type {MouseEvent} */ event) => {
          if (!(/** @type {HTMLElement} */ (event.target).closest(".typing-story__toggle-typing")))
            return;
          if (!chatEl) return;
          chatEl.setTyping(!chatEl.messageListElement?.typing);
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
          ${ref((el) => (chatEl = /** @type {import("../base/chat.js").ChxChat} */ (el)))}
        >
          <chx-message-list slot="message-list">
            <chx-typing-indicator value="Alice is typing..." slot="typing"></chx-typing-indicator>
          </chx-message-list>
          <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
            <md-button slot="actions" variant="text">Opus 4.8</md-button>
            <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
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
    <chx-chat
      .userId=${"me"}
      .messages=${makeMessages(6)}
      .adapter=${createSlowReplyAdapter()}
    >
      <chx-message-list slot="message-list">
        <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
      </chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
};

/**
 * `readState`-driven read tracking, per `.claude/plans/messages/read-tracking.md`. `read-tracking` is
 * an opt-in master switch (default `false`) — set here on `<chx-chat>`, pushed straight through to
 * `chx-message-list.readTracking`; without it, no message is ever `observe()`d and `chx-message-read`
 * never fires at all. Every non-own message starts `readState: "unread"` (`makeUnreadMessages` below)
 * — a custom `messageElement` (`renderReadTrackingMessage`) slots a `<chx-unread-marker>` into
 * `chx-message`'s own `unread-marker` slot for each one, since the built-in `<chx-message>` renderer
 * has no hook to slot one in. Scroll up through the older messages below `chx-chat`'s default
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
    function makeUnreadMessages(count) {
      return Array.from({ length: count }, (_, i) => {
        const own = i % 3 === 0;
        return {
          id: `read-msg-${generation}-${i}`,
          authorId: own ? "me" : "assistant",
          own,
          createdAt: Date.now() + i,
          status: /** @type {"sent"} */ ("sent"),
          readState: own ? undefined : /** @type {"unread"} */ ("unread"),
          parts: [
            {
              id: `read-msg-${generation}-${i}-t1`,
              type: "text",
              text: own
                ? `My message #${i}`
                : `Unread reply #${i} — scroll past me to mark me read.`,
            },
          ],
        };
      });
    }

    /** @type {import("../../types/adapter.js").ChxMessageRenderer} */
    function renderReadTrackingMessage(message, previousElement) {
      const el = /** @type {any} */ (previousElement ?? document.createElement("chx-message"));
      el.own = message.own;
      el.unread = message.readState === "unread";
      el.ariaLabel = message.own ? "Your message" : "Message";
      el.replaceChildren();
      if (el.unread) {
        const marker = document.createElement("chx-unread-marker");
        marker.slot = "unread-marker";
        el.append(marker);
      }
      for (const part of message.parts) el.append(document.createTextNode(part.text ?? ""));
      return el;
    }

    /** @type {import("../base/chat.js").ChxChat | undefined} */
    let chatEl;
    // Captured from adapter.subscribe() below — this is the same onEvent chx-chat already passes to
    // any real adapter's own subscribe(), routed to RealtimeSyncController. Simulating a call to it
    // here stands in for a server pushing a ChxReadEvent, without a real backend.
    /** @type {((event: {type: "read", conversationId?: string, messageId: string}) => void) | undefined} */
    let onReadEvent;

    return html`
      <div
        class="read-tracking-story"
        style="height: 500px; display: flex; flex-direction: column; gap: 0.5rem;"
        @click=${(/** @type {MouseEvent} */ event) => {
          const target = /** @type {HTMLElement} */ (event.target);
          if (target.closest(".read-tracking-story__reset")) {
            if (!chatEl) return;
            generation++;
            chatEl.messages = makeUnreadMessages(24);
            return;
          }
          if (target.closest(".read-tracking-story__simulate-read-event")) {
            if (!chatEl || !onReadEvent) return;
            // Toggles the first still-unread message — same messageId shape a real ChxReadEvent
            // carries, per src/types/realtime.js.
            const message = chatEl.messages.find((m) => m.readState === "unread");
            if (!message) return;
            onReadEvent({ type: "read", conversationId: message.conversationId, messageId: message.id });
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
            subscribe: (/** @type {{onEvent: (event: any) => void}} */ handlers) => {
              onReadEvent = handlers.onEvent;
              return () => {
                onReadEvent = undefined;
              };
            },
          }}
          read-tracking
          style="flex: 1; min-height: 0;"
          ${ref((el) => (chatEl = /** @type {import("../base/chat.js").ChxChat} */ (el)))}
          @chx-message-read=${(/** @type {CustomEvent<{messageId: string, messageIds: string[]}>} */ event) => {
            const chat = /** @type {any} */ (event.currentTarget);
            const covered = new Set(event.detail.messageIds);
            chat.messages = chat.messages.map((/** @type {any} */ message) =>
              covered.has(message.id) ? { ...message, readState: "read" } : message,
            );
          }}
        >
          <chx-message-list
            slot="message-list"
            .messageElement=${renderReadTrackingMessage}
            read-threshold="0"
          ></chx-message-list>
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
    /** @type {import("../base/chat.js").ChxChat | undefined} */
    let chatEl;
    return html`
      <div
        class="scroll-to-bottom-story"
        style="height: 500px; display: flex; flex-direction: column; gap: 0.5rem;"
        @click=${(/** @type {MouseEvent} */ event) => {
          if (
            !(
              /** @type {HTMLElement} */ (event.target).closest(
                ".scroll-to-bottom-story__scroll-up",
              )
            )
          )
            return;
          chatEl?.messageListElement?.list?.scrollToIndex(0, { align: "start" });
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
          ${ref((el) => (chatEl = /** @type {import("../base/chat.js").ChxChat} */ (el)))}
        >
          <chx-message-list slot="message-list" buffer="150">
            <chx-scroll-to-bottom-affordance
              slot="scroll-to-bottom"
              scroll-behavior="instant"
            ></chx-scroll-to-bottom-affordance>
          </chx-message-list>
          <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
            <md-button slot="actions" variant="text">Opus 4.8</md-button>
            <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
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

/** @param {number} index */
function makeHistoryMessage(index) {
  const own = index % 3 === 0;
  return {
    id: `hist-${index}`,
    authorId: own ? "me" : "assistant",
    own,
    createdAt: Date.now() + index,
    status: /** @type {"sent"} */ ("sent"),
    parts: [
      {
        id: `hist-${index}-t1`,
        type: "text",
        text: `#${index}: ${makeRandomText(index)}`,
      },
    ],
  };
}

/**
 * A fake `adapter.listMessages` backed by `PAGINATION_TOTAL_HISTORY` messages, paginated
 * `PAGINATION_PAGE_SIZE` at a time — `cursor` is just the (stringified) index to page backward
 * from. The first call (no cursor, made by chx-chat itself on connect) returns the newest page;
 * `loadMoreHistory()` (scroll to the top, or the composer's "Load older messages" button below)
 * walks backward one page at a time until `hasMore: false`. `delayMs` defaults to the same 600ms
 * `Pagination` story below uses — the initial-loading stories pass a longer one so the indicator
 * stays comfortably visible while looking at the story, not just for one paint.
 * @param {number} [delayMs]
 */
function createPaginatedAdapter(delayMs = 600) {
  return {
    listMessages: async (/** @type {{cursor?: string}} */ { cursor }) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs)); // simulated network latency
      const end = cursor ? Number(cursor) : PAGINATION_TOTAL_HISTORY;
      const start = Math.max(0, end - PAGINATION_PAGE_SIZE);
      const messages = Array.from({ length: end - start }, (_, i) => makeHistoryMessage(start + i));
      return { messages, cursor: String(start), hasMore: start > 0 };
    },
  };
}

/**
 * Scroll `chx-message-list` to the top to load older history — a sentinel + IntersectionObserver
 * inside the list requests it automatically; the button below calls `chatEl.loadMoreHistory()`
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
 * instant a scroll-triggered (or button-triggered) `loadMoreHistory()` starts, and disappears the
 * instant it settles. See `LoadingHistoryCustomDelay` below for overriding it explicitly.
 */
/** @type {Story} */
export const Pagination = {
  render: () => html`
    <div
      class="pagination-story"
      style="height: 500px; display: flex; flex-direction: column; gap: 0.5rem;"
      @click=${(/** @type {MouseEvent} */ event) => {
        if (!(/** @type {HTMLElement} */ (event.target).closest(".pagination-story__load-more")))
          return;
        const container = /** @type {HTMLElement} */ (event.currentTarget);
        /** @type {(HTMLElement & {loadMoreHistory: () => Promise<void>}) | null} */ (
          container.querySelector("chx-chat")
        )?.loadMoreHistory();
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
        .adapter=${createPaginatedAdapter()}
        style="flex: 1; min-height: 0;"
      >
        <chx-message-list slot="message-list">
          <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
          <chx-scroll-to-bottom-affordance
            slot="scroll-to-bottom"
          ></chx-scroll-to-bottom-affordance>
        </chx-message-list>
        <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
          <md-button slot="actions" variant="text">Opus 4.8</md-button>
          <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
        </chx-message-composer>
      </chx-chat>
    </div>
  `,
};

/**
 * Same as `Pagination` above, with `no-virtualization` set on `chx-chat` — see
 * `.claude/plans/messages/no-virtualization.md` for the design doc this attribute is specced in.
 */
/** @type {Story} */
export const PaginationNoVirtualization = {
  render: () => html`
    <div
      class="pagination-story"
      style="height: 500px; display: flex; flex-direction: column; gap: 0.5rem;"
      @click=${(/** @type {MouseEvent} */ event) => {
        if (!(/** @type {HTMLElement} */ (event.target).closest(".pagination-story__load-more")))
          return;
        const container = /** @type {HTMLElement} */ (event.currentTarget);
        /** @type {(HTMLElement & {loadMoreHistory: () => Promise<void>}) | null} */ (
          container.querySelector("chx-chat")
        )?.loadMoreHistory();
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
        no-virtualization
        .userId=${"me"}
        .adapter=${createPaginatedAdapter()}
        style="flex: 1; min-height: 0;"
      >
        <chx-message-list slot="message-list">
          <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
          <chx-scroll-to-bottom-affordance
            slot="scroll-to-bottom"
          ></chx-scroll-to-bottom-affordance>
        </chx-message-list>
        <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
          <md-button slot="actions" variant="text">Opus 4.8</md-button>
          <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
        </chx-message-composer>
      </chx-chat>
    </div>
  `,
};

/**
 * `chx-loading-history` is only ever touched directly to customize it — `Pagination` above shows it
 * needs no wiring at all for the default look. Here the app slots its own instance with two
 * customizations at once: `delay="800"` (ms to wait, once connected, before actually rendering —
 * skips the flash entirely on a fetch that settles faster than that) and a custom `<md-skeleton
 * variant="circular">` in place of the default `<md-progress-circular>`, via `chx-loading-history`'s
 * own plain `<slot>`. `createPaginatedAdapter`'s delay here (3s) is well past `delay`, so the
 * indicator is still visible — try setting `delay` above 3000 instead to see a fetch settle with the
 * indicator never appearing at all.
 */
/** @type {Story} */
export const LoadingHistoryCustomDelay = {
  render: () => html`
    <div
      class="pagination-story"
      style="height: 500px; display: flex; flex-direction: column; gap: 0.5rem;"
      @click=${(/** @type {MouseEvent} */ event) => {
        if (!(/** @type {HTMLElement} */ (event.target).closest(".pagination-story__load-more")))
          return;
        const container = /** @type {HTMLElement} */ (event.currentTarget);
        /** @type {(HTMLElement & {loadMoreHistory: () => Promise<void>}) | null} */ (
          container.querySelector("chx-chat")
        )?.loadMoreHistory();
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
        .adapter=${createPaginatedAdapter(3000)}
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
          <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
        </chx-message-composer>
      </chx-chat>
    </div>
  `,
};


/**
 * `chx-message-list`'s `initial-loading` slot overridden with a consumer-supplied element — the
 * default `<md-progress-circular>` fallback only ever renders when the slot is empty (same
 * slot-with-fallback-content mechanics as `chx-attachment`'s own `actions` slot), so slotting
 * anything into `slot="initial-loading"` replaces it outright, no opt-out flag needed. Here it's
 * seven `<md-skeleton variant="rectangular">` bubbles of varied width/height, sized/aligned to
 * roughly preview a denser message history about to load, alternating side like `WithMessages`' real
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
    <chx-chat .userId=${"me"} .adapter=${createPaginatedAdapter(2500)} style="height: 500px;">
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
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
};


/**
 * `chx-message-list`'s `content-align` attribute — with only a couple of messages inside a tall
 * container, `"end"` (the default, see `WithMessages` above) pushes them to the bottom like a real
 * chat; `"start"` here leaves them at the top instead, with the leftover space falling below. Only
 * affects the idle/under-full case — scroll to the bottom of `WithMessages` and this behaves
 * identically either way once there's enough content to actually scroll.
 */
/** @type {Story} */
export const ContentAlignStart = {
  render: () => html`
    <chx-chat
      .userId=${"me"}
      .messages=${makeMessages(2)}
      .adapter=${createSlowReplyAdapter()}
      style="height: 500px;"
    >
      <chx-message-list slot="message-list" content-align="start">
        <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
      </chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
};

/** chx-message-list is optional — chx-chat lays out just the composer fine without one. */
/** @type {Story} */
export const ComposerOnly = {
  render: () => html`
    <chx-chat>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
};

/**
 * Rule for `paste` nodes (`schema.js`) — matches the `<span data-paste-lines>` chip
 * `paste-plugin.js` serializes into `getHTML()`, feeding `splitMessageParts` (see
 * `handlePasteChipMessagesChange` below) the same way `chipPartRule` does for command-picker chips.
 * @type {import("../../types/inline-part-rule.js").InlinePartRule}
 */
const longTextPartRule = {
  type: "longText",
  selector: "span[data-paste-lines]",
  toPart: (element) => ({
    text: element.textContent ?? "",
    lines: Number(element.dataset.pasteLines) || 0,
  }),
};

const handlePasteChipMessagesChange = createSplitOnSendHandler([longTextPartRule]);

/**
 * Renders a `type: "longText"` message part as a native `<details>` disclosure — collapsed by
 * default, showing the pasted line count; expand to read the full text. A `chx-chat.partElements`
 * entry, the same generic extension point `messageElement`/other part types already use.
 * @param {import("../../types/message.js").ChxMessagePart} part
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
        <chx-paste-long-text slot="paste-long-text" paste-threshold="200"></chx-paste-long-text>
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
};

/**
 * `chx-chat.partElements` is this library's equivalent of MUI X Chat's `partRenderers`
 * (https://mui.com/x/react-chat/display/message-parts/custom-parts/) — a `Record<partType,
 * renderer>` keyed by `part.type`, consumed by `chx-message-list` (`#renderPart`) ahead of the
 * built-in `text`/`html` fallback. `part.type` accepts any string (see `ChxMessagePart`), so a
 * custom type needs no library-side registration — just a `partElements` entry.
 *
 * Unlike a chip/paste chip, a custom part isn't typed live in the composer — it arrives already
 * structured, straight from the adapter/model (a tool-call result, typically), so there's no
 * `splitMessageParts` step involved at all; this story seeds it directly via `.messages` for the
 * demo, and `partElements` alone is what renders it.
 */
/**
 * @param {import("../../types/message.js").ChxMessagePart} part
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

/** @type {Story} */
export const CustomParts = {
  render: () => html`
    <chx-chat
      .userId=${"me"}
      .partElements=${{ "ticket-summary": renderTicketSummaryPart }}
      .messages=${[
        {
          id: "msg-1",
          authorId: "me",
          own: true,
          createdAt: Date.now(),
          status: "sent",
          parts: [{ id: "msg-1-t1", type: "text", text: "What's the status on my last ticket?" }],
        },
        {
          id: "msg-2",
          authorId: "assistant",
          own: false,
          createdAt: Date.now(),
          status: "sent",
          parts: [
            { id: "msg-2-t1", type: "text", text: "Here's the latest:" },
            {
              id: "msg-2-c1",
              type: "ticket-summary",
              ticketId: "SUP-4821",
              status: "blocked",
              summary: "Waiting on a screen recording from the customer to reproduce the issue.",
            },
          ],
        },
      ]}
    >
      <chx-message-list slot="message-list"></chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
};
