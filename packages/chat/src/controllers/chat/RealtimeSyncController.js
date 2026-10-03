/** @import { ChxRealtimeEvent } from "../../types/realtime.js" */
/** @import { ChxConversation } from "../../types/conversation.js" */

/**
 * @typedef {{
 *   getActiveConversationId: () => string | undefined,
 *   setTyping: (isTyping: boolean, conversationId?: string) => void,
 *   clearActiveConversation: () => void,
 *   markMessageRead: (messageId: string) => void,
 *   getConversations: () => ChxConversation[],
 *   applyConversations: (next: ChxConversation[]) => void,
 * }} RealtimeSyncConfig
 */

/** Maps inbound `ChxRealtimeEvent`s (`adapter.subscribe`'s `onEvent`) to chat state changes. */
export class RealtimeSyncController {
  /** @type {RealtimeSyncConfig} */
  #config;

  /** @param {RealtimeSyncConfig} config */
  constructor(config) {
    this.#config = config;
  }

  /** @param {ChxRealtimeEvent} event */
  handleEvent(event) {
    const config = this.#config;
    switch (event.type) {
      case "typing":
        // TODO: per-user tracking — still one boolean per conversation
        config.setTyping(event.isTyping, event.conversationId);
        break;
      case "conversation-removed": {
        if (event.conversationId === config.getActiveConversationId()) {
          config.clearActiveConversation();
        }
        config.setTyping(false, event.conversationId);
        const list = config.getConversations();
        const next = list.filter((conversation) => conversation.id !== event.conversationId);
        if (next.length !== list.length) config.applyConversations(next);
        break;
      }
      case "conversation-added": {
        const list = config.getConversations();
        if (!list.some((conversation) => conversation.id === event.conversation.id)) {
          config.applyConversations([...list, event.conversation]);
        }
        break;
      }
      case "conversation-updated": {
        const list = config.getConversations();
        if (list.some((conversation) => conversation.id === event.conversation.id)) {
          config.applyConversations(
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
        const list = config.getConversations();
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
        if (changed) config.applyConversations(next);
        break;
      }
      case "read":
        // per-message only: one messageId doesn't mean the whole conversation is read (TODO)
        config.markMessageRead(event.messageId);
        break;
    }
  }
}
