import { indexById } from "../../utils/messages.js";

/** @import { ChxMessage } from "../../types/message.js" */

/**
 * @typedef {{
 *   getMessages: () => ChxMessage[],
 *   getEnabled: () => boolean,
 *   emit: (type: string, detail?: unknown) => void,
 * }} ReadTrackingConfig
 */

/**
 * Fire-once `chx-message-read` for `readState: "unread"` messages. A visible unread message also
 * covers every still-unread one before it (a `maxId` watermark, like telegram-tt), so reading the
 * latest doesn't require scrolling past each earlier one.
 */
export class ReadTrackingController {
  /** @type {ReadTrackingConfig} */
  #config;
  /** previous pass's readState per id — see `syncReadStates` @type {Map<string, ChxMessage["readState"]>} */
  #previousReadStates = new Map();
  /** @type {Set<string>} */
  #readMessageIds = new Set();
  /** Highest message ever covered — an id, not an index, so a prepend can't desync it. @type {string | undefined} */
  #maxCoveredMessageId;

  /** @param {ReadTrackingConfig} config */
  constructor(config) {
    this.#config = config;
  }

  /** `chx-infinity-scroll.shouldObserveItem` — nothing is observed while tracking is off. @param {ChxMessage} message */
  shouldObserve = (message) => this.#config.getEnabled() && message?.readState === "unread";

  /** `chx-infinity-scroll.onItemVisible`. @param {string} key */
  handleItemVisible = (key) => {
    if (!this.#config.getEnabled()) return; // toggled off with observers still attached
    const messages = this.#config.getMessages();
    const byId = indexById(messages);
    const index = byId.get(key);
    if (index === undefined) return;
    if (messages[index].readState !== "unread" || this.#readMessageIds.has(key)) return;

    const previousMaxIndex = this.#maxCoveredMessageId
      ? (byId.get(this.#maxCoveredMessageId) ?? -1)
      : -1;

    /** @type {string[]} */
    const coveredIds = [];
    if (index > previousMaxIndex) {
      for (let i = previousMaxIndex + 1; i < index; i++) {
        const candidate = messages[i];
        if (candidate?.readState === "unread" && !this.#readMessageIds.has(candidate.id)) {
          this.#readMessageIds.add(candidate.id);
          coveredIds.push(candidate.id);
        }
      }
      this.#maxCoveredMessageId = key;
    }

    this.#readMessageIds.add(key);
    coveredIds.push(key);

    this.#config.emit("chx-message-read", {
      messageId: /** @type {string} */ (coveredIds.at(-1)),
      messageIds: coveredIds,
    });
  };

  /**
   * Un-defers messages that just became `"read"`. Called from `willUpdate` on a `messages` change,
   * not lazily from `handleItemVisible`: an unread → read → unread round trip between two visibility
   * events would compare endpoints, see "unread" twice, and leave the message stuck.
   */
  syncReadStates() {
    /** @type {Map<string, ChxMessage["readState"]>} */
    const currentReadStates = new Map();
    for (const message of this.#config.getMessages()) {
      currentReadStates.set(message.id, message.readState);
      if (this.#previousReadStates.get(message.id) === "unread" && message.readState === "read") {
        this.clearFired(message.id);
      }
    }
    this.#previousReadStates = currentReadStates;
  }

  /** @param {string} messageId */
  clearFired(messageId) {
    this.#readMessageIds.delete(messageId);
  }

  /** Call on reconnect. */
  reset() {
    this.#readMessageIds.clear();
    this.#previousReadStates = new Map();
    this.#maxCoveredMessageId = undefined;
  }
}
