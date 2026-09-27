/** @import { ChxMessage } from "../../types/message.js" */

const GROUP_GAP_MS = 5 * 60 * 1000;

/** @param {ChxMessage} message */
function isSystem(message) {
  return message.parts?.[0]?.type === "system";
}

/**
 * A message's position in a run of consecutive same-author messages. Host-less, same shape as
 * `DividerController` — the list asks per row, nothing is cached.
 */
export class GroupController {
  /** @type {() => ChxMessage[]} */
  #getMessages;
  /** @type {(message: ChxMessage, index: number) => boolean} */
  #hasDividerBefore;

  /** @param {{getMessages: () => ChxMessage[], hasDividerBefore: (message: ChxMessage, index: number) => boolean}} config */
  constructor(config) {
    this.#getMessages = config.getMessages;
    this.#hasDividerBefore = config.hasDividerBefore;
  }

  /** @param {number} index @returns {{groupStart: boolean, groupEnd: boolean}} */
  at(index) {
    const messages = this.#getMessages();
    return {
      groupStart: !this.#joins(messages, index - 1),
      groupEnd: !this.#joins(messages, index),
    };
  }

  /** Whether `messages[index]` and the one after it belong to the same run.
   * @param {ChxMessage[]} messages @param {number} index */
  #joins(messages, index) {
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
      !this.#hasDividerBefore(next, index + 1)
    );
  }
}
