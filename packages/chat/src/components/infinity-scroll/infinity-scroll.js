import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { ref } from "lit/directives/ref.js";

import { InfinityScrollController } from "../../controllers/infinity-scroll/InfinityScrollController.js";
import styles from "./infinity-scroll.css?inline";

/** One live query, not one per call — follows read it on every streamed chunk. @type {MediaQueryList | undefined} */
let reducedMotion;

/** `"smooth"` drops to `"auto"` under prefers-reduced-motion.
 * @param {"auto" | "smooth" | "instant"} behavior @returns {"auto" | "smooth" | "instant"} */
function motionSafe(behavior) {
  if (behavior !== "smooth") return behavior;
  reducedMotion ??= matchMedia("(prefers-reduced-motion: reduce)");
  return reducedMotion.matches ? "auto" : behavior;
}

/**
 * @tag chx-infinity-scroll
 * @summary Generic virtualized, load-more-aware scroll container, message-agnostic.
 */
@customElement("chx-infinity-scroll")
export class ChxInfinityScroll extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    data: { attribute: false },
    itemKey: { attribute: false },
    renderItem: { attribute: false },
    estimateItemSize: { attribute: false },
    overscan: { type: Number },
    paddingStart: { type: Number, attribute: "padding-start" },
    paddingEnd: { type: Number, attribute: "padding-end" },
    scrollMargin: { type: Number, attribute: "scroll-margin" },
    useScrollendEvent: { type: Boolean, attribute: "use-scrollend-event" },
    scrollBehavior: { type: String, attribute: "scroll-behavior" },
    contentAlign: { type: String, attribute: "content-align", reflect: true },
    scrollMode: { type: String, attribute: "scroll-mode", reflect: true },
    noVirtualization: { type: Boolean, attribute: "no-virtualization", reflect: true },
    buffer: { type: Number },
    hasMore: { type: Boolean },
    loading: { type: Boolean },
    onLoadMore: { attribute: false },
    onScrollerKeydown: { attribute: false },
    onScrollerFocusin: { attribute: false },
    onAwayFromBottomChange: { attribute: false },
    onItemVisible: { attribute: false },
    visibilityThreshold: { type: Number, attribute: "visibility-threshold" },
    shouldObserveItem: { attribute: false },
  };

  /** @type {InfinityScrollController} */
  #controller;
  /** @type {HTMLElement | undefined} */
  #scrollElement;
  /** @type {HTMLElement | undefined} */
  #canvasElement;
  /** @type {HTMLElement | undefined} */
  #contentElement;
  /** @type {Element | undefined} */
  #endElement;
  /** @type {Element | undefined} */
  #footerElement;

  /** `ref()` fires only on create/remove; `undefined` means the row left the DOM. @param {Element | undefined} row */
  #rowRef = (row) => {
    if (!row) this.#controller.releaseRows();
  };

  constructor() {
    super();

    /** The items to virtualize. @type {unknown[]} */
    this.data = [];

    /** Stable per-item key, for measurement/DOM reuse across re-renders. @type {(item: unknown, index: number) => string | number} */
    this.itemKey = (_item, index) => index;

    /** Builds the DOM for one item — message-agnostic, the consumer owns what a row is. @type {(item: unknown, index: number) => unknown} */
    this.renderItem = () => nothing;

    /** Pre-measurement height guess, refined once the row actually renders. @type {(item: unknown, index: number) => number} */
    this.estimateItemSize = () => 80;

    /** Extra items rendered past each viewport edge, absorbing fast scrolls before a blank gap shows. @type {number} */
    this.overscan = 6;

    /** px inserted before the first item in the scrollable range. @type {number} */
    this.paddingStart = 0;

    /** px inserted after the last item in the scrollable range. @type {number} */
    this.paddingEnd = 0;

    /** px offset applied when this list is nested inside another scrollable ancestor. @type {number} */
    this.scrollMargin = 0;

    /**
     * Use the native `scrollend` event instead of a debounce heuristic to detect scroll settling.
     * Read once, at mount — `@tanstack/virtual-core` only consults it the one time it subscribes to
     * the scroll element, so changing this after the list has rendered content has no effect. @type {boolean}
     */
    this.useScrollendEvent = false;

    /** Governs `scrollToBottom()` only. @type {"auto" | "smooth"} */
    this.scrollBehavior = "auto";

    /** `"start"` rests a short list at the top and enables `pinToStart()`; `"end"` rests it at the
     *  bottom and always follows new content. @type {"start" | "end"} */
    this.contentAlign = "end";

    /** `"pin-top"` enables `pinToStart()` and stops following new content until the user returns to
     *  the bottom; `"stick-bottom"` always follows. @type {"pin-top" | "stick-bottom"} */
    this.scrollMode = "stick-bottom";

    /** Real-DOM mode — every row renders in full, in normal document flow, no windowing/measurement. @type {boolean} */
    this.noVirtualization = false;

    /** px from the bottom still counting as "at the bottom". @type {number} */
    this.buffer = 150;

    /** Whether older data can still be loaded. @type {boolean} */
    this.hasMore = true;

    /** Controller-owned, mirrored for rendering. @type {boolean} */
    this.loading = false;

    /** Fetches one older page. @type {() => Promise<unknown>} */
    this.onLoadMore = () => Promise.resolve();

    /** Keydown on the scroller div — a callback since the composed event retargets to the host, so
     *  an outside listener can't tell which row dispatched it. @type {(event: KeyboardEvent) => void} */
    this.onScrollerKeydown = () => {};

    /** Focusin on the scroller div, same reasoning as `onScrollerKeydown`. @type {(event: FocusEvent) => void} */
    this.onScrollerFocusin = () => {};

    /** Fires on an actual flip only. @type {(awayFromBottom: boolean) => void} */
    this.onAwayFromBottomChange = () => {};

    /** Fires on every `false → true` intersection transition for a row that passed `shouldObserveItem` — not fire-once. `key` is always a string (recovered from `data-item-key`), regardless of what `itemKey` itself returns. @type {(key: string) => void} */
    this.onItemVisible = () => {};

    /** Forwarded straight to the `IntersectionObserver`'s own `threshold` option. Read once, at first observation — not live. @type {number} */
    this.visibilityThreshold = 0;

    /** Consulted once, when a row would otherwise first be observed — a row that fails this is never registered with the `IntersectionObserver` at all. @type {(item: unknown, index: number) => boolean} */
    this.shouldObserveItem = () => true;

    this.#controller = new InfinityScrollController(this, {
      getScrollElement: () => this.#scrollElement,
      getCanvasElement: () => this.#canvasElement,
      getNoVirtualization: () => this.noVirtualization,
      getPinEnabled: () => this.scrollMode === "pin-top",
      getContentElement: () => this.#contentElement,
      getEndElement: () => this.#endElement,
      getFooterElement: () => this.#footerElement,
      getData: () => this.data,
      getItemKey: (item, index) => this.itemKey(item, index),
      getEstimateItemSize: () => this.estimateItemSize,
      getOverscan: () => this.overscan,
      getPaddingStart: () => this.paddingStart,
      getPaddingEnd: () => this.paddingEnd,
      getScrollMargin: () => this.scrollMargin,
      getFollowBehavior: () => motionSafe(this.scrollBehavior),
      getUseScrollendEvent: () => this.useScrollendEvent,
      getBuffer: () => this.buffer,
      getHasMore: () => this.hasMore,
      getOnLoadMore: () => this.onLoadMore,
      onAwayFromBottomChange: (away) => this.onAwayFromBottomChange(away),
      getVisibilityThreshold: () => this.visibilityThreshold,
      getShouldObserveItem: () => this.shouldObserveItem,
      onItemVisible: (key) => this.onItemVisible(key),
      rows: () =>
        this.renderRoot?.querySelectorAll(".infinity-scroll__canvas > .infinity-scroll__row") ?? [],
      emit: (type, detail) =>
        this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true })),
    });
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  /** Mirrors the controller's own `loading` onto the reactive property `render()` reads. */
  willUpdate() {
    this.loading = this.#controller.loading;
  }

  /** @param {KeyboardEvent} event */
  #handleKeydown = (event) => {
    this.#controller.userGesture.handleEvent(event);
    this.onScrollerKeydown(event);
  };

  /** @param {Element | undefined} el */
  #setScrollElement = (el) => {
    this.#scrollElement = /** @type {HTMLElement | undefined} */ (el);
  };

  /** @param {Element | undefined} el */
  #setCanvasElement = (el) => {
    this.#canvasElement = /** @type {HTMLElement | undefined} */ (el);
  };

  /** @param {Element | undefined} el */
  #setFooterElement = (el) => {
    this.#footerElement = el;
  };

  /** @param {Element | undefined} el */
  #setEndElement = (el) => {
    this.#endElement = el;
  };

  /** @param {Element | undefined} el */
  #setContentElement = (el) => {
    this.#contentElement = /** @type {HTMLElement | undefined} */ (el);
  };

  /** Whether growth at the end is currently followed — `false` once the user scrolls up, or while
   *  `scroll-mode="pin-top"` holds a pin. */
  get following() {
    return this.#controller.following;
  }

  /**
   * Scrolls the item with `key` to the top of the viewport once it has rendered, reserving trailing
   * space so it can sit there, and stops following until the user scrolls back to the bottom. Only
   * under `scroll-mode="pin-top"`, a no-op otherwise. Call it before the `data` carrying the item is
   * set, so the virtualizer doesn't follow the append first.
   * @param {string | number} key
   */
  pinToStart(key) {
    this.#controller.pinToStart(key);
  }

  /**
   * Scrolls to a specific item index — forwarded to whichever strategy is active.
   * @param {number} index
   * @param {{align?: "auto" | "start" | "center" | "end", behavior?: "auto" | "smooth" | "instant"}} [options]
   */
  scrollToIndex(index, options) {
    this.#controller.scrollToIndex(index, options);
  }

  /**
   * Jump to the bottom (clears padding + `footer`) and fire `chx-scroll-to-bottom`.
   * @param {"auto" | "smooth" | "instant"} [behavior]
   */
  scrollToBottom(behavior) {
    this.#controller.scrollToBottom(motionSafe(behavior ?? this.scrollBehavior));
    this.dispatchEvent(new CustomEvent("chx-scroll-to-bottom", { bubbles: true, composed: true }));
  }

  /**
   * Current scroll offset in px, or `undefined` before the scroller has ever measured one —
   * pairs with `scrollToOffset()` to save/restore a scroll position across a bulk `data` swap (e.g.
   * chx-chat caching/restoring a conversation's scroll position on switch).
   * @returns {number | undefined}
   */
  getScrollOffset() {
    return this.#controller.getScrollOffset();
  }

  /**
   * Scrolls to a specific pixel offset — the counterpart to `getScrollOffset()`, forwarded to
   * whichever strategy is active.
   * @param {number} offset
   * @param {{align?: "auto" | "start" | "center" | "end", behavior?: "auto" | "smooth" | "instant"}} [options]
   */
  scrollToOffset(offset, options) {
    this.#controller.scrollToOffset(offset, options);
  }

  /**
   * Where to bring this list's content back to: an offset, `undefined` for the bottom, or `null`
   * while a `showPosition()` is still settling, when the scroll position means nothing yet.
   * @returns {number | undefined | null}
   */
  positionToSave() {
    return this.#controller.positionToSave();
  }

  /**
   * `data` is being swapped for unrelated content (a conversation switch): forgets the bottom latch,
   * the pin and the anchor, then holds `offset`, or the bottom without one, while the new rows lay
   * out. No-op when virtualized.
   * @param {number | undefined} offset
   */
  showPosition(offset) {
    this.#controller.showPosition(offset);
  }

  /**
   * The scroll offset (px) that would align item `index` to the given edge — the estimate the
   * virtualizer would use for `scrollToIndex`, exposed so a caller can pre-compute a target and
   * `scrollToOffset()` to it in one pass (no measurement-driven re-scroll). `undefined` when the item
   * isn't resolvable yet. @param {number} index @param {"start" | "center" | "end"} [align]
   * @returns {number | undefined}
   */
  getOffsetForIndex(index, align = "start") {
    return this.#controller.getOffsetForIndex(index, align);
  }

  /** Drop every cached row measurement. */
  remeasure() {
    this.#controller.remeasure();
  }

  /** Forget the measured heights of specific items. @param {Iterable<string | number>} keys */
  dropMeasurements(keys) {
    this.#controller.dropMeasurements(keys);
  }

  render() {
    const noVirtualization = this.noVirtualization;
    // plain mode renders every item, in full, in document order — no windowed subset, no offset math
    const rows = noVirtualization
      ? this.data.map((item, index) => ({ key: this.itemKey(item, index), index, start: 0 }))
      : this.#controller.virtualizer.getVirtualItems();
    const canvasHeight = noVirtualization ? undefined : this.#controller.virtualizer.getTotalSize();

    return html`
      <div
        class="infinity-scroll__scroller"
        part="scroller"
        @scroll=${this.#controller.handleScroll}
        @wheel=${this.#controller.userGesture}
        @touchstart=${this.#controller.userGesture}
        @pointerdown=${this.#controller.userGesture}
        @keydown=${this.#handleKeydown}
        @focusin=${this.onScrollerFocusin}
        ${ref(this.#setScrollElement)}
      >
        <div class="infinity-scroll__sticky" part="sticky"><slot name="sticky"></slot></div>
        <div class="infinity-scroll__content" ${ref(this.#setContentElement)}>
          <div
            class="infinity-scroll__canvas"
            part="viewport"
            role="list"
            style=${canvasHeight === undefined ? nothing : `height: ${canvasHeight}px;`}
            ${ref(this.#setCanvasElement)}
          >
            ${repeat(
              rows,
              (row) => row.key,
              (row) => {
                const value = this.data[row.index];
                if (value === undefined) return nothing;
                return html`
                  <div
                    class="infinity-scroll__row"
                    part="item"
                    role="listitem"
                    data-item-key=${row.key}
                    data-index=${row.index}
                    aria-setsize=${this.data.length}
                    aria-posinset=${row.index + 1}
                    style=${noVirtualization ? nothing : `transform: translateY(${row.start}px);`}
                    ${ref(this.#rowRef)}
                  >
                    ${this.renderItem(value, row.index)}
                  </div>
                `;
              },
            )}
          </div>
          <slot name="footer" ${ref(this.#setFooterElement)}></slot>
          <div class="infinity-scroll__end" aria-hidden="true" ${ref(this.#setEndElement)}></div>
        </div>
      </div>
    `;
  }
}
