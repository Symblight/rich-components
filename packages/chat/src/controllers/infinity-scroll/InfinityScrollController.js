import { VirtualListController } from "./VirtualListController.js";
import { RowMeasurer } from "../../components/infinity-scroll/RowMeasurer.js";
import { StickToBottom } from "../../components/infinity-scroll/StickToBottom.js";
import { LoadMoreController } from "./LoadMoreController.js";
import { VisibilityController } from "./VisibilityController.js";
import { PlainListController } from "./PlainListController.js";
import { PinController } from "./PinController.js";
import { BottomSentinelController } from "./BottomSentinelController.js";

/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost} ReactiveControllerHost
 */

/**
 * Composes the pieces of a bottom-anchored, lazily-prepending list into one `ReactiveController`.
 * Two mutually exclusive strategies share the rest of the composition (`LoadMoreController`/
 * `VisibilityController` are DOM-only and don't care which is active):
 *
 *  - virtualized (default): {@link VirtualListController} (`anchorTo: "end"` + `followOnAppend`) +
 *    {@link RowMeasurer} (measuring rows once their content actually exists) + {@link StickToBottom}
 *    (the one edge case `anchorTo`/`followOnAppend` don't cover) + the initial-pin latch below.
 *  - `noVirtualization`: {@link PlainListController} — every row is already real DOM at its real
 *    height, so there's nothing to window or measure; it owns anchor-restoration-on-prepend and
 *    stick-to-bottom itself, `MutationObserver`-driven.
 *
 * The idle strategy is switched *off*, not just left unread: virtual-core's controller runs on this
 * host either way, so `VirtualListController.sync()` disables it outright under `noVirtualization`
 * (see its own doc for what it would do otherwise).
 *  - {@link LoadMoreController}    asking the consumer for older items, owns `loading`
 *  - {@link VisibilityController}  reporting rows that scrolled into view, owns `onItemVisible`
 *  - {@link BottomSentinelController} `onAwayFromBottomChange`, one IntersectionObserver for both modes
 *  - {@link PinController}         `scroll-mode="pin-top"`: pin-on-send, reserved space, follow state
 *
 * The host supplies data/DOM getters and mirrors `loading` for rendering. No styling lives here.
 * @implements {ReactiveController}
 */
export class InfinityScrollController {
  #host;
  #list;
  #measurer;
  #stick;
  #loader;
  #visibility;
  #plainList;
  #pin;
  /** @type {() => Element | undefined} */
  #getScrollElement;
  /** @type {() => boolean} */
  #getNoVirtualization;
  /** @type {() => unknown[]} */
  #getData;
  /** @type {(item: unknown, index: number) => string | number} */
  #getItemKey;
  /** @type {number | null} */
  #scrollFrame = null;

  // ---- initial-pin latch --------------------------------------------------
  // We measure every visible row in one batch, so the canvas reaches its full height in a single
  // late jump — too late for the virtualizer's own reconcile loop to reconverge, which leaves the
  // first paint resting ~one estimate short of the bottom (the reference avoids this only by luck:
  // its measurements happen to land staggered across frames, so its reconcile keeps catching the
  // growing max). Until the first load has settled at the bottom, a dedicated rAF loop re-pins each
  // frame; keeping the DOM genuinely at the bottom also keeps `atBottom` true, so the ordinary
  // StickToBottom path takes over seamlessly once we hand off. A real user gesture ends it early.
  /** @type {number | null} */
  #pinFrame = null;
  #initialPinStarted = false;
  #initialPinDone = false;
  #lastTotalSize = -1;
  #settleFrames = 0;
  #disposed = false;
  /** @type {Element | null} */
  #gestureTarget = null;

  #bottomSentinel;

