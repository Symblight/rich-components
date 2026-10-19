import { VirtualListController } from "./VirtualListController.js";
import { RowMeasurer } from "../../components/infinity-scroll/RowMeasurer.js";
import { StickToBottom } from "../../components/infinity-scroll/StickToBottom.js";
import { LoadMoreController } from "./LoadMoreController.js";
import { VisibilityController } from "./VisibilityController.js";
import { PlainListController } from "./PlainListController.js";
import { PinController } from "./PinController.js";
import { BottomSentinelController } from "./BottomSentinelController.js";
import { distanceToBottom } from "../../utils/dom.js";

/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost} ReactiveControllerHost
 * @typedef {{
 *   getScrollElement: () => Element | undefined,
 *   getCanvasElement?: () => Element | undefined,
 *   rows: () => Iterable<HTMLElement>,
 *   getData: () => unknown[],
 *   getItemKey: (item: unknown, index: number) => string | number,
 *   getEstimateItemSize: () => (item: unknown, index: number) => number,
 *   getOverscan: () => number,
 *   getPaddingStart: () => number,
 *   getPaddingEnd: () => number,
 *   getScrollMargin: () => number,
 *   getUseScrollendEvent: () => boolean,
 *   getBuffer: () => number,
 *   getHasMore: () => boolean,
 *   getOnLoadMore: () => () => Promise<unknown>,
 *   onAwayFromBottomChange: (awayFromBottom: boolean) => void,
 *   getVisibilityThreshold: () => number,
 *   getShouldObserveItem: () => (item: unknown, index: number) => boolean,
 *   onItemVisible: (key: string) => void,
 *   emit: (type: string, detail?: unknown) => void,
 *   getNoVirtualization?: () => boolean,
 *   getPinEnabled?: () => boolean,
 *   getContentElement?: () => HTMLElement | undefined,
 *   getEndElement?: () => Element | undefined,
 *   getScrollBehavior?: () => "auto" | "smooth" | "instant",
 * }} InfinityScrollConfig
 */

/** px of leftover gap under which the view rests at the bottom */
const PIN_EPSILON = 1;
/** frames the size must hold steady at the bottom before the initial pin hands off */
const PIN_SETTLE_FRAMES = 5;

/**
 * Composes a bottom-anchored, lazily-prepending list. Two exclusive strategies:
 *  - virtualized (default): `VirtualListController` + `RowMeasurer` + `StickToBottom` + the
 *    initial-pin latch below;
 *  - `noVirtualization`: `PlainListController` (real DOM, `MutationObserver`-driven).
 * Shared by both: `LoadMoreController`, `VisibilityController`, `BottomSentinelController`,
 * `PinController`. `VirtualListController.sync()` runs in both modes — it's what disables
 * virtual-core under `noVirtualization`.
 * @implements {ReactiveController}
 */
export class InfinityScrollController {
  #host;
  /** @type {InfinityScrollConfig} */
  #config;
  #list;
  #measurer;
  #stick;
  #loader;
  #visibility;
  #plainList;
  #pin;
  #bottomSentinel;
  /** @type {number | null} */
  #scrollFrame = null;

  // Initial-pin latch: rows are measured in one batch, so the canvas reaches full height in a single
  // late jump the virtualizer's reconcile can't catch, leaving the first paint short of the bottom.
  // Until the first load settles, a rAF loop re-pins each frame; a user gesture ends it early.
  /** @type {number | null} */
  #pinFrame = null;
  #initialPinStarted = false;
  #initialPinDone = false;
  #lastTotalSize = -1;
  #settleFrames = 0;
  #disposed = false;
  /** @type {Element | null} */
  #gestureTarget = null;

