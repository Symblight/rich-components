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
  const index = messages.findLastIndex((message) => message.id === resolved.id);
  if (index === -1) return [...messages, resolved];
  return messages.with(index, resolved);
}

/** @type {WeakMap<import("../types/message.js").ChxMessage[], Map<string, number>>} */
const indexCache = new WeakMap();

/**
 * Message id → index, memoized per array reference — O(1) lookups across repeated reads.
 * @param {import("../types/message.js").ChxMessage[]} messages
 * @returns {Map<string, number>}
 */
export function indexById(messages) {
  let index = indexCache.get(messages);
  if (!index) {
    index = new Map(messages.map((message, i) => [message.id, i]));
    indexCache.set(messages, index);
  }
  return index;
}
