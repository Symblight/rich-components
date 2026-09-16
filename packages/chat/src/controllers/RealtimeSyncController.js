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

  /**
   * @param {{
   *   getActiveConversationId: () => string | undefined,
   *   setTyping: (isTyping: boolean) => void,
   *   clearActiveConversation: () => void,
   * }} callbacks
   */
  constructor({ getActiveConversationId, setTyping, clearActiveConversation }) {
    this.#getActiveConversationId = getActiveConversationId;
    this.#setTyping = setTyping;
    this.#clearActiveConversation = clearActiveConversation;
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
      case "presence":
      case "read":
      case "conversation-added":
      case "conversation-updated":
        // TODO(chx-conversations): no home on chx-chat today.
        break;
    }
  }
}
