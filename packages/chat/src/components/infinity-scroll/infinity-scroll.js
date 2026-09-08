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

    /** @type {unknown[]} */
    this.data = [];

    /** @type {(item: unknown, index: number) => string | number} */
    this.itemKey = (_item, index) => index;

    /** @type {(item: unknown, index: number) => unknown} */
    this.renderItem = () => nothing;

    /** @type {(item: unknown, index: number) => number} */
    this.estimateItemSize = () => 80;

    /** @type {number} */
    this.overscan = 6;

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

    // bound inside this shadow root: a composed event retargets to the host, so an outside listener
    // can't tell which row dispatched it
    /** @type {(event: KeyboardEvent) => void} */
    this.onScrollerKeydown = () => {};

    /** @type {(event: FocusEvent) => void} */
    this.onScrollerFocusin = () => {};

    /** Fires on an actual flip only. @type {(awayFromBottom: boolean) => void} */
    this.onAwayFromBottomChange = () => {};

    this.#controller = new InfinityScrollController(this, {
      getScrollElement: () => this.#scrollElement,
      getData: () => this.data,
      getItemKey: (item, index) => this.itemKey(item, index),
      getEstimateItemSize: () => this.estimateItemSize,
      getOverscan: () => this.overscan,
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

  willUpdate() {
    this.loading = this.#controller.loading;
  }

  /** @param {Element | undefined} el */
  #setScrollElement = (el) => {
    this.#scrollElement = /** @type {HTMLElement | undefined} */ (el);
  };

  /**
   * @param {number} index
   * @param {{align?: "auto" | "start" | "center" | "end", behavior?: "auto" | "smooth" | "instant"}} [options]
   */
  scrollToIndex(index, options) {
    this.#controller.virtualizer.scrollToIndex(index, options);
  }

  /** Jump to the bottom (clears padding + `footer`) and fire `chx-scroll-to-bottom`. @param {"auto" | "smooth" | "instant"} [behavior] */
  scrollToBottom(behavior) {
    this.#controller.virtualizer.scrollToEnd({ behavior: behavior ?? this.scrollBehavior });
    this.dispatchEvent(new CustomEvent("chx-scroll-to-bottom", { bubbles: true, composed: true }));
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
