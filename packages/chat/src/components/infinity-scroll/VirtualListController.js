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
  /** @type {any} */
  #controller;
  /** @type {() => unknown[]} */
  #getData;
  /** @type {() => number} */
  #getOverscan;
  /** @type {() => number} */
  #getPaddingStart;
  /** @type {() => number} */
  #getPaddingEnd;
  /** @type {() => number} */
  #getScrollMargin;

  /**
   * @param {import("lit").ReactiveControllerHost} host
   * @param {{
   *   getScrollElement: () => Element | undefined,
   *   getData: () => unknown[],
   *   getItemKey: (item: unknown, index: number) => string | number,
   *   getEstimateItemSize: () => (item: unknown, index: number) => number,
   *   getOverscan: () => number,
   *   getPaddingStart: () => number,
   *   getPaddingEnd: () => number,
   *   getScrollMargin: () => number,
   *   getUseScrollendEvent: () => boolean,
   * }} config
   */
  constructor(host, config) {
    this.#getData = config.getData;
    this.#getOverscan = config.getOverscan;
    this.#getPaddingStart = config.getPaddingStart;
    this.#getPaddingEnd = config.getPaddingEnd;
    this.#getScrollMargin = config.getScrollMargin;

    this.#controller = new VirtualizerController(host, {
      count: 0,
      getScrollElement: /** @type {any} */ (config.getScrollElement),
      getItemKey: (index) => config.getItemKey(this.#getData()[index], index),
      estimateSize: (index) => config.getEstimateItemSize()(this.#getData()[index], index),
      overscan: this.#getOverscan(),
      paddingStart: this.#getPaddingStart(),
      paddingEnd: this.#getPaddingEnd(),
      scrollMargin: this.#getScrollMargin(),
      useScrollendEvent: config.getUseScrollendEvent(),
      anchorTo: "end",
      followOnAppend: true,
      scrollEndThreshold: SCROLL_END_THRESHOLD,
    });
  }

  /** The underlying `@tanstack/virtual-core` instance. */
  get virtualizer() {
    return this.#controller.getVirtualizer();
  }

  /** must run before render, so rows lay out against the anchored offset */
  sync() {
    const virtualizer = this.virtualizer;
    const count = this.#getData().length;
    const overscan = this.#getOverscan();
    const paddingStart = this.#getPaddingStart();
    const paddingEnd = this.#getPaddingEnd();
    const scrollMargin = this.#getScrollMargin();

    if (
      virtualizer.options.count !== count ||
      virtualizer.options.overscan !== overscan ||
      virtualizer.options.paddingStart !== paddingStart ||
      virtualizer.options.paddingEnd !== paddingEnd ||
      virtualizer.options.scrollMargin !== scrollMargin
    ) {
      virtualizer.setOptions({
        ...virtualizer.options,
        count,
        overscan,
        paddingStart,
        paddingEnd,
        scrollMargin,
      });
    }
  }
}
