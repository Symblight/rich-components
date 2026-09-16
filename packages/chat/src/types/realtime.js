/** @typedef {import("./conversation.js").ChxConversation} ChxConversation */

/**
 * @typedef {Object} ChxTypingEvent
 * @property {"typing"} type
 * @property {string} conversationId
 * @property {string} userId - carried for forward-compat; not yet distinguished by `chx-chat` —
 *   TypingController is still one global boolean per conversation, not per-user
 * @property {boolean} isTyping
 */

/**
 * @typedef {Object} ChxPresenceEvent
 * @property {"presence"} type
 * @property {string} userId
 * @property {boolean} isOnline
 */

/**
 * @typedef {Object} ChxReadEvent
 * @property {"read"} type
 * @property {string} conversationId
 * @property {string} messageId
 */

/**
 * @typedef {Object} ChxConversationAddedEvent
 * @property {"conversation-added"} type
 * @property {ChxConversation} conversation
 */

/**
 * @typedef {Object} ChxConversationUpdatedEvent
 * @property {"conversation-updated"} type
 * @property {Partial<ChxConversation> & {id: string}} conversation - a patch, not a full replace
 */

/**
 * @typedef {Object} ChxConversationRemovedEvent
 * @property {"conversation-removed"} type
 * @property {string} conversationId
 */

/**
 * @typedef {ChxTypingEvent | ChxPresenceEvent | ChxReadEvent | ChxConversationAddedEvent | ChxConversationUpdatedEvent | ChxConversationRemovedEvent} ChxRealtimeEvent
 */

export {};
