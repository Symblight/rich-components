/**
 * @typedef {Object} ChxMessagePart
 * @property {string} id
 * @property {"text" | "attachment" | string} type
 * @property {string} [text]
 * @property {string} [html]
 * @property {unknown} [attachment]
 * @property {"streaming" | "done"} [state]
 */

/**
 * @typedef {Object} ChxMessage
 * @property {string} id
 * @property {string} [authorId]
 * @property {boolean} own
 * @property {number} createdAt
 * @property {"sending" | "sent" | "failed" | "cancelled"} [status]
 * @property {{message: string}} [error]
 * @property {string} [replyToId]
 * @property {ChxMessagePart[]} parts
 */

export {};
