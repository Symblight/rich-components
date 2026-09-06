/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost} ReactiveControllerHost
 */

/**
 * Wraps a single ResizeObserver for one host element — generic, not tied to any particular use
 * case. `target` is resolved lazily on every `hostUpdated()` (not the constructor), since a
 * shadow-DOM element it points at may not exist yet on first connect, before the host's first
 * render commits — same reasoning as `IntersectionController`, which this mirrors.
 * @implements {ReactiveController}
 */
export class ResizeController {
  #target;
  #onResize;
  #observer;
  /** @type {Element | undefined} */
  #observedTarget;

  /**
   * @param {ReactiveControllerHost} host
   * @param {{
   *   target: () => Element | null | undefined,
   *   onResize: (entries: ResizeObserverEntry[]) => void,
   * }} options
   */
  constructor(host, { target, onResize }) {
    this.#target = target;
    this.#onResize = onResize;
    this.#observer = new ResizeObserver((entries) => this.#onResize(entries));
    host.addController(this);
  }

  hostUpdated() {
    const target = this.#target();
    if (!target || target === this.#observedTarget) return;
    if (this.#observedTarget) this.#observer.unobserve(this.#observedTarget);
    this.#observer.observe(target);
    this.#observedTarget = target;
  }

  hostDisconnected() {
    this.#observer.disconnect();
    // reset so a reconnect's hostUpdated() re-observes instead of matching the stale target
    this.#observedTarget = undefined;
  }
}
