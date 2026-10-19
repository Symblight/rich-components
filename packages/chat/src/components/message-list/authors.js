/** @import { ChxMessage, ChxMessageAuthor } from "../../types/message.js" */

/** @type {WeakMap<ChxMessage[], Map<string, ChxMessageAuthor>>} */
const authorCache = new WeakMap();

/** Last known author per authorId, memoized per array reference. @param {ChxMessage[]} messages */
function authorsById(messages) {
  let byId = authorCache.get(messages);
  if (!byId) {
    byId = new Map();
    for (const message of messages) {
      if (message.author && message.authorId !== undefined)
        byId.set(message.authorId, message.author);
    }
    authorCache.set(messages, byId);
  }
  return byId;
}

/**
 * The row's author, per `author-display`.
 * @param {ChxMessage} message
 * @param {ChxMessage[]} messages
 * @param {"none" | "incoming" | "all"} display
 */
export function authorFor(message, messages, display) {
  if (display !== "all" && (display !== "incoming" || message.own)) return undefined;
  // an optimistic send or a realtime event often carries only authorId — borrow the author from
  // another message by the same authorId
  if (message.author || message.authorId === undefined) return message.author;
  return authorsById(messages).get(message.authorId);
}
