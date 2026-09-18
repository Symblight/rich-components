/**
 * @typedef {"system" | "user" | "assistant"} ChxRole
 */

/**
 * A participant in a conversation — separate from `ChxMessage.authorId` (a bare id, this package's
 * existing author-display stance everywhere else) because a conversation list genuinely needs
 * display metadata (name/avatar/presence) to render participant chips/avatars, unlike a single
 * message, which still defers all of that to the app via `messageElement`.
 * @typedef {Object} ChxUser
 * @property {string} id
 * @property {string} [displayName]
 * @property {string} [avatarUrl]
 * @property {boolean} [isOnline]
 * @property {ChxRole} [role] - the role this user plays in the conversation
 * @property {Record<string, unknown>} [metadata] - opaque bag, chx-chat never reads or interprets it
 */

/**
 * @typedef {Object} ChxConversation
 * @property {string} id
 * @property {string} [title]
 * @property {string} [subtitle]
 * @property {string} [avatarUrl] - takes precedence over participant avatars in a conversation list
 * @property {ChxUser[]} [participants]
 * @property {number} [unreadCount]
 * @property {"read" | "unread"} [readState]
 * @property {string} [lastMessageAt] - ISO 8601 date-time string
 * @property {string} [lastMessagePreview] - short last-message text for the conversation-list row's supporting line
 * @property {Record<string, unknown>} [metadata] - opaque bag, chx-chat never reads or interprets it
 */

export {};
