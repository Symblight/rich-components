import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";

import "@symblight/wc-material/list";
import "../conversation-item/conversation-item.js";
// this component fills each row's `typing` slot itself — the row has no fallback content, and a
// consumer can't reach it: rows are authored here, not slotted in
import "../typing-indicator/typing-indicator.js";

import styles from "./conversations.css?inline";

/** @import { ChxConversation } from "../../types/conversation.js" */
/** @typedef {import("../conversation-item/conversation-item.js").ChxConversationItem} ConversationItemElement */

// Rows live one shadow level down (directly in this component's shadow tree), so the host-level
// names below need no hop, while the row's own interior parts need exactly one `exportparts`.
const ITEM_PARTS = ["avatar", "title", "preview", "badge"];
const ITEM_EXPORTPARTS = ITEM_PARTS.map((part) => `${part}: item-${part}`).join(", ");
/** The row's part names: `item`, plus `item-active`/`item-unread`/`item-typing` where they apply.
 * Unlike chx-message-list's equivalent, the state names need no literal list of their own — nothing
 * has to enumerate them in an `exportparts` string, since the rows sit in this component's own
 * shadow tree rather than two levels down.
 * @param {ChxConversation} conversation @param {boolean} active @param {boolean} typing */
function itemPartNames(conversation, active, typing) {
  const names = ["item"];
  if (active) names.push("item-active");
  if (conversation.readState === "unread") names.push("item-unread");
  if (typing) names.push("item-typing");
  return names.join(" ");
}

/**
 * @tag chx-conversations
 * @summary Conversation-list sidebar bound to a chx-chat.
 */
