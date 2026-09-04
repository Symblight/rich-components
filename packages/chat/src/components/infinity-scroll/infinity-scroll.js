import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { ref } from "lit/directives/ref.js";
import { VirtualizerController } from "@tanstack/lit-virtual";

import { ScrollBehaviorController } from "./ScrollBehaviorController.js";
import styles from "./infinity-scroll.css?inline";

/**
 * @tag chx-infinity-scroll
 * @summary Virtualized, load-more-aware scroll container. Generic — knows nothing about "messages".
 *   Exposes a `footer` slot, placed after the viewport inside the same flex column as the spacer —
 *   so footer content follows `content-align` (sits right under the last item on "start", pinned to
 *   the bottom with the content on "end") instead of always sitting at the container's own bottom edge.
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
    anchorStart: { attribute: false },
    buffer: { type: Number },
    onScrollerKeydown: { attribute: false },
    onScrollerFocusin: { attribute: false },
    onAwayFromBottomChange: { attribute: false },
  };

  /** @type {VirtualizerController<HTMLElement, HTMLElement>} */
  #virtualizer; // assigned in the constructor, below
  /** @type {HTMLElement | undefined} */
  #scrollElement; // the .infinity-scroll__scroller node — set via a ref() directive in render()
  /** @type {Element | undefined} */
  #viewportElement; // the .infinity-scroll__viewport node — set via a ref() directive in render()
  /** @type {Element | undefined} */
  #sentinelElement; // the .infinity-scroll__load-more-sentinel node — set via a ref() directive in render()
  /** @type {ScrollBehaviorController} */
  #scrollBehavior;

  constructor() {
    super();

    /** @type {unknown[]} */
    this.data = [];

    /** @type {(item: unknown, index: number) => string | number} */
    this.itemKey = (_item, index) => index;

    /** @type {(item: unknown, index: number) => unknown} */
    this.renderItem = () => nothing;

    /** @type {(index: number) => number} */
    this.estimateItemSize = () => 80;

    /** @type {number} */
    this.overscan = 5;

    /** Governs `scrollToBottom()` only — see ScrollBehaviorController.scrollToBottom's own doc. @type {"auto" | "smooth"} */
    this.scrollBehavior = "auto";

    /** Reflected — see infinity-scroll.css's `.infinity-scroll__spacer` rule. @type {"start" | "end"} */
    this.contentAlign = "end";

    /**
     * `"start"` (default) uses the virtualizer's own native end-anchoring — resize compensation
     * *and* prepend-anchor preservation. `false` switches both to `ScrollBehaviorController`'s own
     * DOM-only versions instead. Only resolved once, in `firstUpdated()` — set it before first
     * render (e.g. right after creating the element); flipping it later has no effect.
     * @type {"start" | false}
     */
    this.anchorStart = "start";

    /**
     * Distance (px) from the bottom edge within which the list still counts as "at the bottom" —
     * governs both the stick-to-bottom auto-follow threshold and the away-from-bottom state fed to
     * `onAwayFromBottomChange`. @type {number}
     */
    this.buffer = 150;

    /**
     * Bound directly on `.infinity-scroll__scroller`, inside this shadow root — not left for a
     * consumer to bind on the host element itself via a template `@keydown`. A composed event
     * crossing a shadow boundary gets `event.target` *retargeted* to the host, so a listener
     * outside this shadow root can never see which slotted/rendered child actually dispatched it
     * (`target.closest(...)` on the retargeted host always finds nothing) — found live, chasing a
     * roving-tabindex keydown handler that silently never fired once rendering moved in here.
     * @type {(event: KeyboardEvent) => void}
     */
    this.onScrollerKeydown = () => {};

    /** @type {(event: FocusEvent) => void} */
    this.onScrollerFocusin = () => {};

    /** Fires only on an actual flip of the away-from-bottom boolean. @type {(awayFromBottom: boolean) => void} */
    this.onAwayFromBottomChange = () => {};

    this.#virtualizer = new VirtualizerController(this, {
      count: this.data.length, // a snapshot, not a live getter — kept in sync via willUpdate(), below
      getScrollElement: () => this.#scrollElement ?? null,
      estimateSize: (index) => this.estimateItemSize(index),
      overscan: this.overscan,
      getItemKey: (index) => this.itemKey(this.data[index], index),
      anchorTo: "start", // corrected in firstUpdated() once this.anchorStart has its real value — see there
    });

    this.#scrollBehavior = new ScrollBehaviorController(this, {
      getScrollElement: () => this.#scrollElement,
      getViewportElement: () => this.#viewportElement,
      getSentinel: () => this.#sentinelElement,
      getData: () => this.data,
      itemKey: (item, index) => this.itemKey(item, index),
      scrollToIndex: (index, options) => this.scrollToIndex(index, options),
      getScrollBehavior: () => this.scrollBehavior,
      getBuffer: () => this.buffer,
      onAwayFromBottomChange: (away) => this.onAwayFromBottomChange(away),
      getAnchorStart: () => this.anchorStart,
    });
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  /**
   * Forwards to the underlying virtualizer's own `scrollToIndex` — public so a consumer (or
   * `chx-message-list`'s own roving-focus controller) can force an off-screen item into view.
   * @param {number} index
   * @param {{align?: "auto" | "start" | "center" | "end", behavior?: "auto" | "smooth" | "instant"}} [options]
   */
  scrollToIndex(index, options) {
    this.#virtualizer.getVirtualizer().scrollToIndex(index, options);
  }

  /**
   * Scrolls to the last item. See ScrollBehaviorController.scrollToBottom, this just forwards.
   * `behavior`, if passed, overrides the `scrollBehavior` property for this one call.
   * @param {"auto" | "smooth" | "instant"} [behavior]
   */
  scrollToBottom(behavior) {
    this.#scrollBehavior.scrollToBottom(behavior);
  }

  /**
   * Stable across the component's whole lifetime — passed as the `ref()` callback for every
   * rendered item, every render. `measureElement` reads the index it needs off the element's own
   * `data-index` attribute, not from closure state, so one shared function works for every item;
   * a fresh inline arrow here instead would make `ref()` treat each render as a brand-new callback
   * and re-fire disconnect/reconnect (and re-measure) on every item on every pass, even though the
   * underlying `repeat()`-keyed node never actually changed.
   * @param {Element | undefined} el
   */
  #measureItem = (el) => {
    if (el) this.#virtualizer.getVirtualizer().measureElement(/** @type {HTMLElement} */ (el));
  };

  /** @param {Element | undefined} el */
  #setScrollElement = (el) => {
    this.#scrollElement = /** @type {HTMLElement | undefined} */ (el);
  };

  /** @param {Element | undefined} el */
  #setViewportElement = (el) => {
    this.#viewportElement = el;
  };

  /** @param {Element | undefined} el */
  #setSentinelElement = (el) => {
    this.#sentinelElement = el;
  };

  /**
   * `count`/`overscan` are plain snapshots, not live getters — synced here, right before `render()`
   * reads `getVirtualItems()`/`getTotalSize()`. Guarded so a render pass that changed neither (the
   * common case while just scrolling) skips `setOptions()` entirely. `estimateSize`/`getItemKey`
   * don't need this treatment — their constructor closures already read `this.estimateItemSize`/
   * `this.itemKey` dynamically on every call, so they're already live. Re-passing *new* closures for
   * them here on every render was tried and found to confuse TanStack Virtual's own internal scroll-
   * adjustment tracking (resizeItem's own compensation kept firing long after settling, racing a
   * manual scroll away from the bottom) — count/overscan are the only fields that need this at all.
   */
  willUpdate() {
    const virtualizer = this.#virtualizer.getVirtualizer();
    if (virtualizer.options.count !== this.data.length || virtualizer.options.overscan !== this.overscan) {
      virtualizer.setOptions({ ...virtualizer.options, count: this.data.length, overscan: this.overscan });
    }
  }

  /**
   * Reads `this.anchorStart` here, not the constructor — by now a consumer's property/attribute set
   * has already landed (the constructor runs before any external code gets a chance to touch it).
   */
  firstUpdated() {
    if (this.anchorStart !== "start") {
      // A second, separate native compensation (above-the-fold resize) still runs regardless of
      // `anchorTo` — only settable as a direct instance property. No-op it so ScrollBehaviorController
      // is the sole thing moving scrollTop on a resize in this mode. `anchorTo` itself already
      // defaults to "start" from the constructor, so nothing else to correct here.
      this.#virtualizer.getVirtualizer().shouldAdjustScrollPositionOnItemSizeChange = () => false;
      return;
    }
    const virtualizer = this.#virtualizer.getVirtualizer();
    virtualizer.setOptions({ ...virtualizer.options, anchorTo: "end" });
  }

  render() {
    const virtualizer = this.#virtualizer.getVirtualizer();
    const items = virtualizer.getVirtualItems(); // only the visible+overscan window

    return html`
      <div
        class="infinity-scroll__scroller"
        part="scroller"
        @keydown=${this.onScrollerKeydown}
        @focusin=${this.onScrollerFocusin}
        ${ref(this.#setScrollElement)}
      >
        <div
          class="infinity-scroll__load-more-sentinel"
          part="load-more-sentinel"
          ${ref(this.#setSentinelElement)}
        ></div>
        <div class="infinity-scroll__spacer" part="spacer"></div>
        <div
          class="infinity-scroll__viewport"
          part="viewport"
          style="height: ${virtualizer.getTotalSize()}px;"
          ${ref(this.#setViewportElement)}
        >
          ${repeat(
            items,
            (item) => item.key,
            (item) => {
              const value = this.data[item.index];
              if (value === undefined) return nothing;
              return html`
                <div
                  class="infinity-scroll__virtual-item"
                  part="item"
                  data-item-key=${item.key}
                  data-index=${item.index}
                  style="transform: translateY(${item.start}px);"
                  ${ref(this.#measureItem)}
                >
                  ${this.renderItem(value, item.index)}
                </div>
              `;
            },
          )}
        </div>
        <slot name="footer"></slot>
      </div>
    `;
  }
}
