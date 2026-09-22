/** @import { ChxMessage } from "../../types/message.js" */

/**
 * Owns "has this eligible message been reported read yet" — the fire-once `Set`, the
 * `readState === "unread"` gate, an id → {message, index} lookup rebuilt only when `getMessages()`
 * returns a different array reference than last time, and the coverage sweep: a visible unread
 * message covers every still-unread message positioned before it, not just itself, so reading the
 * latest message doesn't require having scrolled past every one before it individually
 * (`.claude/plans/messages/read-tracking.md`, Decision 10, third revision — grounded in telegram-tt's
 * real `maxId` watermark). Constructed with narrow, named callbacks, no host reference at all — same
 * shape `RealtimeSyncController` already uses. Testable in isolation, no `chx-message-list` instance
 * needed.
 */
export class ReadTrackingController {
  /** @type {() => ChxMessage[]} */
  #getMessages;
  /** @type {(type: string, detail?: unknown) => void} */
  #emit;
  /** @type {Set<string>} */
  #readMessageIds = new Set();
  /** @type {Map<string, {message: ChxMessage, index: number}>} */
  #messagesById = new Map();
  /** @type {ChxMessage[] | undefined} */
  #lastMessages;
  /** highest-position message id any event has ever covered — an id, not a raw index, so a
   *  pagination prepend (which shifts every existing message's numeric position) can't desync it.
   *  @type {string | undefined} */
  #maxCoveredMessageId;

  /** @param {{getMessages: () => ChxMessage[], emit: (type: string, detail?: unknown) => void}} config */
  constructor(config) {
    this.#getMessages = config.getMessages;
    this.#emit = config.emit;
  }

  /** Wired to `chx-infinity-scroll.onItemVisible`. @param {string} key */
  handleItemVisible(key) {
    this.#syncMessagesById();
    const entry = this.#messagesById.get(key);
    if (!entry || entry.message.readState !== "unread" || this.#readMessageIds.has(key)) return;

    const messages = this.#getMessages();
    const previousMaxIndex = this.#maxCoveredMessageId
      ? (this.#messagesById.get(this.#maxCoveredMessageId)?.index ?? -1)
      : -1;

    /** @type {string[]} */
    const coveredIds = [];
    if (entry.index > previousMaxIndex) {
      for (let index = previousMaxIndex + 1; index < entry.index; index++) {
        const candidate = messages[index];
        if (
          candidate &&
          candidate.readState === "unread" &&
          !this.#readMessageIds.has(candidate.id)
        ) {
          this.#readMessageIds.add(candidate.id);
          coveredIds.push(candidate.id);
        }
      }
      this.#maxCoveredMessageId = key;
    }

    this.#readMessageIds.add(key);
    coveredIds.push(key);

    this.#emit("chx-message-read", {
      messageId: /** @type {string} */ (coveredIds.at(-1)),
      messageIds: coveredIds,
    });
  }

  /**
   * Un-defers a message whose `readState` newly became `"read"` — the durable half of "closing the
   * loop", called from `chx-message-list`'s own `willUpdate` diff. Deliberately does not touch
   * `#maxCoveredMessageId` — a message re-armed to `"unread"` after being covered, then seen again,
   * fires standalone (its own index is at or behind the existing high-water mark) rather than
   * retroactively re-covering anything past it.
   * @param {string} messageId
   */
  clearFired(messageId) {
    this.#readMessageIds.delete(messageId);
  }

  /** Clears all state — call on reconnect, same posture `VisibilityController.reset()` has. */
  reset() {
    this.#readMessageIds.clear();
    this.#messagesById.clear();
    this.#lastMessages = undefined;
    this.#maxCoveredMessageId = undefined;
  }

  #syncMessagesById() {
    const messages = this.#getMessages();
    if (messages === this.#lastMessages) return;
    this.#lastMessages = messages;
    this.#messagesById = new Map(
      messages.map((message, index) => [message.id, { message, index }]),
    );
  }
}
