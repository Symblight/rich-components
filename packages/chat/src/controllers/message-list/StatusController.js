/** @import { ChxMessage, ChxMessagePart } from "../../types/message.js" */

/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost} ReactiveControllerHost
 */

/** Which of `chx-message-list`'s mutually exclusive top-level renderings is due.
 * @typedef {"empty" | "initial-loading" | "ready"} ChxListPhase */

/**
 * Owns what `chx-message-list` is currently *showing* and what it announces: the `empty`/
 * `initial-loading`/`ready` phase that decides which top-level slot renders, the orthogonal
 * "loading an older page" overlay, and the `role="status"` text. Both used to be derived twice —
 * once in the element's own `#updateStatusText()` and again as the `when()` gates in its template —
 * which is two copies of the same precedence ladder to keep in sync by hand.
 *
 * A real host-bound `ReactiveController` (unlike `DividerController`/`ReadTrackingController`) for
 * one reason: the streaming start/complete edge needs a diff against the previous pass, and
 * `hostUpdate()` runs it right before `render()` — so the element no longer calls a side-effecting
 * method from inside its own `render()`.
 * @implements {ReactiveController}
 */
export class StatusController {
  /** @type {() => ChxMessage[]} */
  #getMessages;
  /** @type {() => boolean} */
  #getEmptyState;
  /** @type {() => boolean} */
  #getLoading;
  /** @type {Map<string, ChxMessagePart["state"]>} */
  #previousPartStates = new Map();
  #text = "";

  /**
   * @param {ReactiveControllerHost} host
   * @param {{
   *   getMessages: () => ChxMessage[],
   *   getEmptyState: () => boolean,
   *   getLoading: () => boolean,
   * }} config
   */
  constructor(host, config) {
    host.addController(this);
    this.#getMessages = config.getMessages;
    this.#getEmptyState = config.getEmptyState;
    this.#getLoading = config.getLoading;
  }

  /** @returns {ChxListPhase} */
  get phase() {
    if (this.#getEmptyState()) return "empty";
    if (this.#getLoading() && this.#getMessages().length === 0) return "initial-loading";
    return "ready";
  }

  /** Loading an *older* page, with messages already on screen — an overlay on `ready`, not a phase
   *  of its own, since the list keeps rendering underneath it. */
  get loadingHistory() {
    return this.#getLoading() && this.#getMessages().length > 0;
  }

  /** The live `role="status"` text. */
  get text() {
    return this.#text;
  }

  hostUpdate() {
    // Deliberately sticky — never cleared back to "". role="status" only re-announces on an actual
    // text change, so leaving the last message in place is what stops it repeating itself.
    if (this.phase === "empty") this.#text = "No conversation selected";
    else if (this.phase === "initial-loading") this.#text = "Loading messages";
    else if (this.loadingHistory) this.#text = "Loading older messages";

    /** @type {Map<string, ChxMessagePart["state"]>} */
    const currentPartStates = new Map();
    for (const message of this.#getMessages()) {
      for (const part of message.parts ?? []) {
        if (!part.id) continue;
        currentPartStates.set(part.id, part.state);
      }
    }

    // a streaming edge outranks the loading text above — it's the more recent event
    for (const [partId, state] of currentPartStates) {
      const previous = this.#previousPartStates.get(partId);
      if (previous !== "streaming" && state === "streaming") this.#text = "Assistant is responding";
      else if (previous === "streaming" && state !== "streaming") this.#text = "Response complete";
    }
    this.#previousPartStates = currentPartStates;
  }
}
