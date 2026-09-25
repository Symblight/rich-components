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
  /** @type {() => boolean} */
  #getEnabled;
  /** @type {(type: string, detail?: unknown) => void} */
  #emit;
  /** Previous render's readState per message id — the diff that un-defers a message that just
   *  became `"read"` elsewhere. @type {Map<string, ChxMessage["readState"]>} */
  #previousReadStates = new Map();
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

  /**
   * @param {{
   *   getMessages: () => ChxMessage[],
   *   getEnabled: () => boolean,
   *   emit: (type: string, detail?: unknown) => void,
   * }} config
   */
  constructor(config) {
    this.#getMessages = config.getMessages;
    this.#getEnabled = config.getEnabled;
    this.#emit = config.emit;
  }

  /** Wired straight to `chx-infinity-scroll.shouldObserveItem` — the master switch is checked here,
   *  so a message is never `observe()`d at all while read-tracking is off. @param {ChxMessage} message */
  shouldObserve = (message) => this.#getEnabled() && message?.readState === "unread";

  /** Wired straight to `chx-infinity-scroll.onItemVisible`. @param {string} key */
  handleItemVisible = (key) => {
    if (!this.#getEnabled()) return; // toggled off mid-session, with observers already attached
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
  };

  /**
   * Diffs `readState` against the previous pass and un-defers every message that just became
   * `"read"` — the durable half of "closing the loop". Called from the host's `willUpdate` on a
   * `messages` change, not lazily from `handleItemVisible`: an unread → read → unread round trip
   * between two visibility events would compare its endpoints, see "unread" both times, and leave
   * the message stuck in the fire-once set. Deliberately does not touch `#maxCoveredMessageId` — a
   * message re-armed to `"unread"` after being covered, then seen again, fires standalone (its own
   * index is at or behind the existing high-water mark) rather than retroactively re-covering
   * anything past it.
   */
  syncReadStates() {
    /** @type {Map<string, ChxMessage["readState"]>} */
    const currentReadStates = new Map();
    for (const message of this.#getMessages()) {
      currentReadStates.set(message.id, message.readState);
      if (this.#previousReadStates.get(message.id) === "unread" && message.readState === "read") {
        this.clearFired(message.id);
      }
    }
    this.#previousReadStates = currentReadStates;
  }

  /** Un-defers one message, so a later visibility event can report it again. Public for the same
   *  reason `read-tracking.md` specs it that way — it's the seam the deferral is asserted through.
   *  @param {string} messageId */
  clearFired(messageId) {
    this.#readMessageIds.delete(messageId);
  }

  /** Clears all state — call on reconnect, same posture `VisibilityController.reset()` has. */
  reset() {
    this.#readMessageIds.clear();
    this.#messagesById.clear();
    this.#previousReadStates = new Map();
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
