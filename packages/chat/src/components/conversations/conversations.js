import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import "@symblight/wc-material/list";
import "../conversation-item/conversation-item.js";

import styles from "./conversations.css?inline";

/** @import { ChxConversation } from "../../types/conversation.js" */
/** @typedef {HTMLElement & {active?: boolean, typing?: boolean, setTabIndex?: (v: number) => void, focusInteractive?: () => void, getTabIndex?: () => number, updateComplete?: Promise<unknown>}} ConversationItemElement */

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
    buildItem: { attribute: false },
    getItemKey: { attribute: false },
  };

  /** @type {(HTMLElement & {conversations?: ChxConversation[], activeConversationId?: string}) | null} */
  #chat = null;
  /** @type {ChxConversation[]} */
  #privateConversations = [];
  /** @type {Map<string, {builderKey: unknown, element: ConversationItemElement}>} */
  #itemCache = new Map();
  /** @type {ConversationItemElement[]} */
  #renderedItems = [];
  /** conversationIds the other side is currently typing in — driven by the chat's chx-typing-change. @type {Set<string>} */
  #typingConversationIds = new Set();

  constructor() {
    super();
    /** @type {string} */
    this.for = "";
    /** @type {string | undefined} */
    this.activeConversationId = undefined;
    /** @type {((c: ChxConversation, previousElement?: HTMLElement) => HTMLElement) | undefined} */
    this.buildItem = undefined;
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
      // of the single-conversation default. See empty-state.md.
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
    const path = event.composedPath();
    const item = this.#renderedItems.find((el) => path.includes(el));
    const conversationId = item?.dataset.conversationId;
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
    items.forEach((el, n) => el.setTabIndex?.(n === next ? 0 : -1));
    items[next].focusInteractive?.();
  };

  /** @returns {(ConversationItemElement & {setTabIndex: (v: number) => void, focusInteractive: () => void})[]} */
  get #items() {
    return /** @type {any} */ (
      this.#renderedItems.filter(
        (el) => typeof el.setTabIndex === "function" && typeof el.focusInteractive === "function",
      )
    );
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

  /** @returns {ConversationItemElement[]} */
  #renderItems() {
    const conversations = this.conversations;
    const seen = new Set();
    const items = conversations.map((conversation) => {
      const key = this.getItemKey(conversation);
      seen.add(key);
      const element = this.#buildOrReuse(conversation, key);
      element.dataset.conversationId = conversation.id;
      if ("active" in element) element.active = conversation.id === this.activeConversationId;
      if ("typing" in element) element.typing = this.#typingConversationIds.has(conversation.id);
      return element;
    });
    for (const key of [...this.#itemCache.keys()]) if (!seen.has(key)) this.#itemCache.delete(key);
    this.#renderedItems = items;
    return items;
  }

  /**
   * @param {ChxConversation} conversation
   * @param {string} key
   * @returns {ConversationItemElement}
   */
  #buildOrReuse(conversation, key) {
    const cached = this.#itemCache.get(key);
    if (this.buildItem) {
      const previous = cached?.builderKey === this.buildItem ? cached.element : undefined;
      const element = /** @type {ConversationItemElement} */ (
        this.buildItem(conversation, previous)
      );
      this.#itemCache.set(key, { builderKey: this.buildItem, element });
      return element;
    }
    const element =
      /** @type {ConversationItemElement & {title: string, lastMessage: string, unreadCount: number, unread: boolean}} */ (
        cached && cached.builderKey === undefined
          ? cached.element
          : document.createElement("chx-conversation-item")
      );
    element.title = conversation.title ?? "";
    element.lastMessage = conversation.lastMessagePreview ?? "";
    element.unreadCount = conversation.unreadCount ?? 0;
    element.unread = conversation.readState === "unread";
    this.#itemCache.set(key, { builderKey: undefined, element });
    return element;
  }

  render() {
    return html`
      <md-list part="list" @click=${this.#onClick} @keydown=${this.#onKeydown}>
        ${this.#renderItems()}
      </md-list>
    `;
  }
}
