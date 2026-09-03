import { html } from "lit";

import { ref } from "lit/directives/ref.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import stop from "@material-design-icons/svg/outlined/stop.svg?raw";
import plus from "@material-design-icons/svg/outlined/add.svg?raw";
import contentCopyIcon from "@material-design-icons/svg/outlined/content_copy.svg?raw";
import "@symblight/wc-material/icon";
import "@symblight/wc-material/icon-button";
import "@symblight/wc-material/avatar";

import "../../index.js";
import "../typing-indicator/typing-indicator.js";
import "../streaming-indicator/streaming-indicator.js";
import "../scroll-to-bottom-affordance/scroll-to-bottom-affordance.js";

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
    <chx-chat label="Write your prompt...">
      <chx-message-list></chx-message-list>
      <chx-message-composer>
        <div slot="leading">
          <md-icon-button variant="tonal" selected> ${unsafeSVG(plus)} </md-icon-button>
        </div>
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
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
          text: own ? `My message #${i}` : `Assistant reply #${i}, a bit longer to see wrapping happen.`,
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
    sendMessage: async (/** @type {any} */ message, /** @type {{signal: AbortSignal}} */ { signal }) => {
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
      label="Write your prompt..."
      .userId=${"me"}
      .messages=${makeMessages(20)}
      .adapter=${createSlowReplyAdapter()}
    >
      <chx-message-list scroll-behavior="smooth">
        <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
      </chx-message-list>
      <chx-message-composer>
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
      label="Write your prompt..."
      .userId=${"me"}
      .messages=${makeMessages(8)}
      .messageElement=${renderCustomMessage}
      .adapter=${createSlowReplyAdapter()}
    >
      <chx-message-list scroll-behavior="smooth">
        <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
      </chx-message-list>
      <chx-message-composer>
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
          if (!(/** @type {HTMLElement} */ (event.target).closest(".typing-story__toggle-typing"))) return;
          if (!chatEl) return;
          chatEl.setTyping(!chatEl.messageListElement?.typing);
        }}
      >
        <md-button class="typing-story__toggle-typing" variant="outlined" style="align-self: flex-start;">
          Toggle "the other side is typing"
        </md-button>
        <chx-chat
          label="Write your prompt..."
          .userId=${"me"}
          .messages=${makeMessages(6)}
          style="flex: 1; min-height: 0;"
          ${ref((el) => (chatEl = /** @type {import("../base/chat.js").ChxChat} */ (el)))}
        >
          <chx-message-list>
            <chx-typing-indicator value="Alice is typing..." slot="typing"></chx-typing-indicator>
          </chx-message-list>
          <chx-message-composer>
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
      label="Write your prompt..."
      .userId=${"me"}
      .messages=${makeMessages(6)}
      .adapter=${createSlowReplyAdapter()}
    >
      <chx-message-list>
        <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
      </chx-message-list>
      <chx-message-composer>
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
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
          if (!(/** @type {HTMLElement} */ (event.target).closest(".scroll-to-bottom-story__scroll-up"))) return;
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
          label="Write your prompt..."
          .userId=${"me"}
          .messages=${makeMessages(40)}
          style="flex: 1; min-height: 0;"
          ${ref((el) => (chatEl = /** @type {import("../base/chat.js").ChxChat} */ (el)))}
        >
          <chx-message-list buffer="150">
            <chx-scroll-to-bottom-affordance
              slot="scroll-to-bottom"
              scroll-behavior="instant"
            ></chx-scroll-to-bottom-affordance>
          </chx-message-list>
          <chx-message-composer>
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
  "the", "quick", "brown", "fox", "jumps", "over", "lazy", "dog", "chat", "message", "history",
  "scroll", "virtual", "list", "render", "component", "async", "stream", "reply", "assistant",
  "user", "prompt", "context", "token", "model", "response", "pagination", "cursor", "anchor",
];

/** Deterministic in [0, 1) — seeded so story content is stable across reloads. @param {number} seed */
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/** @param {number} seed */
function makeSentence(seed) {
  const wordCount = 4 + Math.floor(seededRandom(seed) * 12); // 4-15 words
  const words = Array.from({ length: wordCount }, (_, i) => WORDS[Math.floor(seededRandom(seed * 31 + i) * WORDS.length)]);
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
 * walks backward one page at a time until `hasMore: false`.
 */
function createPaginatedAdapter() {
  return {
    listMessages: async (/** @type {{cursor?: string}} */ { cursor }) => {
      await new Promise((resolve) => setTimeout(resolve, 600)); // simulated network latency
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
 */
/** @type {Story} */
export const Pagination = {
  render: () => html`
    <div
      class="pagination-story"
      style="height: 500px; display: flex; flex-direction: column; gap: 0.5rem;"
      @click=${(/** @type {MouseEvent} */ event) => {
        if (!(/** @type {HTMLElement} */ (event.target).closest(".pagination-story__load-more"))) return;
        const container = /** @type {HTMLElement} */ (event.currentTarget);
        /** @type {(HTMLElement & {loadMoreHistory: () => Promise<void>}) | null} */ (
          container.querySelector("chx-chat")
        )?.loadMoreHistory();
      }}
    >
      <md-button class="pagination-story__load-more" variant="outlined" style="align-self: flex-start;">
        Load older messages
      </md-button>
      <chx-chat
        label="Write your prompt..."
        .userId=${"me"}
        .adapter=${createPaginatedAdapter()}
        style="flex: 1; min-height: 0;"
      >
        <chx-message-list>
          <chx-scroll-to-bottom-affordance slot="scroll-to-bottom"></chx-scroll-to-bottom-affordance>
        </chx-message-list>
        <chx-message-composer>
          <md-button slot="actions" variant="text">Opus 4.8</md-button>
          <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
        </chx-message-composer>
      </chx-chat>
    </div>
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
      label="Write your prompt..."
      .userId=${"me"}
      .messages=${makeMessages(2)}
      .adapter=${createSlowReplyAdapter()}
      style="height: 500px;"
    >
      <chx-message-list content-align="start">
        <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
      </chx-message-list>
      <chx-message-composer>
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
    <chx-chat label="Write your prompt...">
      <chx-message-composer>
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
};