@customElement("chx-conversations")
export class ChxConversations extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    for: { type: String, reflect: true },
    activeConversationId: { type: String, attribute: "active-conversation-id" },
    getItemKey: { attribute: false },
  };

  /** @type {(HTMLElement & {conversations?: ChxConversation[], activeConversationId?: string}) | null} */
  #chat = null;
  /** @type {ChxConversation[]} */
  #privateConversations = [];
  /** conversationIds the other side is currently typing in — driven by the chat's chx-typing-change. @type {Set<string>} */
  #typingConversationIds = new Set();

  constructor() {
    super();
    /** @type {string} */
    this.for = "";
    /** @type {string | undefined} */
    this.activeConversationId = undefined;
    /** @type {(c: ChxConversation) => string} */
    this.getItemKey = (c) => c.id;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  /**
   * The rendered list. When bound to a chat (`for`), a write-through view of `chat.conversations`
   * (the source of truth); unbound, a private fallback array so the list still works standalone.
   * @returns {ChxConversation[]}
   */
  get conversations() {
    return this.#chat ? (this.#chat.conversations ?? []) : this.#privateConversations;
  }

  /** @param {ChxConversation[]} value */
  set conversations(value) {
    if (this.#chat) {
      this.#chat.conversations = value;
    } else {
      this.#privateConversations = value;
    }
    this.requestUpdate();
  }

  connectedCallback() {
    super.connectedCallback();
    this.#rebindChat();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#detachChat();
  }

  /** @param {import("lit").PropertyValues} changedProperties */
  updated(changedProperties) {
    if (changedProperties.has("for")) this.#rebindChat();
    this.#syncTabindices();
  }

  /** @returns {(HTMLElement & {conversations?: ChxConversation[], activeConversationId?: string}) | null} */
  #resolveChat() {
    if (!this.for) return null;
    const root = this.getRootNode();
    const scope = root instanceof Document || root instanceof ShadowRoot ? root : document;
    return /** @type {any} */ (scope.getElementById(this.for));
  }

  #rebindChat() {
    const next = this.#resolveChat();
    if (next === this.#chat) return;
    this.#detachChat();
    this.#chat = next;
    if (next) {
      next.addEventListener(
        "chx-active-conversation-change",
        /** @type {EventListener} */ (this.#onChatActiveChange),
      );
      next.addEventListener("chx-conversations-change", this.#onChatConversationsChange);
      next.addEventListener(
        "chx-typing-change",
        /** @type {EventListener} */ (this.#onChatTypingChange),
      );
      // Mark the chat conversation-driven, so a removed/empty selection shows its empty state instead
      // of the single-conversation default.
      /** @type {any} */ (next).conversationsPresent = true;
      if (this.#chat?.activeConversationId !== undefined) {
        this.activeConversationId = this.#chat.activeConversationId;
      }
      this.requestUpdate();
    }
  }

  #detachChat() {
    if (!this.#chat) return;
    this.#chat.removeEventListener(
      "chx-active-conversation-change",
      /** @type {EventListener} */ (this.#onChatActiveChange),
    );
    this.#chat.removeEventListener("chx-conversations-change", this.#onChatConversationsChange);
    this.#chat.removeEventListener(
      "chx-typing-change",
      /** @type {EventListener} */ (this.#onChatTypingChange),
    );
    this.#chat = null;
  }

  /** @param {CustomEvent<{conversationId: string | undefined}>} event */
  #onChatActiveChange = (event) => {
    this.activeConversationId = event.detail.conversationId;
  };

  #onChatConversationsChange = () => {
    this.requestUpdate();
  };

  /** @param {CustomEvent<{conversationId?: string, typing: boolean}>} event */
  #onChatTypingChange = (event) => {
    const { conversationId, typing } = event.detail;
    if (conversationId == null) return; // an unkeyed (single-conversation) signal has no row to target
    if (typing) this.#typingConversationIds.add(conversationId);
    else this.#typingConversationIds.delete(conversationId);
    this.requestUpdate();
  };

  /**
   * Selection (list → chat). Sets the highlight optimistically and dispatches the same
   * `chx-active-conversation-change` chx-chat already listens for on itself — never pokes
   * `chat.activeConversationId` directly, so the chat stays the single owner of that transition.
   * @param {string} conversationId
   */
  #activate(conversationId) {
    this.activeConversationId = conversationId;
    const target = this.#chat ?? this;
    target.dispatchEvent(
      new CustomEvent("chx-active-conversation-change", {
        detail: { conversationId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    // the event retargets to the row as it crosses out of chx-conversation-item's shadow root, so
    // this listener (inside *our* shadow tree) sees the row itself, not whatever was clicked in it
    const item = /** @type {HTMLElement} */ (event.target).closest("chx-conversation-item");
    const conversationId = /** @type {HTMLElement | null} */ (item)?.dataset.conversationId;
    if (conversationId != null) this.#activate(conversationId);
  };

  // Roving tabindex — mirrors md-list's own handler, but over our chx-conversation-item wrappers
  // (which md-list can't rove itself, see the component doc).
  /** @param {KeyboardEvent} event */
  #onKeydown = (event) => {
    const items = this.#items;
    if (!items.length) return;
    const focused = items.findIndex((el) => el.matches(":focus-within"));
    let next;
    if (event.key === "ArrowDown") next = focused < items.length - 1 ? focused + 1 : 0;
    else if (event.key === "ArrowUp") next = focused > 0 ? focused - 1 : items.length - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    items.forEach((el, n) => el.setTabIndex(n === next ? 0 : -1));
    items[next].focusInteractive();
  };

  /** The rendered rows, read live from the shadow tree — every one is a chx-conversation-item now
   *  that rows are authored here, so no duck-typing filter is needed.
   *  @returns {ConversationItemElement[]} */
  get #items() {
    return /** @type {ConversationItemElement[]} */ ([
      ...(this.renderRoot?.querySelectorAll("chx-conversation-item") ?? []),
    ]);
  }

  async #syncTabindices() {
    const items = this.#items;
    if (!items.length) return;
    await Promise.all(items.map((el) => el.updateComplete ?? Promise.resolve()));
    const focused = items.findIndex((el) => el.matches(":focus-within"));
    let index = focused;
    if (index < 0) {
      const activeIndex = items.findIndex((el) => el.active);
      index = activeIndex >= 0 ? activeIndex : 0;
    }
    items.forEach((el, n) => el.setTabIndex(n === index ? 0 : -1));
  }

  #renderItems() {
    return repeat(
      this.conversations,
      (conversation) => this.getItemKey(conversation),
      (conversation) => {
        const active = conversation.id === this.activeConversationId;
        const typing = this.#typingConversationIds.has(conversation.id);
        return html`
          <chx-conversation-item
            part=${itemPartNames(conversation, active, typing)}
            exportparts=${ITEM_EXPORTPARTS}
            data-conversation-id=${conversation.id}
            .title=${conversation.title ?? ""}
            .lastMessage=${conversation.lastMessagePreview ?? ""}
            .avatarUrl=${conversation.avatarUrl ?? conversation.participants?.[0]?.avatarUrl ?? ""}
            .unreadCount=${conversation.unreadCount ?? 0}
            .unread=${conversation.readState === "unread"}
            .active=${active}
            .typing=${typing}
          >
            <chx-typing-indicator slot="typing"></chx-typing-indicator>
          </chx-conversation-item>
        `;
      },
    );
  }

  render() {
    return html`
      <md-list part="list" @click=${this.#onClick} @keydown=${this.#onKeydown}>
        ${this.#renderItems()}
      </md-list>
    `;
  }
}
