/**
 * @typedef {import("lit").ReactiveControllerHost} ReactiveControllerHost
 */

/**
 * Whether the *other* side is currently typing/composing — a plain boolean, not per-conversation or
 * per-user (this package has no conversation/thread/multi-participant concept). Latched so a value
 * already in effect is never re-applied or re-announced. Not a real `ReactiveController` — no
 * lifecycle hook to hang off, just a small stateful helper that calls back into `host` on change.
 */
export class TypingController {
  #host;
  #typing = false;

  /** @param {ReactiveControllerHost & EventTarget} host */
  constructor(host) {
    this.#host = host;
  }

  isTyping() {
    return this.#typing;
  }

  /** @param {boolean} isTyping */
  setTyping(isTyping) {
    if (isTyping === this.#typing) return;
    this.#typing = isTyping;
    this.#host.requestUpdate();
    this.#host.dispatchEvent(
      new CustomEvent("chx-typing-change", { detail: { typing: isTyping }, bubbles: true, composed: true }),
    );
  }
}
