import { css, html, LitElement, nothing } from "lit";
import { ContextConsumer } from "@lit/context";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import plus from "@material-design-icons/svg/outlined/add.svg?raw";
import refresh from "@material-design-icons/svg/outlined/refresh.svg?raw";
import "@symblight/wc-material/button";
import "@symblight/wc-material/icon-button";

import "../index.js";
import { messageRowContext } from "../context/message-row-context.js";
import { ASSISTANT, ME, makeMessages } from "./shared/fixtures.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Message API",
  component: "chx-message",
  tags: ["autodocs"],
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** Runs of 2 own + 3 incoming, a minute apart, so they group. @param {number} count */
function makeRunMessages(count) {
  return makeMessages(count, { isOwn: (i) => i % 5 < 2, spacingMs: 60_000 });
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
      .messages=${makeRunMessages(20)}
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

/**
 * The default avatar, author name and time, with no pattern at all — from each message's own
 * `author: {name, avatarUrl}`, and `author-display` on `chx-message-list` picks which rows show it. Regular own messages never show
 * theirs: the side already says who wrote them. Compact shows every run's author on its first line.
 */
/** @type {Story} */
export const AuthorDisplay = {
  args: { authorDisplay: "all", compact: false },
  argTypes: {
    authorDisplay: {
      name: "author-display",
      control: "inline-radio",
      options: ["none", "incoming", "all"],
    },
    compact: { name: "Compact mode", control: "boolean" },
  },
  render: (args) => html`
    <chx-chat
      .userId=${"me"}
      .messages=${makeRunMessages(20).map((message) => ({
        ...message,
        author: message.own ? ME : ASSISTANT,
      }))}
      .compact=${args.compact}
      style="height: 100%;"
    >
      <chx-message-list slot="message-list" author-display=${args.authorDisplay}></chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
      </chx-message-composer>
    </chx-chat>
  `,
};

const statesStyles = html`<style>
  .states {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1rem;
  }
  .states__group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .states__label {
    font: 500 0.75rem/1 sans-serif;
    color: var(--md-sys-color-on-surface-variant);
    text-transform: uppercase;
  }
  .states__error {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--md-sys-color-error);
  }
</style>`;

/**
 * `chx-message` on its own, no `chx-message-list`/`chx-chat`: outside a row it's driven by its own
 * properties. There is no error property — a failed send is shown through `after-content`.
 */
/** @type {Story} */
export const States = {
  render: () => {
    const now = Date.now();
    return html`
      ${statesStyles}
      <div class="states">
        <div class="states__group">
          <span class="states__label">Regular</span>
          <chx-message>Incoming message.</chx-message>
          <chx-message own>My own message.</chx-message>
        </div>

        <div class="states__group">
          <span class="states__label">Avatar</span>
          <chx-message .author=${ASSISTANT} .createdAt=${now}>
            Incoming message with the default avatar, author and time.
          </chx-message>
          <chx-message own .author=${ME} .createdAt=${now}>Own message with an avatar.</chx-message>
        </div>

        <div class="states__group">
          <span class="states__label">Pending</span>
          <chx-message own loading>Sending this one…</chx-message>
          <chx-message busy>Streaming a reply…</chx-message>
        </div>

        <div class="states__group">
          <span class="states__label">Error</span>
          <chx-message own>
            This message failed to send.
            <div slot="after-content" class="states__error">
              Not delivered
              <md-icon-button aria-label="Retry">${unsafeSVG(refresh)}</md-icon-button>
            </div>
          </chx-message>
        </div>

        <div class="states__group">
          <span class="states__label">Compact</span>
          <chx-message compact .author=${ASSISTANT} .createdAt=${now}>
            Compact incoming message.
          </chx-message>
          <chx-message compact own .author=${ME} .createdAt=${now}>
            Compact own message.
          </chx-message>
        </div>
      </div>
    `;
  },
};
