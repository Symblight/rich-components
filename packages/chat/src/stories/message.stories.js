import { css, html, LitElement, nothing } from "lit";
import { ContextConsumer } from "@lit/context";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import plus from "@material-design-icons/svg/outlined/add.svg?raw";
import "@symblight/wc-material/button";
import "@symblight/wc-material/icon-button";

import "../index.js";
import { messageRowContext } from "../context/message-row-context.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Message API",
  component: "chx-message",
  tags: ["autodocs"],
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** Runs of 2 own + 3 incoming, a minute apart, so they group. @param {number} count */
function makeMessages(count) {
  const start = Date.now() - count * 60_000;
  return Array.from({ length: count }, (_, i) => {
    const own = i % 5 < 2;
    return {
      id: `msg-${i}`,
      authorId: own ? "me" : "assistant",
      own,
      createdAt: start + i * 60_000,
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

/** Reads its row's state from `messageRowContext` — the pattern itself (no row) renders nothing. */
class StoryMessageAvatar extends LitElement {
  static styles = css`
    :host {
      display: grid;
      place-items: center;
      inline-size: 28px;
      block-size: 28px;
      margin-inline-end: 0.5rem;
      border-radius: 50%;
      background-color: var(--md-sys-color-tertiary-container);
      color: var(--md-sys-color-on-tertiary-container);
      font-size: 0.75rem;
      font-weight: 600;
    }

    /* the design's compact avatar is smaller than the text line, so a hidden one doesn't grow the row */
    :host([compact]) {
      inline-size: 24px;
      block-size: 24px;
      margin-inline-end: 0.625rem;
      font-size: 0.625rem;
    }
  `;

  #row = new ContextConsumer(this, { context: messageRowContext, subscribe: true });

  render() {
    const row = this.#row.value;
    if (!row) return nothing;
    return (row.message.authorId ?? "?").slice(0, 2).toUpperCase();
  }

  updated() {
    this.toggleAttribute("compact", Boolean(this.#row.value?.compact));
  }
}
if (!customElements.get("story-message-avatar")) {
  customElements.define("story-message-avatar", StoryMessageAvatar);
}

/**
 * `<chx-message slot="message">` inside `chx-message-list` describes every row: it's cloned per
 * message, and the message's parts are rendered after its own children. Plain markup (the actions
 * button) is copied as is; `<story-message-avatar>` reads the row's state from `messageRowContext`.
 */
/** @type {Story} */
export const MessagePattern = {
  args: { compact: false },
  argTypes: {
    compact: { name: "Compact mode", control: "boolean" },
  },
  render: (args) => html`
    <chx-chat
      .userId=${"me"}
      .messages=${makeMessages(20)}
      .compact=${args.compact}
      style="height: 100%;"
    >
      <chx-message-list slot="message-list">
        <chx-message slot="message">
          <story-message-avatar slot="avatar"></story-message-avatar>
          <div slot="actions">
            <md-icon-button aria-label="More">${unsafeSVG(plus)}</md-icon-button>
          </div>
        </chx-message>
      </chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
      </chx-message-composer>
    </chx-chat>
  `,
};
