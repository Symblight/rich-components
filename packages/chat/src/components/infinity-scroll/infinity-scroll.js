import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { ref } from "lit/directives/ref.js";

import { InfinityScrollController } from "./InfinityScrollController.js";
import styles from "./infinity-scroll.css?inline";

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
    buffer: { type: Number },
    hasMore: { type: Boolean },
    loading: { type: Boolean },
    onLoadMore: { attribute: false },
    onScrollerKeydown: { attribute: false },
    onScrollerFocusin: { attribute: false },
    onAwayFromBottomChange: { attribute: false },
  };

  /** @type {InfinityScrollController} */
  #controller;
  /** @type {HTMLElement | undefined} */
  #scrollElement;

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

    /** `"start"` rests a short list at the top, `"end"` at the bottom. @type {"start" | "end"} */
    this.contentAlign = "end";

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

    this.#controller = new InfinityScrollController(this, {
      getScrollElement: () => this.#scrollElement,
      getData: () => this.data,
      getItemKey: (item, index) => this.itemKey(item, index),
      getEstimateItemSize: () => this.estimateItemSize,
      getOverscan: () => this.overscan,
      getPaddingStart: () => this.paddingStart,
      getPaddingEnd: () => this.paddingEnd,
      getScrollMargin: () => this.scrollMargin,
      getUseScrollendEvent: () => this.useScrollendEvent,
      getBuffer: () => this.buffer,
      getHasMore: () => this.hasMore,
      getOnLoadMore: () => this.onLoadMore,
      onAwayFromBottomChange: (away) => this.onAwayFromBottomChange(away),
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

  /** @param {Element | undefined} el */
  #setScrollElement = (el) => {
    this.#scrollElement = /** @type {HTMLElement | undefined} */ (el);
  };

  /**
   * Scrolls to a specific item index — forwarded straight through to the virtualizer.
   * @param {number} index
   * @param {{align?: "auto" | "start" | "center" | "end", behavior?: "auto" | "smooth" | "instant"}} [options]
   */
  scrollToIndex(index, options) {
    this.#controller.virtualizer.scrollToIndex(index, options);
  }

  /**
   * Jump to the bottom (clears padding + `footer`) and fire `chx-scroll-to-bottom`.
   * `virtualizer.scrollToEnd()` only knows about virtualized rows — it aligns the *last row* with
   * the viewport edge, oblivious to any non-virtualized trailing content in the `footer` slot (e.g.
   * a typing/streaming indicator). Following it with a plain `scrollTop = scrollHeight` snap corrects
   * for that: `scrollHeight` is a real DOM measurement that already includes the footer, no
   * virtualizer involvement needed. A no-op in the common no-footer case (both already agree on the
   * same offset), so this stays cheap and doesn't need a conditional.
   * @param {"auto" | "smooth" | "instant"} [behavior]
   */
  scrollToBottom(behavior) {
    const resolvedBehavior = behavior ?? this.scrollBehavior;
    this.#controller.virtualizer.scrollToEnd({ behavior: resolvedBehavior });
    this.#scrollElement?.scrollTo({ top: this.#scrollElement.scrollHeight, behavior: resolvedBehavior });
    this.dispatchEvent(new CustomEvent("chx-scroll-to-bottom", { bubbles: true, composed: true }));
  }

  /**
   * Current scroll offset in px, or `undefined` before the scroller has ever measured one —
   * pairs with `scrollToOffset()` to save/restore a scroll position across a bulk `data` swap (e.g.
   * chx-chat caching/restoring a conversation's scroll position on switch).
   * @returns {number | undefined}
   */
  getScrollOffset() {
    return this.#controller.virtualizer.scrollOffset ?? undefined;
  }

  /**
   * Scrolls to a specific pixel offset — the counterpart to `getScrollOffset()`, forwarded straight
   * through to the virtualizer.
   * @param {number} offset
   * @param {{align?: "auto" | "start" | "center" | "end", behavior?: "auto" | "smooth" | "instant"}} [options]
   */
  scrollToOffset(offset, options) {
    this.#controller.virtualizer.scrollToOffset(offset, options);
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
    const virtualizer = this.#controller.virtualizer;
    const rows = virtualizer.getVirtualItems();

    return html`
      <div
        class="infinity-scroll__scroller"
        part="scroller"
        @scroll=${this.#controller.handleScroll}
        @keydown=${this.onScrollerKeydown}
        @focusin=${this.onScrollerFocusin}
        ${ref(this.#setScrollElement)}
      >
        <div class="infinity-scroll__content">
          <div
            class="infinity-scroll__canvas"
            part="viewport"
            role="list"
            style="height: ${virtualizer.getTotalSize()}px;"
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
                    style="transform: translateY(${row.start}px);"
                    ${ref(this.#rowRef)}
                  >
                    ${this.renderItem(value, row.index)}
                  </div>
                `;
              },
            )}
          </div>
          <slot name="footer"></slot>
        </div>
      </div>
    `;
  }
}
