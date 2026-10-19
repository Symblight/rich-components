import { VirtualListController } from "./VirtualListController.js";
import { RowMeasurer } from "../../components/infinity-scroll/RowMeasurer.js";
import { StickToBottom } from "../../components/infinity-scroll/StickToBottom.js";
import { InitialBottomLock } from "../../components/infinity-scroll/InitialBottomLock.js";
import { BottomLatch } from "../../components/infinity-scroll/BottomLatch.js";
import { GestureGrace } from "../../components/infinity-scroll/GestureGrace.js";
import { LoadMoreController } from "./LoadMoreController.js";
import { VisibilityController } from "./VisibilityController.js";
import { PlainListController } from "./PlainListController.js";
import { PinController } from "./PinController.js";
import { BottomSentinelController } from "./BottomSentinelController.js";
import { distanceToBottom, isScrollGesture } from "../../utils/dom.js";

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
 *   getFooterElement?: () => Element | undefined,
 *   getFollowBehavior?: () => "auto" | "smooth" | "instant",
 * }} InfinityScrollConfig
 */

/**
 * Composes a bottom-anchored, lazily-prepending list. Two exclusive strategies:
 *  - virtualized (default): `VirtualListController` + `RowMeasurer` + `StickToBottom` +
 *    `InitialBottomLock`;
 *  - `noVirtualization`: `PlainListController` (real DOM, `MutationObserver`-driven).
 * Shared by both: `LoadMoreController`, `VisibilityController`, `BottomSentinelController`,
 * `PinController`, and the `BottomLatch` and `GestureGrace` both strategies read.
 * `VirtualListController.sync()` runs in both modes — it's what disables
 * virtual-core under `noVirtualization`. The only class that branches on the mode.
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
  #initialLock;
  /** @type {number | null} */
  #scrollFrame = null;
  /** @type {ResizeObserver | undefined} */
  #footerObserver;
  /** @type {Element | undefined} */
  #footer;
  #disposed = false;
  /** "At the bottom" for following, updated once per scroll event for whichever strategy is active. */
  #latch = new BottomLatch();
  #grace = new GestureGrace(() => this.#resume());
  /** A mouse/pen button held on the content — selecting text, which a follow would drag along. */
  #pointerHeld = false;
  /** Text in the list is selected — following would move it out from under the user. */
  #selectionHeld = false;

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
      scrollTo: (offset) => this.#scrollToPin(offset),
      onFollowChange: () => this.#syncFollowing(),
      isUserScroll: () => this.#grace.recent,
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
      latch: this.#latch,
      getFollowing: () => this.#pin.following,
      isPaused: () => this.#paused,
    });

    this.#initialLock = new InitialBottomLock({
      getScrollElement: config.getScrollElement,
      getVirtualizer: () => this.#list.virtualizer,
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
      getFollowBehavior: config.getFollowBehavior,
      getEndElement: config.getEndElement,
      beforeReconcile: () => this.#pin.refresh(),
      latch: this.#latch,
      isPaused: () => this.#paused,
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

  /** virtual-core's own end-following (append, resize at the end) is off while paused too. */
  #syncFollowing() {
    this.#list.setFollowing(this.#pin.following && !this.#paused);
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
    this.#syncFollowing();
  }

  hostUpdated() {
    this.#observeFooter();
    this.#visibility.schedule();
    this.#bottomSentinel.sync();
    if (this.#noVirtualization) {
      this.#plainList.observe(); // idempotent
      this.#pin.update();
      return;
    }
    this.#stick.follow();
    this.#measurer.schedule();
    if (this.#list.virtualizer.options.count > 0) this.#initialLock.start();
    this.#initialLock.pinCurrentFrame();
    this.#pin.update();
  }

  hostDisconnected() {
    if (this.#scrollFrame !== null) cancelAnimationFrame(this.#scrollFrame);
    this.#scrollFrame = null;
    this.#grace.dispose();
    this.#footerObserver?.disconnect();
    this.#footer = undefined;
    this.#releasePointer();
    this.#releaseSelection();
    this.#disposed = true;
    this.#loader.dispose();
    this.#visibility.dispose();
    this.#bottomSentinel.dispose();
    this.#initialLock.end();
    if (this.#noVirtualization) {
      this.#plainList.dispose();
      return;
    }
    this.#measurer.dispose();
  }

  /** Only for rendering the virtualized rows — scrolling goes through the methods below. */
  get virtualizer() {
    return this.#list.virtualizer;
  }

  get loading() {
    return this.#loader.loading;
  }

  /** Growth at the end is followed right now: the mode allows it, and the user hasn't scrolled away. */
  get following() {
    return this.#pin.following && this.#latch.atBottom && !this.#paused;
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

  /** @param {number} offset */
  #scrollToPin(offset) {
    if (!this.#noVirtualization) {
      // through virtual-core, so its own offset never lags scrollTop
      this.#list.virtualizer.scrollToOffset(offset, { behavior: "auto" });
      return;
    }
    this.#plainList.scrollToOffset(offset, { behavior: "auto" });
    // a reconcile must restore onto the pin, not the pre-pin position
    this.#plainList.captureAnchor();
  }

  /**
   * The one gesture handler, bound passive on the scroller for `wheel`/`touchstart`/`pointerdown`
   * and called for `keydown`. A scroll gesture cancels our in-flight smooth scroll, and one that may
   * go up holds our follows off for its first scroll event: a programmatic scroll in between
   * cancels the browser's own wheel animation.
   */
  userGesture = {
    passive: true,
    /** @param {Event} event */
    handleEvent: (event) => {
      // any interaction ends the initial pin, even one that can't scroll
      if (this.#initialLock.active) this.#initialLock.end();
      this.#holdForPointer(event);
      if (!isScrollGesture(event, this.#config.getScrollElement())) return;
      this.#grace.note();
      // keys drive their own scrolls (roving focus), which a cancel or pause would fight
      if (event.type === "keydown") return;
      this.#cancelProgrammaticScroll();
      // a wheel down can't leave the bottom, so following needn't wait for it
      if (event.type !== "wheel" || /** @type {WheelEvent} */ (event).deltaY < 0) {
        this.#grace.pause();
        this.#syncFollowing();
      }
    },
  };

  #cancelProgrammaticScroll() {
    if (this.#noVirtualization) {
      this.#plainList.stopFollow();
      return;
    }
    // virtual-core re-aims an in-flight scrollTo* each frame for up to 5s, against the gesture;
    // `scrollState` is private in its typings, so a rename only loses this cancel
    /** @type {any} */ (this.#list.virtualizer).scrollState = null;
    this.#stick.cancelRequest();
  }

  /** The gesture didn't leave the bottom (e.g. a nested scroller took it): catch up on any growth. */
  /** Idempotent — (re)observes the `footer` slot as it mounts. */
  #observeFooter() {
    const footer = this.#config.getFooterElement?.();
    if (footer === this.#footer) return;
    this.#footerObserver ??= new ResizeObserver(this.#followFooter);
    if (this.#footer) this.#footerObserver.unobserve(this.#footer);
    this.#footer = footer;
    if (footer) this.#footerObserver.observe(footer);
  }

  /** The footer (typing/streaming indicators) sits outside both strategies' rows, so neither
   *  follows it on its own. */
  #followFooter = () => {
    const el = this.#config.getScrollElement();
    if (this.#disposed || !el || !this.following) return;
    if (this.#noVirtualization) {
      this.#plainList.resumeFollow();
      return;
    }
    // the DOM, not isAtEnd(): virtual-core's end is the last row, before the footer
    if (distanceToBottom(el) <= 1) return;
    this.#stick.requestBottom();
    this.#list.virtualizer.scrollToEnd({ behavior: this.#config.getFollowBehavior?.() ?? "auto" });
  };

  /** Follows hold off while a gesture's grace runs, a button is held on the content, or text in
   *  the list is selected. */
  get #paused() {
    return this.#grace.paused || this.#pointerHeld || this.#selectionHeld;
  }

  /** @param {Event} event */
  #holdForPointer(event) {
    if (event.type !== "pointerdown") return;
    const { pointerType, button, target } = /** @type {PointerEvent} */ (event);
    // touch is a scroll gesture already; the scroller itself is its scrollbar
    if (pointerType === "touch" || button !== 0 || target === this.#config.getScrollElement())
      return;
    this.#pointerHeld = true;
    this.#syncFollowing();
    addEventListener("pointerup", this.#onPointerRelease);
    addEventListener("pointercancel", this.#onPointerRelease);
  }

  /** A plain click resumes; a selection holds following until it's cleared or `scrollToBottom()`. */
  #onPointerRelease = () => {
    this.#releasePointer();
    if (this.#hasSelection()) {
      this.#selectionHeld = true;
      document.addEventListener("selectionchange", this.#onSelectionChange);
      return;
    }
    this.#resume();
  };

  #onSelectionChange = () => {
    if (this.#hasSelection()) return;
    this.#releaseSelection();
    this.#resume();
  };

  #releaseSelection() {
    this.#selectionHeld = false;
    document.removeEventListener("selectionchange", this.#onSelectionChange);
  }

  /** Chromium keeps a shadow tree's selection off `document.getSelection()`. */
  #hasSelection() {
    const root = /** @type {any} */ (this.#config.getScrollElement()?.getRootNode());
    return Boolean((root?.getSelection?.() ?? getSelection())?.toString());
  }

  #releasePointer() {
    this.#pointerHeld = false;
    removeEventListener("pointerup", this.#onPointerRelease);
    removeEventListener("pointercancel", this.#onPointerRelease);
  }

  #resume() {
    if (this.#disposed) return;
    this.#syncFollowing();
    if (this.#paused) return; // the other hold is still on
    if (this.#noVirtualization) this.#plainList.resumeFollow();
    else this.#stick.follow();
  }

  handleScroll = () => {
    this.#pin.handleScroll();
    // `atBottom` must flip in the same task as the scroll, or the next follow yanks the user down
    const el = this.#config.getScrollElement();
    const contentChanged = this.#plainList.takeContentChanged();
    const left = el
      ? this.#latch.update(el, this.#config.getBuffer(), {
          layoutJumps: this.#noVirtualization && !this.#grace.recent,
          contentChanged,
          held: this.#pointerHeld,
        })
      : false;
    if (this.#noVirtualization) {
      this.#plainList.handleScroll();
    } else {
      this.#stick.refresh(left);
    }

    if (this.#scrollFrame !== null) return;
    this.#scrollFrame = requestAnimationFrame(() => {
      this.#scrollFrame = null;
      this.#loader.maybeLoad();
    });
  };

  /** `scroll-mode="pin-top"` only — call before the data carrying `key` is set. @param {string | number} key */
  pinToStart(key) {
    if (this.#initialLock.active) this.#initialLock.end();
    this.#pin.pin(key);
    this.#host.requestUpdate();
  }

  /** An explicit jump to the bottom — re-engages following. @param {"auto" | "smooth" | "instant"} behavior */
  scrollToBottom(behavior) {
    this.#pin.noteScrollToBottom();
    this.#releaseSelection(); // asked for the end, selection or not
    if (this.#noVirtualization) {
      // rests the content's end, footer included, at the bottom edge
      this.#plainList.scrollToBottom(behavior);
      return;
    }
    this.#stick.requestBottom();
    // aims the last row's end at the real max offset, so it clears the footer too, and its
    // reconcile re-aims while rows are measured on the way
    this.#list.virtualizer.scrollToEnd({ behavior });
  }

  /** @returns {number | undefined} */
  getScrollOffset() {
    if (this.#noVirtualization) return this.#plainList.getScrollOffset();
    return this.#list.virtualizer.scrollOffset ?? undefined;
  }

  /** @param {number} offset @param {{behavior?: "auto" | "smooth" | "instant"}} [options] */
  scrollToOffset(offset, options) {
    if (this.#noVirtualization) {
      this.#plainList.scrollToOffset(offset, options);
      return;
    }
    this.#list.virtualizer.scrollToOffset(offset, options);
  }

  /** @param {number} index @param {"start" | "center" | "end"} [align] @returns {number | undefined} */
  getOffsetForIndex(index, align = "start") {
    if (this.#noVirtualization) return this.#plainList.getOffsetForIndex(index, align);
    return this.#list.virtualizer.getOffsetForIndex(index, align)?.[0];
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
    this.#list.virtualizer.measure();
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

    const virtualizer = /** @type {any} */ (this.#list.virtualizer);
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