  /**
   * @param {ReactiveControllerHost} host
   * @param {{
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
   * }} config
   */
  constructor(host, config) {
    this.#host = host;
    this.#getScrollElement = config.getScrollElement;
    this.#bottomSentinel = new BottomSentinelController({
      getScrollElement: config.getScrollElement,
      getSentinel: config.getEndElement ?? (() => undefined),
      getBuffer: config.getBuffer,
      onChange: config.onAwayFromBottomChange,
    });
    this.#getNoVirtualization = config.getNoVirtualization ?? (() => false);
    this.#getData = config.getData;
    this.#getItemKey = config.getItemKey;
    const getCanvasElement = config.getCanvasElement ?? (() => undefined);

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
      getEnabled: () => !this.#getNoVirtualization(),
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
        // a measured height can move the end away from us, so re-check in the same frame (the
        // virtualizer compensates on its own when it can)
        this.#stick.follow();
        // The only place maybeLoad() is checked in this branch — same reasoning as
        // PlainListController's onReconciled (see its own doc): hostUpdated() below no longer
        // checks directly, since it fires far more often than content actually changes (the
        // initial-pin latch's own multi-frame settle loop, plus VirtualizerController's own
        // internal re-renders on each measureElement() call above) — each of those was an extra,
        // premature scrollTop check, and with the old post-load re-chain removed (see
        // LoadMoreController's own doc), those extras were free to each fire a real, separate
        // onLoadMore() call instead of just redundantly re-confirming one. This fires once per
        // batch of newly-measured rows instead — still more often than PlainListController's own
        // mutation-driven reconcile, since virtual-core's internal state changes on its own
        // schedule too, but far less often than every render.
        this.#loader.maybeLoad();
      },
    });

    this.#plainList = new PlainListController({
      getScrollElement: config.getScrollElement,
      getCanvasElement,
      rows: config.rows,
      getBuffer: config.getBuffer,
      // hostUpdated() below deliberately does not call maybeLoad() itself in this mode — this is
      // the only place it gets checked, and only once scrollTop is genuinely post-correction. See
      // hostUpdated()'s own comment for why the direct call was the actual bug.
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

  // -------------------------------------------------------------- lifecycle

  hostConnected() {
    this.#disposed = false;
    this.#loader.revive();
    // the teardown disconnected the IntersectionObserver; rows must re-register
    this.#visibility.reset();
    if (this.#getNoVirtualization()) {
      // the teardown disconnected the MutationObserver/ResizeObserver; re-arms and, if the view was
      // pinned before disconnecting, re-pins (reattaching resets scrollTop)
      this.#plainList.reset();
      return;
    }
    // the teardown disconnected the ResizeObserver; rows must re-register
    this.#measurer.reset();
    // a stale pre-disconnect size snapshot must not read as "grew" once reconnected
    this.#stick.reset();
  }

  hostUpdate() {
    // runs in both modes: under `noVirtualization` this is what puts virtual-core into `enabled:
    // false` before it can subscribe to the scroll element — see VirtualListController.sync()
    this.#list.sync();
    // virtualized offsets are known before render, so a prepend's grown offset lands in the same
    // layout as the rows, ahead of virtual-core's anchor scroll
    if (!this.#getNoVirtualization()) this.#pin.refresh();
    // onFollowChange misses a scroll-mode flip, so re-apply the effective state every pass
    this.#list.setFollowing(this.#pin.following);
  }

  hostUpdated() {
    this.#visibility.schedule();
    this.#bottomSentinel.sync();
    if (this.#getNoVirtualization()) {
      // idempotent — starts observing the first time the canvas exists, no-op afterwards; the
      // MutationObserver/ResizeObserver it installs handle every reconcile on their own from here.
      this.#plainList.observe();
      this.#pin.update();
      return;
    }
    // Deliberately does NOT call maybeLoad() here — see RowMeasurer's own afterMeasure callback
    // above, the only place it's checked in this branch now.
    this.#stick.follow();
    this.#measurer.schedule();
    // once the list first has content, keep it welded to the bottom through the measurement settle
    if (!this.#initialPinStarted && this.#list.virtualizer.options.count > 0)
      this.#startInitialPin();
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
    if (this.#getNoVirtualization()) {
      this.#plainList.dispose();
      return;
    }
    this.#endInitialPin();
    this.#measurer.dispose();
  }

  // ---------------------------------------------------------- initial pin

  #startInitialPin() {
    if (this.#initialPinStarted || this.#initialPinDone) return;
    this.#initialPinStarted = true;

    const el = this.#getScrollElement();
    if (el) {
      this.#gestureTarget = el;
      // any deliberate user input hands scrolling straight back to the normal path
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

  /**
   * Re-pins to the true bottom against the canvas height already committed for the current render.
   * Safe to call from `hostUpdated` (before paint) so the scroll write lands in the same frame the
   * canvas grew — no intermediate short-of-bottom frame.
   */
  #pinCurrentFrame() {
    const el = this.#getScrollElement();
    if (!el) return;
    const distance = el.scrollHeight - el.clientHeight - el.scrollTop;
    if (distance > InfinityScrollController.#PIN_EPSILON) {
      this.#list.virtualizer.scrollToEnd({ behavior: "auto" });
    }
  }

  /** px of leftover gap under which the view counts as resting at the bottom */
  static #PIN_EPSILON = 1;
  /** frames the size must hold steady at the bottom before handing off to StickToBottom */
  static #PIN_SETTLE_FRAMES = 5;

  #pinTick = () => {
    this.#pinFrame = null;
    if (this.#disposed || this.#initialPinDone) return;

    const el = this.#getScrollElement();
    const virtualizer = this.#list.virtualizer;
    if (!el) {
      this.#pinFrame = requestAnimationFrame(this.#pinTick);
      return;
    }

    const total = virtualizer.getTotalSize();
    const distance = el.scrollHeight - el.clientHeight - el.scrollTop;
    // the canvas is at its rendered height for this frame, so a real gap here is the undershoot —
    // scrollToEnd now lands unclamped and pulls the view the rest of the way down
    if (distance > InfinityScrollController.#PIN_EPSILON)
      virtualizer.scrollToEnd({ behavior: "auto" });

    if (total === this.#lastTotalSize && distance <= InfinityScrollController.#PIN_EPSILON) {
      if (++this.#settleFrames >= InfinityScrollController.#PIN_SETTLE_FRAMES) {
        this.#endInitialPin();
        return;
      }
    } else {
      this.#settleFrames = 0;
      this.#lastTotalSize = total;
    }
    this.#pinFrame = requestAnimationFrame(this.#pinTick);
  };

  // ------------------------------------------------------------ render data

  get virtualizer() {
    return this.#list.virtualizer;
  }

  /** The real-DOM strategy's own controller — the `noVirtualization` counterpart to `virtualizer`. */
  get plainList() {
    return this.#plainList;
  }

  get loading() {
    return this.#loader.loading;
  }

  /** Whether growth at the end is currently followed — always `true` outside `scroll-mode="pin-top"`. */
  get following() {
    return this.#pin.following;
  }

  // ------------------------------------------------------------ pin helpers

  /** Searched from the tail — a pin is almost always the last item. @param {string | number} key */
  #indexOfKey(key) {
    const data = this.#getData();
    for (let index = data.length - 1; index >= 0; index--) {
      if (this.#getItemKey(data[index], index) === key) return index;
    }
    return -1;
  }

  /** The row's px offset from the content top — also the scrollTop that rests it at the top.
   *  @param {number} index @returns {number | undefined} */
  #pinOffset(index) {
    if (!this.#getNoVirtualization()) return this.#list.virtualizer.getMeasurements()[index]?.start;

    const el = this.#getScrollElement();
    const rowTop = this.#plainList.getOffsetForIndex(index, "start");
    if (!el || rowTop === undefined) return undefined;
    const paddingTop = parseFloat(getComputedStyle(el).paddingBlockStart) || 0;
    return Math.max(0, Math.round(rowTop - paddingTop));
  }

  /** @param {number} offset @param {"auto" | "smooth" | "instant"} behavior */
  #scrollToPin(offset, behavior) {
    if (!this.#getNoVirtualization()) {
      // through virtual-core, so its own offset never lags the real scrollTop
      this.#list.virtualizer.scrollToOffset(offset, { behavior });
      return;
    }
    this.#plainList.scrollToOffset(offset, { behavior });
    // a reconcile must restore onto the pin, not the pre-pin reading position
    this.#plainList.captureAnchor();
  }

  // -------------------------------------------------------------- commands

  handleScroll = () => {
    this.#pin.handleScroll();
    // `atBottom` gates the follow, so it has to flip in the same task as the scroll event: deferring
    // it to a frame lets the next follow read a stale "true" and yank the user back down mid-scroll.
    if (this.#getNoVirtualization()) {
      this.#plainList.handleScroll();
    } else {
      this.#stick.refresh();
    }

    // the load check only reads scrollTop and can wait for the frame
    if (this.#scrollFrame !== null) return;
    this.#scrollFrame = requestAnimationFrame(() => {
      this.#scrollFrame = null;
      this.#loader.maybeLoad();
    });
  };

  /**
   * Pins the item with `key` to the top of the viewport once it renders (`scroll-mode="pin-top"`
   * only) — call before the data carrying it is set.
   * @param {string | number} key
   */
  pinToStart(key) {
    if (this.#initialPinStarted && !this.#initialPinDone) this.#endInitialPin();
    this.#pin.pin(key);
    this.#host.requestUpdate();
  }

  /** Re-engages following after an explicit jump to the bottom. */
  noteScrollToBottom() {
    this.#pin.noteScrollToBottom();
  }

  /**
   * Scrolls the row at `index` into view — forwards to whichever strategy is active.
   * @param {number} index
   * @param {{align?: "auto" | "start" | "center" | "end", behavior?: "auto" | "smooth" | "instant"}} [options]
   */
  scrollToIndex(index, options) {
    if (this.#getNoVirtualization()) {
      this.#plainList.scrollToIndex(index, options);
      return;
    }
    this.#list.virtualizer.scrollToIndex(index, options);
  }

  /** release the ResizeObserver/IntersectionObserver registration of a row that left the DOM */
  releaseRows() {
    // `noVirtualization` still tracks row-readiness (RowMeasurer, see PlainListController), just not
    // a measurement cache — both branches need their own release call
    if (this.#getNoVirtualization()) {
      this.#plainList.releaseRows();
    } else {
      this.#measurer.releaseRows();
    }
    this.#visibility.releaseRows();
  }

  /**
   * Drop every cached row measurement (after a global style or width change). No-op under
   * `noVirtualization` — nothing is measured or cached in that mode.
   */
  remeasure() {
    if (this.#getNoVirtualization()) return;
    this.#measurer.reset();
    this.virtualizer.measure();
    this.#host.requestUpdate();
  }

  /**
   * Forget the measured heights of specific items. The size cache holds one entry per key for the
   * life of the instance, so a session that streams in an unbounded number of items should drop the
   * keys it discards. No-op under `noVirtualization`, same reasoning as {@link remeasure}.
   *
   * Reaches into `itemSizeCache`/`itemSizeCacheVersion`/`pendingMin`, which virtual-core exposes on
   * the instance but does not document. If that ever changes this warns and falls back to the far
   * heavier {@link remeasure}.
   * @param {Iterable<string | number>} keys
   */
  dropMeasurements(keys) {
    if (keys == null || typeof keys[Symbol.iterator] !== "function") {
      throw new TypeError("dropMeasurements(keys) needs an iterable of item keys");
    }
    if (this.#getNoVirtualization()) return;

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
    // core recomputes measurements from this index onwards
    virtualizer.pendingMin = 0;
    this.#host.requestUpdate();
  }
}
