/** @import { ChxRealtimeEvent } from "../types/realtime.js" */

/**
 * Maps inbound `ChxRealtimeEvent`s (`adapter.subscribe`'s `onEvent`) to chat-owned state changes —
 * the one place that knows the event → action mapping, so `chx-chat` itself doesn't. No host
 * reference at all (unlike `TypingController`/`PaginationController`) — every action it can take
 * today goes through one of the three injected callbacks below, so there's nothing else to depend on.
 */
export class RealtimeSyncController {
  /** @type {() => string | undefined} */
  #getActiveConversationId;
  /** @type {(isTyping: boolean) => void} */
  #setTyping;
  /** @type {() => void} */
  #clearActiveConversation;
  /** @type {(messageId: string) => void} */
  #markMessageRead;

  /**
   * @param {{
   *   getActiveConversationId: () => string | undefined,
   *   setTyping: (isTyping: boolean) => void,
   *   clearActiveConversation: () => void,
   *   markMessageRead: (messageId: string) => void,
   * }} callbacks
   */
  constructor({ getActiveConversationId, setTyping, clearActiveConversation, markMessageRead }) {
    this.#getActiveConversationId = getActiveConversationId;
    this.#setTyping = setTyping;
    this.#clearActiveConversation = clearActiveConversation;
    this.#markMessageRead = markMessageRead;
  }

  /** @param {ChxRealtimeEvent} event */
  handleEvent(event) {
    switch (event.type) {
      case "typing":
        if (event.conversationId === this.#getActiveConversationId()) {
          this.#setTyping(event.isTyping); // still global/no-op-if-unchanged, see realtime-sync.md
        }
        // TODO: per-user tracking (multiple simultaneous typers) — TypingController is one boolean.
        break;
      case "conversation-removed":
        if (event.conversationId === this.#getActiveConversationId()) {
          this.#clearActiveConversation();
        }
        // TODO(chx-conversations): remove the conversation from `conversations` itself once that
        //   component owns conversation-list mutation.
        break;
      case "read":
        // Idempotently sets ChxMessage.readState to "read" for event.messageId — a per-message
        // effect, not ChxConversation.readState/unreadCount, which stay parked on <chx-conversations>
        // per realtime-sync.md; see .claude/plans/messages/read-tracking.md. Not a toggle: a
        // ChxReadEvent is a one-way signal and can be redelivered by the transport.
        this.#markMessageRead(event.messageId);
        break;
      case "presence":
      case "conversation-added":
      case "conversation-updated":
        // TODO(chx-conversations): no home on chx-chat today.
        break;
    }
  }
}
