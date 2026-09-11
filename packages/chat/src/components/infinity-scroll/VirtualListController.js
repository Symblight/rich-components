import { VirtualizerController } from "@tanstack/lit-virtual";

/**
 * px within which the virtualizer treats the viewport as pinned to the end. Kept deliberately
 * small: inside this band its `resizeItem` takes the `wasAtEnd` branch, which compensates the
 * offset on every re-measurement *without* the backward-scroll guard the normal branch applies —
 * so a wide band makes the list jump during the first pixels of an upward gesture. `StickToBottom`'s
 * own wider epsilon is for the "user is near the bottom" question instead.
 */
const SCROLL_END_THRESHOLD = 8;

/**
 * The virtualizer itself, configured for a bottom-anchored list per TanStack's own chat guide:
 * `anchorTo: "end"` + `followOnAppend` — it holds the item under the fold still when the list grows
 * at either end, and follows new tail items while pinned to the end. `StickToBottom` covers the one
 * case this doesn't: a prepend landing into a not-yet-full viewport.
 */
export class VirtualListController {
  #controller;
  #getData;
  #getOverscan;

  /**
   * @param {import("lit").ReactiveControllerHost} host
   * @param {{
   *   getScrollElement: () => Element | undefined,
   *   getData: () => unknown[],
   *   getItemKey: (item: unknown, index: number) => string | number,
   *   getEstimateItemSize: () => (item: unknown, index: number) => number,
   *   getOverscan: () => number,
   * }} config
   */
  constructor(host, config) {
    this.#getData = config.getData;
    this.#getOverscan = config.getOverscan;

    this.#controller = new VirtualizerController(host, {
      count: 0,
      getScrollElement: /** @type {any} */ (config.getScrollElement),
      getItemKey: (index) => config.getItemKey(this.#getData()[index], index),
      estimateSize: (index) => config.getEstimateItemSize()(this.#getData()[index], index),
      overscan: this.#getOverscan(),
      anchorTo: "end",
      followOnAppend: true,
      scrollEndThreshold: SCROLL_END_THRESHOLD,
    });
  }

  get virtualizer() {
    return this.#controller.getVirtualizer();
  }

  /** must run before render, so rows lay out against the anchored offset */
  sync() {
    const virtualizer = this.virtualizer;
    const count = this.#getData().length;
    const overscan = this.#getOverscan();
    if (virtualizer.options.count !== count || virtualizer.options.overscan !== overscan) {
      virtualizer.setOptions({ ...virtualizer.options, count, overscan });
    }
  }
}
