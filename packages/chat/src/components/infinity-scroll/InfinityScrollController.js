import { VirtualListController } from "./VirtualListController.js";
import { RowMeasurer } from "./RowMeasurer.js";
import { StickToBottom } from "./StickToBottom.js";
import { LoadMoreController } from "./LoadMoreController.js";
import { VisibilityController } from "./VisibilityController.js";
import { PlainListController } from "./PlainListController.js";

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
 *    stick-to-bottom itself, `MutationObserver`-driven. See `.claude/plans/messages/
 *    no-virtualization.md`.
 *
 * The idle strategy is switched *off*, not just left unread: virtual-core's controller runs on this
 * host either way, so `VirtualListController.sync()` disables it outright under `noVirtualization`
 * (see its own doc for what it would do otherwise).
 *  - {@link LoadMoreController}    asking the consumer for older items, owns `loading`
 *  - {@link VisibilityController}  reporting rows that scrolled into view, owns `onItemVisible`
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
  /** @type {() => Element | undefined} */
  #getScrollElement;
  /** @type {() => boolean} */
  #getNoVirtualization;
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

  /** @type {() => number} */
  #getBuffer;
  /** @type {(awayFromBottom: boolean) => void} */
  #onAwayFromBottomChange;
  #awayFromBottom = false;

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
   * }} config
   */
  constructor(host, config) {
    this.#host = host;
    this.#getScrollElement = config.getScrollElement;
    this.#getBuffer = config.getBuffer;
    this.#onAwayFromBottomChange = config.onAwayFromBottomChange;
    this.#getNoVirtualization = config.getNoVirtualization ?? (() => false);
    const getCanvasElement = config.getCanvasElement ?? (() => undefined);

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
      onAwayFromBottomChange: config.onAwayFromBottomChange,
      // hostUpdated() below deliberately does not call maybeLoad() itself in this mode — this is
      // the only place it gets checked, and only once scrollTop is genuinely post-correction. See
      // hostUpdated()'s own comment for why the direct call was the actual bug.
      onReconciled: () => this.#loader.maybeLoad(),
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
  }

  hostUpdated() {
    this.#visibility.schedule();
    if (this.#getNoVirtualization()) {
      // idempotent — starts observing the first time the canvas exists, no-op afterwards; the
      // MutationObserver/ResizeObserver it installs handle every reconcile on their own from here.
      this.#plainList.observe();
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
    // data/size changes move the bottom distance without a `scroll` event; recompute after any pin
    this.#updateAwayFromBottom();
  }

  hostDisconnected() {
    if (this.#scrollFrame !== null) cancelAnimationFrame(this.#scrollFrame);
    this.#scrollFrame = null;
    this.#disposed = true;
    this.#loader.dispose();
    this.#visibility.dispose();
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

  // -------------------------------------------------------------- commands

  handleScroll = () => {
    // `atBottom` gates the follow, so it has to flip in the same task as the scroll event: deferring
    // it to a frame lets the next follow read a stale "true" and yank the user back down mid-scroll.
    if (this.#getNoVirtualization()) {
      this.#plainList.handleScroll();
    } else {
      this.#stick.refresh();
      this.#updateAwayFromBottom();
    }

    // the load check only reads scrollTop and can wait for the frame
    if (this.#scrollFrame !== null) return;
    this.#scrollFrame = requestAnimationFrame(() => {
      this.#scrollFrame = null;
      this.#loader.maybeLoad();
    });
  };

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

  /**
   * Recomputes whether the view is scrolled away from the bottom (past `buffer` px, read straight
   * off the DOM — not the virtualizer's own end test, whose internal offset can lag the real
   * scrollTop mid-measurement) and fires `onAwayFromBottomChange` only on an actual flip. Drives the
   * consumer's scroll-to-bottom affordance.
   */
  #updateAwayFromBottom() {
    const el = this.#getScrollElement();
    // no scroll element yet counts as "at the bottom", so an initial load never flashes the affordance
    const away = el ? el.scrollHeight - el.clientHeight - el.scrollTop > this.#getBuffer() : false;
    if (away === this.#awayFromBottom) return;
    this.#awayFromBottom = away;
    this.#onAwayFromBottomChange(away);
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
