/**
 * @typedef {import("lit").ReactiveControllerHost} ReactiveControllerHost
 */

/**
 * Which conversations the *other* side is currently typing in — a set keyed by `conversationId`
 * (`undefined`, the single-conversation flavor, is normalized to `""`). Per-conversation, so switching
 * the active conversation just reads that conversation's own state instead of needing a reset, and a
 * background conversation's typing can drive its own sidebar row. Still not per-*user* — multiple
 * simultaneous typers in one conversation collapse to a single boolean per conversation (a remaining
 * TODO). Latched per conversation so a value already in effect is never re-applied or re-announced.
 * Not a real `ReactiveController` — just a small stateful helper that calls back into `host` on change.
 */
export class TypingController {
  /** @type {ReactiveControllerHost & EventTarget} */
  #host;
  /** @type {Set<string>} */
  #typing = new Set();

  /** @param {ReactiveControllerHost & EventTarget} host */
  constructor(host) {
    this.#host = host;
  }

  /** @param {string} [conversationId] @returns {boolean} */
  isTyping(conversationId) {
    return this.#typing.has(conversationId ?? "");
  }

  /** @param {string | undefined} conversationId @param {boolean} isTyping */
  setTyping(conversationId, isTyping) {
    const key = conversationId ?? "";
    if (isTyping === this.#typing.has(key)) return;
    if (isTyping) this.#typing.add(key);
    else this.#typing.delete(key);
    this.#host.requestUpdate();
    this.#host.dispatchEvent(
      new CustomEvent("chx-typing-change", {
        detail: { typing: isTyping, conversationId },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