  /** @param {ReactiveControllerHost} host @param {InfinityScrollConfig} config */
  constructor(host, config) {
    this.#host = host;
    this.#config = config;
    const getCanvasElement = config.getCanvasElement ?? (() => undefined);

    this.#bottomSentinel = new BottomSentinelController({
      getScrollElement: config.getScrollElement,
      getSentinel: config.getEndElement ?? (() => undefined),
      getBuffer: config.getBuffer,
      onChange: config.onAwayFromBottomChange,
    });

    this.#pin = new PinController({
      getScrollElement: () => /** @type {HTMLElement | undefined} */ (config.getScrollElement()),
      getContentElement: config.getContentElement ?? (() => undefined),
      getEnabled: config.getPinEnabled ?? (() => false),
      indexOfKey: (key) => this.#indexOfKey(key),
      getOffset: (index) => this.#pinOffset(index),
      scrollTo: (offset, behavior) => this.#scrollToPin(offset, behavior),
      getScrollBehavior: config.getScrollBehavior ?? (() => "auto"),
      onFollowChange: (following) => this.#list.setFollowing(following),
    });

    this.#list = new VirtualListController(host, {
      getScrollElement: config.getScrollElement,
      getEnabled: () => !this.#noVirtualization,
      getData: config.getData,
      getItemKey: config.getItemKey,
      getEstimateItemSize: config.getEstimateItemSize,
      getOverscan: config.getOverscan,
      getPaddingStart: config.getPaddingStart,
      getPaddingEnd: config.getPaddingEnd,
      getScrollMargin: config.getScrollMargin,
      getUseScrollendEvent: config.getUseScrollendEvent,
    });

    this.#stick = new StickToBottom({
      getVirtualizer: () => this.#list.virtualizer,
      getBuffer: config.getBuffer,
      getFollowing: () => this.#pin.following,
    });

    this.#measurer = new RowMeasurer({
      rows: config.rows,
      onRowReady: (row) => this.#list.virtualizer.measureElement(row),
      onRelease: () => this.#list.virtualizer.measureElement(null),
      afterMeasure: () => {
        // a measured height can move the end away from us
        this.#stick.follow();
        // the only maybeLoad() check in this mode — hostUpdated fires far more often than content
        // changes, and each extra check could start a separate onLoadMore()
        this.#loader.maybeLoad();
      },
    });

    this.#plainList = new PlainListController({
      getScrollElement: config.getScrollElement,
      getCanvasElement,
      rows: config.rows,
      getBuffer: config.getBuffer,
      // the only maybeLoad() check in this mode — scrollTop is post-correction here, unlike in hostUpdated
      onReconciled: () => this.#loader.maybeLoad(),
      getFollowing: () => this.#pin.following,
      getHold: () => this.#pin.pinning,
      beforeReconcile: () => this.#pin.refresh(),
    });

    this.#loader = new LoadMoreController({
      getScrollElement: config.getScrollElement,
      getData: config.getData,
      getHasMore: config.getHasMore,
      getOnLoadMore: config.getOnLoadMore,
      settled: () => host.updateComplete,
      emit: config.emit,
    });

    this.#visibility = new VisibilityController({
      rows: config.rows,
      getScrollElement: config.getScrollElement,
      getThreshold: config.getVisibilityThreshold,
      getData: config.getData,
      getShouldObserveItem: config.getShouldObserveItem,
      onItemVisible: config.onItemVisible,
    });

    host.addController(this);
  }

  get #noVirtualization() {
    return this.#config.getNoVirtualization?.() ?? false;
  }

  hostConnected() {
    this.#disposed = false;
    this.#loader.revive();
    this.#visibility.reset();
    if (this.#noVirtualization) {
      this.#plainList.reset(); // re-arms observers, re-pins if it was at the bottom
      return;
    }
    this.#measurer.reset();
    this.#stick.reset(); // a pre-disconnect size must not read as "grew"
  }

  hostUpdate() {
    this.#list.sync();
    // virtualized offsets are known before render, so a prepend's offset lands with the rows
    if (!this.#noVirtualization) this.#pin.refresh();
    // onFollowChange misses a scroll-mode flip
    this.#list.setFollowing(this.#pin.following);
  }

  hostUpdated() {
    this.#visibility.schedule();
    this.#bottomSentinel.sync();
    if (this.#noVirtualization) {
      this.#plainList.observe(); // idempotent
      this.#pin.update();
      return;
    }
    this.#stick.follow();
    this.#measurer.schedule();
    if (!this.#initialPinStarted && this.#list.virtualizer.options.count > 0) {
      this.#startInitialPin();
    }
    if (this.#initialPinStarted && !this.#initialPinDone) this.#pinCurrentFrame();
    this.#pin.update();
  }

  hostDisconnected() {
    if (this.#scrollFrame !== null) cancelAnimationFrame(this.#scrollFrame);
    this.#scrollFrame = null;
    this.#disposed = true;
    this.#loader.dispose();
    this.#visibility.dispose();
    this.#bottomSentinel.dispose();
    this.#pin.dispose();
    if (this.#noVirtualization) {
      this.#plainList.dispose();
      return;
    }
    this.#endInitialPin();
    this.#measurer.dispose();
  }

  #startInitialPin() {
    if (this.#initialPinStarted || this.#initialPinDone) return;
    this.#initialPinStarted = true;

    const el = this.#config.getScrollElement();
    if (el) {
      this.#gestureTarget = el;
      el.addEventListener("wheel", this.#onUserGesture, { passive: true });
      el.addEventListener("touchstart", this.#onUserGesture, { passive: true });
      el.addEventListener("keydown", this.#onUserGesture);
    }
    this.#pinFrame = requestAnimationFrame(this.#pinTick);
  }

  #endInitialPin() {
    this.#initialPinDone = true;
    if (this.#pinFrame !== null) cancelAnimationFrame(this.#pinFrame);
    this.#pinFrame = null;
    const el = this.#gestureTarget;
    if (el) {
      el.removeEventListener("wheel", this.#onUserGesture);
      el.removeEventListener("touchstart", this.#onUserGesture);
      el.removeEventListener("keydown", this.#onUserGesture);
      this.#gestureTarget = null;
    }
  }

  #onUserGesture = () => this.#endInitialPin();

  /** Re-pins against this render's committed canvas, before paint — no short-of-bottom frame. */
  #pinCurrentFrame() {
    const el = this.#config.getScrollElement();
    if (el && distanceToBottom(el) > PIN_EPSILON) {
      this.#list.virtualizer.scrollToEnd({ behavior: "auto" });
    }
  }

  #pinTick = () => {
    this.#pinFrame = null;
    if (this.#disposed || this.#initialPinDone) return;

    const el = this.#config.getScrollElement();
    const virtualizer = this.#list.virtualizer;
    if (!el) {
      this.#pinFrame = requestAnimationFrame(this.#pinTick);
      return;
    }

    const total = virtualizer.getTotalSize();
    const distance = distanceToBottom(el);
    if (distance > PIN_EPSILON) virtualizer.scrollToEnd({ behavior: "auto" });

    if (total === this.#lastTotalSize && distance <= PIN_EPSILON) {
      if (++this.#settleFrames >= PIN_SETTLE_FRAMES) {
        this.#endInitialPin();
        return;
      }
    } else {
      this.#settleFrames = 0;
      this.#lastTotalSize = total;
    }
    this.#pinFrame = requestAnimationFrame(this.#pinTick);
  };

  get virtualizer() {
    return this.#list.virtualizer;
  }

  /** The `noVirtualization` counterpart to `virtualizer`. */
  get plainList() {
    return this.#plainList;
  }

  get loading() {
    return this.#loader.loading;
  }

  /** Growth at the end is followed — always `true` outside `scroll-mode="pin-top"`. */
  get following() {
    return this.#pin.following;
  }

  /** From the tail — a pin is almost always the last item. @param {string | number} key */
  #indexOfKey(key) {
    const data = this.#config.getData();
    for (let index = data.length - 1; index >= 0; index--) {
      if (this.#config.getItemKey(data[index], index) === key) return index;
    }
    return -1;
  }

  /** The row's offset from the content top — the scrollTop that rests it at the top.
   *  @param {number} index @returns {number | undefined} */
  #pinOffset(index) {
    if (!this.#noVirtualization) return this.#list.virtualizer.getMeasurements()[index]?.start;

    const el = this.#config.getScrollElement();
    const rowTop = this.#plainList.getOffsetForIndex(index, "start");
    if (!el || rowTop === undefined) return undefined;
    const paddingTop = parseFloat(getComputedStyle(el).paddingBlockStart) || 0;
    return Math.max(0, Math.round(rowTop - paddingTop));
  }

  /** @param {number} offset @param {"auto" | "smooth" | "instant"} behavior */
  #scrollToPin(offset, behavior) {
    if (!this.#noVirtualization) {
      // through virtual-core, so its own offset never lags scrollTop
      this.#list.virtualizer.scrollToOffset(offset, { behavior });
      return;
    }
    this.#plainList.scrollToOffset(offset, { behavior });
    // a reconcile must restore onto the pin, not the pre-pin position
    this.#plainList.captureAnchor();
  }

  handleScroll = () => {
    this.#pin.handleScroll();
    // `atBottom` must flip in the same task as the scroll, or the next follow yanks the user down
    if (this.#noVirtualization) {
      this.#plainList.handleScroll();
    } else {
      this.#stick.refresh();
    }

    if (this.#scrollFrame !== null) return;
    this.#scrollFrame = requestAnimationFrame(() => {
      this.#scrollFrame = null;
      this.#loader.maybeLoad();
    });
  };

  /** `scroll-mode="pin-top"` only — call before the data carrying `key` is set. @param {string | number} key */
  pinToStart(key) {
    if (this.#initialPinStarted && !this.#initialPinDone) this.#endInitialPin();
    this.#pin.pin(key);
    this.#host.requestUpdate();
  }

  /** An explicit jump to the bottom re-engages following. */
  noteScrollToBottom() {
    this.#pin.noteScrollToBottom();
    if (!this.#noVirtualization) this.#stick.requestBottom();
  }

  /**
   * @param {number} index
   * @param {{align?: "auto" | "start" | "center" | "end", behavior?: "auto" | "smooth" | "instant"}} [options]
   */
  scrollToIndex(index, options) {
    if (this.#noVirtualization) {
      this.#plainList.scrollToIndex(index, options);
      return;
    }
    this.#list.virtualizer.scrollToIndex(index, options);
  }

  /** Releases observer registrations of rows that left the DOM. */
  releaseRows() {
    if (this.#noVirtualization) {
      this.#plainList.releaseRows();
    } else {
      this.#measurer.releaseRows();
    }
    this.#visibility.releaseRows();
  }

  /** Drops every cached measurement (after a global style/width change). No-op under `noVirtualization`. */
  remeasure() {
    if (this.#noVirtualization) return;
    this.#measurer.reset();
    this.virtualizer.measure();
    this.#host.requestUpdate();
  }

  /**
   * Forgets the measured heights of `keys` — the size cache never evicts, so an unbounded stream
   * should drop the keys it discards. Uses virtual-core's undocumented `itemSizeCache`; falls back
   * to `remeasure()` with a warning if that disappears.
   * @param {Iterable<string | number>} keys
   */
  dropMeasurements(keys) {
    if (keys == null || typeof keys[Symbol.iterator] !== "function") {
      throw new TypeError("dropMeasurements(keys) needs an iterable of item keys");
    }
    if (this.#noVirtualization) return;

    const virtualizer = /** @type {any} */ (this.virtualizer);
    if (typeof virtualizer.itemSizeCache?.delete !== "function") {
      console.warn(
        "[chx-infinity-scroll] virtual-core no longer exposes itemSizeCache; dropping every measurement instead",
      );
      this.remeasure();
      return;
    }

    let dropped = false;
    for (const key of keys) dropped = virtualizer.itemSizeCache.delete(key) || dropped;
    if (!dropped) return;

    virtualizer.itemSizeCacheVersion++;
    virtualizer.pendingMin = 0; // recompute measurements from the start
    this.#host.requestUpdate();
  }
}
