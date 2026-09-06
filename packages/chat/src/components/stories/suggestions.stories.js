import { html } from "lit";

import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import stop from "@material-design-icons/svg/outlined/stop.svg?raw";

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
    <chx-chat label="Write your prompt..." .userId=${"me"} .adapter=${createReplyAdapter()}>
      <chx-message-list></chx-message-list>
      <chx-message-composer>
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
    <chx-chat label="Write your prompt..." .userId=${"me"} .adapter=${createReplyAdapter()}>
      <chx-message-list></chx-message-list>
      <chx-message-composer>
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
      label="Write your prompt..."
      .userId=${"me"}
      .messages=${makeMessages(4)}
      .adapter=${createReplyAdapter()}
    >
      <chx-message-list></chx-message-list>
      <chx-message-composer>
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
    <chx-chat label="Write your prompt..." .userId=${"me"} .adapter=${createReplyAdapter()}>
      <chx-message-list></chx-message-list>
      <chx-message-composer>
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
