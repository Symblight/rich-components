/**
 * Replaces an existing entry sharing `incoming.id`, appends otherwise — never mutates `messages`.
 * @param {import("../types/message.js").ChxMessage[]} messages
 * @param {import("../types/message.js").ChxMessage} incoming
 * @param {string} [userId]
 * @returns {import("../types/message.js").ChxMessage[]}
 */
export function reconcileMessages(messages, incoming, userId) {
  const own = incoming.own ?? incoming.authorId === userId;
  const resolved = { ...incoming, own };
  const index = messages.findIndex((message) => message.id === resolved.id);
  if (index === -1) return [...messages, resolved];
  return messages.with(index, resolved);
}
