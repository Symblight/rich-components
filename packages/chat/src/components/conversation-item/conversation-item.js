import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import "@symblight/wc-material/list";
import "@symblight/wc-material/badge";

import tokens from "../../styles/tokens.css?inline";
import styles from "./conversation-item.css?inline";

/**
 * @tag chx-conversation-item
 * @summary Conversation-list row.
 */
@customElement("chx-conversation-item")
export class ChxConversationItem extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    title: { type: String },
    lastMessage: { type: String, attribute: "last-message" },
    // resolved by chx-conversations from conversation.avatarUrl, falling back to the first
    // participant's — renders as the `avatar` slot's fallback content, so slotting your own wins
    avatarUrl: { type: String, attribute: "avatar-url" },
    unreadCount: { type: Number, attribute: "unread-count" },
    active: { type: Boolean, reflect: true },
    unread: { type: Boolean, reflect: true },
    // gates the `typing` slot — no fallback content here; chx-conversations sets this off
    // chx-chat's chx-typing-change and fills the slot from its own template, since rows are
    // authored there and nothing outside can reach the slot
    typing: { type: Boolean, reflect: true },
  };

  constructor() {
    super();
    /** @type {string} */
    this.title = "";
    /** @type {string} */
    this.lastMessage = "";
    /** @type {string} */
    this.avatarUrl = "";
    /** @type {number} */
    this.unreadCount = 0;
    /** @type {boolean} */
    this.active = false;
    /** @type {boolean} */
    this.unread = false;
    /** @type {boolean} */
    this.typing = false;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [tokens, styles];
  }

  /** @returns {(HTMLElement & {getTabIndex(): number, setTabIndex(v: number): void, focusInteractive(): void, updateComplete: Promise<boolean>}) | null} */
  get #listItem() {
    return this.renderRoot?.querySelector("md-list-item") ?? null;
  }

  // Roving tabindex is driven by chx-conversations (md-list only roves its own md-list-item
  // children, not this wrapper) — these three delegate straight to the inner md-list-item.
  /** @returns {number} */
  getTabIndex() {
    return this.#listItem?.getTabIndex() ?? -1;
  }

  /** @param {number} value */
  setTabIndex(value) {
    this.#listItem?.setTabIndex(value);
  }

  focusInteractive() {
    this.#listItem?.focusInteractive();
  }

  // Await the inner md-list-item too, so a caller awaiting our updateComplete before reading/setting
  // the roving tabindex sees a rendered interactive element (its `_interactiveEl`), not a stub.
  async getUpdateComplete() {
    const done = await super.getUpdateComplete();
    await this.#listItem?.updateComplete;
    return done;
  }

  render() {
    return html`
      <md-list-item class="conversation-item__list-item" button aria-current=${this.active ? "true" : nothing}>
        <div class="conversation-item__avatar" part="avatar" slot="leading">
          <slot name="avatar">
            ${when(
              this.avatarUrl,
              () =>
                html`<img class="conversation-item__avatar-image" src=${this.avatarUrl} alt="" />`,
            )}
          </slot>
        </div>
        <span class="conversation-item__title" part="title">${this.title}</span>
        <div class="conversation-item__preview" part="preview" slot="supporting-text">
          ${when(
            this.typing,
            () => html`<slot name="typing"></slot>`,
            () => html`<span class="conversation-item__last-message">${this.lastMessage}</span>`,
          )}
        </div>
        ${
          this.unreadCount > 0
            ? html`<md-badge
                slot="trailing"
                part="badge"
                class="conversation-item__badge"
                .value=${String(this.unreadCount)}
              ></md-badge>`
            : nothing
        }
      </md-list-item>
    `;
  }
}
