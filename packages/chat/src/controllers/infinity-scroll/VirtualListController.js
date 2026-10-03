import { VirtualizerController } from "@tanstack/lit-virtual";

/**
 * Band (px) within which virtual-core treats the view as pinned to the end. Small on purpose: inside
 * it `resizeItem` compensates without the backward-scroll guard, so a wide band jumps the list on
 * the first pixels of an upward gesture.
 */
const SCROLL_END_THRESHOLD = 8;

/** ms after a prepend during which a row starting at the offset is compensated (the measurement frames). */
const PREPEND_ADJUST_WINDOW = 1000;

/**
 * @typedef {{
 *   getScrollElement: () => Element | undefined,
 *   getEnabled: () => boolean,
 *   getData: () => unknown[],
 *   getItemKey: (item: unknown, index: number) => string | number,
 *   getEstimateItemSize: () => (item: unknown, index: number) => number,
 *   getOverscan: () => number,
 *   getPaddingStart: () => number,
 *   getPaddingEnd: () => number,
 *   getScrollMargin: () => number,
 *   getUseScrollendEvent: () => boolean,
 * }} VirtualListConfig
 */

/**
 * The virtualizer, bottom-anchored per TanStack's chat guide (`anchorTo: "end"` + `followOnAppend`).
 * Under `noVirtualization` it must be `enabled: false`, not merely un-synced: `VirtualizerController`
 * sits on the same host and would otherwise subscribe to the scroller and fight `PlainListController`.
 */
export class VirtualListController {
  /** @type {any} */
  #controller;
  /** @type {VirtualListConfig} */
  #config;
  /** @type {unknown[] | undefined} */
  #lastData;
  #prependAdjustUntil = 0;

  /** @param {import("lit").ReactiveControllerHost} host @param {VirtualListConfig} config */
  constructor(host, config) {
    this.#config = config;
    this.#controller = new VirtualizerController(host, {
      count: 0,
      getScrollElement: /** @type {any} */ (config.getScrollElement),
      getItemKey: (index) => config.getItemKey(config.getData()[index], index),
      estimateSize: (index) => config.getEstimateItemSize()(config.getData()[index], index),
      overscan: config.getOverscan(),
      paddingStart: config.getPaddingStart(),
      paddingEnd: config.getPaddingEnd(),
      scrollMargin: config.getScrollMargin(),
      // read once by virtual-core when it subscribes — not live, unlike the four above
      useScrollendEvent: config.getUseScrollendEvent(),
      enabled: config.getEnabled(),
      anchorTo: "end",
      followOnAppend: true,
      scrollEndThreshold: SCROLL_END_THRESHOLD,
    });
    this.virtualizer.shouldAdjustScrollPositionOnItemSizeChange = this.#shouldAdjustScroll;
  }

  /**
   * virtual-core's rule (compensate rows fully above the fold, not while scrolling back), plus a
   * prepend fix: the new older neighbour can drop a divider/author line from the row the anchor sits
   * on, right at the offset — so shortly after a prepend, rows starting at the offset count too.
   * @param {{key: string | number, start: number, size: number}} item
   * @param {number} _delta
   * @param {any} instance
   */
  #shouldAdjustScroll = (item, _delta, instance) => {
    const offset = instance.getScrollOffset() + instance.scrollAdjustments;
    if (!instance.itemSizeCache.has(item.key)) return item.start < offset; // first measurement
    if (performance.now() < this.#prependAdjustUntil) return item.start <= offset + 1;
    const size = instance.itemSizeCache.get(item.key);
    return item.start + size <= offset && instance.scrollDirection !== "backward";
  };

  /**
   * virtual-core's end-following on/off — both paths gate on `scrollEndThreshold`, and a negative
   * one never matches. Immediate, not in `sync()`: the append check reads the *previous* options.
   * @param {boolean} following
   */
  setFollowing(following) {
    const threshold = following ? SCROLL_END_THRESHOLD : -1;
    const virtualizer = this.virtualizer;
    if (virtualizer.options.scrollEndThreshold === threshold) return;
    virtualizer.setOptions({ ...virtualizer.options, scrollEndThreshold: threshold });
  }

  /** The underlying `@tanstack/virtual-core` instance. */
  get virtualizer() {
    return this.#controller.getVirtualizer();
  }

  /**
   * Call from `hostUpdate`: before render, and before virtual-core's own `hostUpdated` would
   * subscribe to the scroller — so disabling here always lands first.
   */
  sync() {
    const virtualizer = this.virtualizer;

    if (!this.#config.getEnabled()) {
      if (virtualizer.options.enabled || virtualizer.options.count !== 0) {
        virtualizer.setOptions({ ...virtualizer.options, enabled: false, count: 0 });
      }
      // a re-enable has to look like a fresh data set, since nothing was tracked while disabled
      this.#lastData = undefined;
      return;
    }

    const config = this.#config;
    const data = config.getData();
    const count = data.length;
    const overscan = config.getOverscan();
    const paddingStart = config.getPaddingStart();
    const paddingEnd = config.getPaddingEnd();
    const scrollMargin = config.getScrollMargin();

    // measurements are memoized against the stable getItemKey closure, so a same-length swap would
    // keep stale keys — bumping itemSizeCacheVersion re-derives them
    const dataChanged = data !== this.#lastData;
    // grew at the head: older history landed
    if (
      dataChanged &&
      this.#lastData &&
      count > this.#lastData.length &&
      data[0] !== this.#lastData[0]
    ) {
      this.#prependAdjustUntil = performance.now() + PREPEND_ADJUST_WINDOW;
    }
    this.#lastData = data;

    if (
      !virtualizer.options.enabled ||
      virtualizer.options.count !== count ||
      virtualizer.options.overscan !== overscan ||
      virtualizer.options.paddingStart !== paddingStart ||
      virtualizer.options.paddingEnd !== paddingEnd ||
      virtualizer.options.scrollMargin !== scrollMargin
    ) {
      virtualizer.setOptions({
        ...virtualizer.options,
        enabled: true,
        count,
        overscan,
        paddingStart,
        paddingEnd,
        scrollMargin,
      });
    }

    if (dataChanged) virtualizer.itemSizeCacheVersion++;
  }
}
