/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost} ReactiveControllerHost
 */

/**
 * Wraps a single IntersectionObserver for one host element — generic, not tied to any particular
 * use case. `target`/`root` are resolved lazily on every `hostUpdated()` (not the constructor),
 * since a shadow-DOM element they point at may not exist yet on first connect, before the host's
 * first render commits.
 * @implements {ReactiveController}
 */
export class IntersectionController {
  #target;
  #root;
  #rootMargin;
  #onIntersect;
  /** @type {IntersectionObserver | undefined} */
  #observer;
  /** @type {Element | undefined} */
  #observedTarget;

  /**
   * @param {ReactiveControllerHost} host
   * @param {{
   *   target: () => Element | null | undefined,
   *   root: () => Element | null | undefined,
   *   rootMargin?: string,
   *   onIntersect: () => void,
   * }} options
   */
  constructor(host, { target, root, rootMargin, onIntersect }) {
    this.#target = target;
    this.#root = root;
    this.#rootMargin = rootMargin;
    this.#onIntersect = onIntersect;
    host.addController(this);
  }

  hostUpdated() {
    if (!this.#observer) {
      const root = this.#root();
      if (!root) return; // not rendered yet — retried on the next update
      this.#observer = new IntersectionObserver(
        (entries) => entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.#onIntersect()
          }
        }),
        { root, rootMargin: this.#rootMargin },
      );
    }
    const target = this.#target();
    if (!target || target === this.#observedTarget) return;
    if (this.#observedTarget) this.#observer.unobserve(this.#observedTarget);
    this.#observer.observe(target);
    this.#observedTarget = target;
  }

  hostDisconnected() {
    this.#observer?.disconnect();
    // reset so a reconnect's hostUpdated() re-observes instead of matching the stale target
    this.#observedTarget = undefined;
  }
}
