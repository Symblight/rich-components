import { html } from "lit";

import { ref } from "lit/directives/ref.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import stop from "@material-design-icons/svg/outlined/stop.svg?raw";

import "@symblight/wc-material/button";

import "../../index.js";
import "../suggestion-list/suggestion-list.js";
import "../suggestion/suggestion.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Suggestions API",
  component: "chx-suggestion-list",
  tags: ["autodocs"],
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

const FAKE_REPLIES = [
  "Sure — here's a draft to get you started.",
  "Good question, let's break it down.",
  "Here's a summary of the key points.",
];

/**
 * Same shape as chat.stories.js's own createSlowReplyAdapter — kept local since these stories don't
 * import from that file. A short, real delay before the first chunk so a click's fill-then-send (or
 * auto-submit) is visibly followed by a reply, not an instant no-op.
 */
function createReplyAdapter() {
  let replyCount = 0;
  return {
    sendMessage: async (
      /** @type {any} */ message,
      /** @type {{signal: AbortSignal}} */ { signal },
    ) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (signal.aborted) return;
      const replyId = `reply-${message.id}`;
      const text = FAKE_REPLIES[replyCount++ % FAKE_REPLIES.length];
      return new ReadableStream({
        start(controller) {
          controller.enqueue({
            messageId: replyId,
            authorId: "assistant",
            partId: `${replyId}-t1`,
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
      parts: [{ id: `msg-${i}-t1`, type: "text", text: own ? `My message #${i}` : `Reply #${i}` }],
    };
  });
}

/**
 * Default behavior: suggestions show while the thread is empty, disappear the moment the first
 * message lands (`chx-chat` pushes `messagesEmpty` down live — see
 * .claude/plans/suggestions.spec.md). Clicking a suggestion pre-fills the composer and focuses it
 * (no `auto-submit` here) — the user still has to hit send themselves, same as typing.
 */
/** @type {Story} */
export const Basic = {
  render: () => html`
    <chx-chat .userId=${"me"} .adapter=${createReplyAdapter()}>
      <chx-message-list slot="message-list"></chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <chx-suggestion-list slot="suggestions">
          <chx-suggestion value="Write an email">Write an email</chx-suggestion>
          <chx-suggestion value="Summarize a document">Summarize a document</chx-suggestion>
          <chx-suggestion value="Ask a question">Ask a question</chx-suggestion>
        </chx-suggestion-list>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
};

/**
 * `auto-submit` on the list applies to every chip uniformly — a click inserts the value into the
 * textbox and immediately calls the form's `requestSubmit()` (the same path Enter-to-send already
 * uses), so it goes out through the real `chx-send-message` flow rather than a shortcut that
 * bypasses the textbox.
 */
/** @type {Story} */
export const AutoSubmit = {
  render: () => html`
    <chx-chat .userId=${"me"} .adapter=${createReplyAdapter()}>
      <chx-message-list slot="message-list"></chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <chx-suggestion-list slot="suggestions" auto-submit>
          <chx-suggestion value="What's the weather like today?">What's the weather?</chx-suggestion>
          <chx-suggestion value="Tell me a fun fact">Tell me a fun fact</chx-suggestion>
        </chx-suggestion-list>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
};

/**
 * `always-visible` keeps the row rendered regardless of message count — `chx-suggestion-list` has no
 * empty-thread awareness of its own, `chx-message-composer` is the one reading `alwaysVisible` (see
 * the spec's "Visibility ownership" section), so this works identically whether the thread starts
 * empty or, as here, already has history.
 */
/** @type {Story} */
export const AlwaysVisible = {
  render: () => html`
    <chx-chat
      .userId=${"me"}
      .messages=${makeMessages(4)}
      .adapter=${createReplyAdapter()}
    >
      <chx-message-list slot="message-list"></chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <chx-suggestion-list slot="suggestions" always-visible>
          <chx-suggestion value="Write an email">Write an email</chx-suggestion>
          <chx-suggestion value="Summarize a document">Summarize a document</chx-suggestion>
          <chx-suggestion value="Ask a question">Ask a question</chx-suggestion>
        </chx-suggestion-list>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
};

/**
 * `value` (inserted text) and the slotted label can differ — useful for a short chip label backed by
 * a longer, more specific prompt. Roving tabindex (Arrow/Home/End) moves a single Tab stop across
 * the row; try Tab into the list, then arrow keys, then Enter/Space.
 */
/** @type {Story} */
export const ValueDiffersFromLabel = {
  render: () => html`
    <chx-chat .userId=${"me"} .adapter=${createReplyAdapter()}>
      <chx-message-list slot="message-list"></chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <chx-suggestion-list slot="suggestions">
          <chx-suggestion
            value="Write a professional email to a client explaining a shipping delay"
          >
            📧 Shipping delay email
          </chx-suggestion>
          <chx-suggestion value="Summarize this document in three bullet points">
            📄 Summarize in bullets
          </chx-suggestion>
          <chx-suggestion value="Explain this concept like I'm five years old">
            🧒 Explain like I'm 5
          </chx-suggestion>
        </chx-suggestion-list>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
};

/** @type {Record<string, {value: string, label: string}[]>} */
const SUGGESTION_PACKS = {
  General: [
    { value: "Write an email", label: "Write an email" },
    { value: "Summarize a document", label: "Summarize a document" },
    { value: "Ask a question", label: "Ask a question" },
  ],
  Coding: [
    { value: "Review this pull request for bugs", label: "Review a pull request" },
    { value: "Write unit tests for this function", label: "Write unit tests" },
    { value: "Explain this error message", label: "Explain an error" },
  ],
  Writing: [
    { value: "Brainstorm blog post ideas", label: "Brainstorm ideas" },
    { value: "Rewrite this paragraph to sound more formal", label: "Make this more formal" },
  ],
};

/**
 * Replaces a chx-suggestion-list's light-DOM children wholesale — chx-suggestion-list has no "set
 * suggestions" property of its own, it's plain declarative light DOM (same as chx-attachments' own
 * cards), so a JS-driven set just means building `<chx-suggestion>` elements and swapping them in.
 * `replaceChildren` fires the default slot's `slotchange` exactly like initial parsing did, which is
 * what re-clamps the roving-tabindex active index and reapplies `setTabbable` — nothing
 * suggestions-specific needs to be re-run manually from here.
 * @param {Element} list
 * @param {{value: string, label: string}[]} pack
 */
function renderSuggestionPack(list, pack) {
  list.replaceChildren(
    ...pack.map((s) => {
      const el = document.createElement("chx-suggestion");
      el.value = s.value;
      el.textContent = s.label;
      return el;
    }),
  );
}

/**
 * Two things a purely-declarative `<chx-suggestion-list><chx-suggestion>...` markup can't show on
 * its own: a list that starts empty and fills in once real content is ready (`ref()` below fires a
 * 900ms "fetch" the moment the list mounts), and swapping the whole set at runtime ("Different
 * topic" cycles `SUGGESTION_PACKS`). Both go through `renderSuggestionPack` above, and both land the
 * roving tab stop back on the new first chip — `#handleSlotchange` re-runs on every content change,
 * not just the first.
 */
/** @type {Story} */
export const Dynamic = {
  render: () => {
    const packNames = Object.keys(SUGGESTION_PACKS);
    let packIndex = 0;

    /** @param {Element | undefined} list */
    const fetchInitialSuggestions = (list) => {
      if (!list) return;
      setTimeout(() => renderSuggestionPack(list, SUGGESTION_PACKS[packNames[packIndex]]), 900);
    };

    /** @param {Event} event */
    const cycleTopic = (event) => {
      const list = /** @type {HTMLElement} */ (event.currentTarget)
        .closest("chx-message-composer")
        ?.querySelector("chx-suggestion-list");
      if (!list) return;
      packIndex = (packIndex + 1) % packNames.length;
      renderSuggestionPack(list, SUGGESTION_PACKS[packNames[packIndex]]);
    };

    return html`
      <chx-chat .userId=${"me"} .adapter=${createReplyAdapter()}>
        <chx-message-list slot="message-list"></chx-message-list>
        <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
          <chx-suggestion-list slot="suggestions" ${ref(fetchInitialSuggestions)}></chx-suggestion-list>
          <md-button slot="actions" variant="text" @click=${cycleTopic}>Different topic</md-button>
          <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
        </chx-message-composer>
      </chx-chat>
    `;
  },
};
