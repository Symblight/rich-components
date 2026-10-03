/** @import { ChxMessage } from "../../types/message.js" */

const GROUP_GAP_MS = 5 * 60 * 1000;

/** @param {ChxMessage | undefined} message */
const isSystem = (message) => message?.parts?.[0]?.type === "system";

/**
 * Whether `messages[index]` and the next message belong to one same-author run.
 * @param {ChxMessage[]} messages
 * @param {number} index
 * @param {(message: ChxMessage, index: number) => boolean} hasDividerBefore
 */
function joins(messages, index, hasDividerBefore) {
  const previous = messages[index];
  const next = messages[index + 1];
  return (
    previous !== undefined &&
    next !== undefined &&
    previous.authorId !== undefined &&
    previous.authorId === next.authorId &&
    !isSystem(previous) &&
    !isSystem(next) &&
    next.createdAt - previous.createdAt < GROUP_GAP_MS &&
    // a date divider breaks the run even inside the time window
    !hasDividerBefore(next, index + 1)
  );
}

/**
 * A row's position in a run of consecutive same-author messages.
 * @param {ChxMessage[]} messages
 * @param {number} index
 * @param {(message: ChxMessage, index: number) => boolean} hasDividerBefore
 * @returns {{groupStart: boolean, groupEnd: boolean}}
 */
export function groupAt(messages, index, hasDividerBefore) {
  return {
    groupStart: !joins(messages, index - 1, hasDividerBefore),
    groupEnd: !joins(messages, index, hasDividerBefore),
  };
}
