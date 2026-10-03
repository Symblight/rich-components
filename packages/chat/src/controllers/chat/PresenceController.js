/** @import { ReactiveControllerHost } from "lit" */

/**
 * Per-conversation "the other side is typing". A conversation-less signal means "in whatever is
 * active now", so it's dropped on the next such signal or an active-conversation switch.
 */
export class PresenceController {
  /** @type {ReactiveControllerHost & EventTarget} */
  #host;
  /** @type {() => string | undefined} */
  #getActiveConversationId;
  /** `undefined` (single-conversation) is keyed as `""`. @type {Set<string>} */
  #typing = new Set();
  /** Conversation the last conversation-less signal was attributed to. @type {string | undefined} */
  #unkeyedId;

  /**
   * @param {ReactiveControllerHost & EventTarget} host
   * @param {() => string | undefined} getActiveConversationId
   */
  constructor(host, getActiveConversationId) {
    this.#host = host;
    this.#getActiveConversationId = getActiveConversationId;
  }

  /** @param {string} [conversationId] defaults to the active one */
  isTyping(conversationId = this.#getActiveConversationId()) {
    return this.#typing.has(conversationId ?? "");
  }

  /** @param {boolean} isTyping @param {string} [conversationId] */
  setTyping(isTyping, conversationId) {
    if (conversationId !== undefined) {
      this.#set(conversationId, isTyping);
      return;
    }
    const active = this.#getActiveConversationId();
    this.#clearUnkeyed(active);
    this.#unkeyedId = isTyping ? active : undefined;
    this.#set(active, isTyping);
  }

  /** Call on an active-conversation switch — keyed state survives, an unkeyed signal doesn't. */
  handleConversationChange() {
    this.#clearUnkeyed();
  }

  /** @param {string} [except] still the same conversation — about to be re-set */
  #clearUnkeyed(except) {
    const previous = this.#unkeyedId;
    if (previous === undefined || previous === except) return;
    this.#unkeyedId = undefined;
    this.#set(previous, false);
  }

  /** Latched — an unchanged value is neither re-applied nor re-announced.
   *  @param {string | undefined} conversationId @param {boolean} isTyping */
  #set(conversationId, isTyping) {
    const key = conversationId ?? "";
    if (isTyping === this.#typing.has(key)) return;
    if (isTyping) this.#typing.add(key);
    else this.#typing.delete(key);
    this.#host.requestUpdate();
    this.#host.dispatchEvent(
      new CustomEvent("chx-typing-change", {
        detail: { typing: isTyping, conversationId },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
