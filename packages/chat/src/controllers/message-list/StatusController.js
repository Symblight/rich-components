/** @import { ChxMessage, ChxMessagePart } from "../../types/message.js" */

/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost} ReactiveControllerHost
 * @typedef {"empty" | "initial-loading" | "ready"} ChxListPhase
 * @typedef {{
 *   getMessages: () => ChxMessage[],
 *   getEmptyState: () => boolean,
 *   getLoading: () => boolean,
 * }} StatusConfig
 */

/**
 * What `chx-message-list` shows (`phase` + the `loadingHistory` overlay) and announces
 * (`role="status"` text). Host-bound so the streaming-edge diff runs in `hostUpdate`, not `render()`.
 * @implements {ReactiveController}
 */
export class StatusController {
  /** @type {StatusConfig} */
  #config;
  /** @type {Map<string, ChxMessagePart["state"]>} */
  #previousPartStates = new Map();
  #text = "";

  /** @param {ReactiveControllerHost} host @param {StatusConfig} config */
  constructor(host, config) {
    this.#config = config;
    host.addController(this);
  }

  /** @returns {ChxListPhase} */
  get phase() {
    if (this.#config.getEmptyState()) return "empty";
    if (this.#config.getLoading() && this.#config.getMessages().length === 0)
      return "initial-loading";
    return "ready";
  }

  /** Loading an older page with messages on screen — an overlay on `ready`. */
  get loadingHistory() {
    return this.#config.getLoading() && this.#config.getMessages().length > 0;
  }

  /** The live `role="status"` text. */
  get text() {
    return this.#text;
  }

  hostUpdate() {
    // sticky, never cleared: role="status" only re-announces on an actual text change
    if (this.phase === "empty") this.#text = "No conversation selected";
    else if (this.phase === "initial-loading") this.#text = "Loading messages";
    else if (this.loadingHistory) this.#text = "Loading older messages";

    /** @type {Map<string, ChxMessagePart["state"]>} */
    const currentPartStates = new Map();
    for (const message of this.#config.getMessages()) {
      for (const part of message.parts ?? []) {
        if (part.id) currentPartStates.set(part.id, part.state);
      }
    }

    // a streaming edge is the more recent event, so it outranks the loading text
    for (const [partId, state] of currentPartStates) {
      const previous = this.#previousPartStates.get(partId);
      if (previous !== "streaming" && state === "streaming") this.#text = "Assistant is responding";
      else if (previous === "streaming" && state !== "streaming") this.#text = "Response complete";
    }
    this.#previousPartStates = currentPartStates;
  }
}
