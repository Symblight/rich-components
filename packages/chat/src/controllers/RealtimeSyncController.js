/** @import { ChxRealtimeEvent } from "../types/realtime.js" */
/** @import { ChxConversation } from "../types/conversation.js" */

/**
 * Maps inbound `ChxRealtimeEvent`s (`adapter.subscribe`'s `onEvent`) to chat-owned state changes —
 * the one place that knows the event → action mapping, so `chx-chat` itself doesn't. No host
 * reference at all (unlike `TypingController`/`PaginationController`) — every action it can take
 * goes through one of the injected callbacks below, so there's nothing else to depend on.
 */
export class RealtimeSyncController {
  /** @type {() => string | undefined} */
  #getActiveConversationId;
  /** @type {(isTyping: boolean, conversationId?: string) => void} */
  #setTyping;
  /** @type {() => void} */
  #clearActiveConversation;
  /** @type {(messageId: string) => void} */
  #markMessageRead;
  /** @type {() => ChxConversation[]} */
  #getConversations;
  /** @type {(next: ChxConversation[]) => void} */
  #applyConversations;

  /**
   * @param {{
   *   getActiveConversationId: () => string | undefined,
   *   setTyping: (isTyping: boolean, conversationId?: string) => void,
   *   clearActiveConversation: () => void,
   *   markMessageRead: (messageId: string) => void,
   *   getConversations: () => ChxConversation[],
   *   applyConversations: (next: ChxConversation[]) => void,
   * }} callbacks
   */
  constructor({
    getActiveConversationId,
    setTyping,
    clearActiveConversation,
    markMessageRead,
    getConversations,
    applyConversations,
  }) {
    this.#getActiveConversationId = getActiveConversationId;
    this.#setTyping = setTyping;
    this.#clearActiveConversation = clearActiveConversation;
    this.#markMessageRead = markMessageRead;
    this.#getConversations = getConversations;
    this.#applyConversations = applyConversations;
  }

  /** @param {ChxRealtimeEvent} event */
  handleEvent(event) {
    switch (event.type) {
      case "typing":
        // Per-conversation now — no active-conversation filter. TypingController keys by
        // conversationId, so a background conversation's typing drives its own sidebar row while only
        // the active one reaches chx-message-list's typing slot (see pushMessageListProperties).
        this.#setTyping(event.isTyping, event.conversationId);
        // TODO: per-user tracking (multiple simultaneous typers) — still one boolean per conversation.
        break;
      case "conversation-removed": {
        if (event.conversationId === this.#getActiveConversationId()) {
          this.#clearActiveConversation();
        }
        this.#setTyping(false, event.conversationId); // drop any lingering typing state for it
        const list = this.#getConversations();
        const next = list.filter((conversation) => conversation.id !== event.conversationId);
        if (next.length !== list.length) this.#applyConversations(next);
        break;
      }
      case "conversation-added": {
        const list = this.#getConversations();
        if (!list.some((conversation) => conversation.id === event.conversation.id)) {
          this.#applyConversations([...list, event.conversation]);
        }
        break;
      }
      case "conversation-updated": {
        const list = this.#getConversations();
        if (list.some((conversation) => conversation.id === event.conversation.id)) {
          this.#applyConversations(
            list.map((conversation) =>
              conversation.id === event.conversation.id
                ? { ...conversation, ...event.conversation }
                : conversation,
            ),
          );
        }
        break;
      }
      case "presence": {
        const list = this.#getConversations();
        let changed = false;
        const next = list.map((conversation) => {
          if (!conversation.participants?.some((participant) => participant.id === event.userId)) {
            return conversation;
          }
          changed = true;
          return {
            ...conversation,
            participants: conversation.participants.map((participant) =>
              participant.id === event.userId
                ? { ...participant, isOnline: event.isOnline }
                : participant,
            ),
          };
        });
        if (changed) this.#applyConversations(next);
        break;
      }
      case "read":
        // Idempotently sets ChxMessage.readState to "read" for event.messageId — a per-message
        // effect. ChxConversation.readState/unreadCount patching is deliberately not done here: a
        // single ChxReadEvent (one messageId) doesn't unambiguously mean the whole conversation is
        // read, so conversation-level read state stays a TODO — see conversations.md. Not a toggle:
        // a ChxReadEvent is a one-way signal the transport can redeliver.
        this.#markMessageRead(event.messageId);
        break;
    }
  }
}
