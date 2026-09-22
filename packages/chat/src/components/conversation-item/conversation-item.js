import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import "@symblight/wc-material/list";
import "@symblight/wc-material/badge";

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
    unreadCount: { type: Number, attribute: "unread-count" },
    active: { type: Boolean, reflect: true },
    unread: { type: Boolean, reflect: true },
    // gates the `typing` slot — no default content, same "no slot, no render" contract
    // chx-message-list's typing/streaming slots use; set by chx-conversations off chx-typing-change
    typing: { type: Boolean, reflect: true },
  };

  constructor() {
    super();
    /** @type {string} */
    this.title = "";
    /** @type {string} */
    this.lastMessage = "";
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
    return [styles];
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
      <md-list-item button aria-current=${this.active ? "true" : nothing}>
        <slot name="avatar" slot="leading"></slot>
        <span class="conversation-item__title">${this.title}</span>
        <div class="conversation-item__preview" slot="supporting-text">
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
                class="conversation-item__badge"
                .value=${String(this.unreadCount)}
              ></md-badge>`
            : nothing
        }
      </md-list-item>
    `;
  }
}
