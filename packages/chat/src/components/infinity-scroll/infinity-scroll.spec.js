import { expect, fixture, html } from "@open-wc/testing";

import "./infinity-scroll.js";
/** @import { ChxInfinityScroll } from "./infinity-scroll.js" */

/**
 * @param {() => boolean} predicate
 * @param {number} [timeout]
 */
async function waitFor(predicate, timeout = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("waitFor timed out");
}

/** @param {number} count */
function makeManyItems(count) {
  return Array.from({ length: count }, (_, i) => ({ id: `i${i}`, label: `Item ${i}` }));
}

/**
 * Mounts a bare chx-infinity-scroll with a plain `<div>` renderer — proves infinity-scroll's own
 * contract with no message semantics at all, the same shape chx-message-list wires in production
 * (`.data`/`.itemKey`/`.renderItem`).
 * @param {{id: string, label: string}[]} data
 * @param {string} [style]
 */
async function mountInfinityScroll(data, style = "height: 400px;") {
  const el = /** @type {ChxInfinityScroll} */ (
    await fixture(html`<chx-infinity-scroll style=${style}></chx-infinity-scroll>`)
  );
  el.itemKey = (item, index) => /** @type {{id: string} | undefined} */ (item)?.id ?? index;
  el.renderItem = (item, index) => {
    const data2 = /** @type {{id: string, label: string} | undefined} */ (item);
    const div = document.createElement("div");
    div.dataset.itemId = String(data2?.id ?? index);
    div.textContent = data2?.label ?? "";
    return div;
  };
  el.data = data;
  await el.updateComplete;
  return el;
}

describe("chx-infinity-scroll", () => {
  describe("virtualization", () => {
    it("measures each item's real (dynamic) height instead of using a fixed row height", async function () {
      // waitFor's own default timeout (2000ms) matches mocha's per-test default, so under load
      // (e.g. the full suite, not just this file) they can race and mocha's own timeout wins with
      // a less useful error — give this one enough headroom to let waitFor's clearer error surface.
      this.timeout(6000);
      const el = await mountInfinityScroll(
        [
          { id: "short", label: "hi" },
          { id: "below", label: "below" },
        ],
        "height: 400px; width: 300px;",
      );

      const wrapperOf = (/** @type {string} */ id) =>
        /** @type {HTMLElement | null} */ (el.shadowRoot?.querySelector(`[data-item-key="${id}"]`));

      await waitFor(() => wrapperOf("below")?.style.transform !== "translateY(80px)"); // 80 is
      //   estimateItemSize's guess — waiting for the real measurement to replace it
      const shortHeight = wrapperOf("short")?.getBoundingClientRect().height;
      // "below" (index 1) is positioned exactly at "short"'s real measured height, not a fixed
      // estimate — proves per-item height is genuinely dynamic, not a uniform row height
      expect(wrapperOf("below")?.style.transform).to.equal(`translateY(${shortHeight}px)`);

      // grow the first item's content — the wrapper's real height should grow, and everything
      // below it should reposition to match, not stay at the old offset
      el.data = [
        { id: "short", label: "a much longer line of text that will wrap across more than one line inside this narrow container" },
        { id: "below", label: "below" },
      ];
      await el.updateComplete;
      await waitFor(() => {
        const height = wrapperOf("short")?.getBoundingClientRect().height ?? 0;
        return height > /** @type {number} */ (shortHeight) && wrapperOf("below")?.style.transform === `translateY(${height}px)`;
      });

      const grownHeight = wrapperOf("short")?.getBoundingClientRect().height;
      expect(wrapperOf("below")?.style.transform).to.equal(`translateY(${grownHeight}px)`);
    });

    it("only renders content for the visible+overscan window, not the whole list", async () => {
      const el = await mountInfinityScroll(makeManyItems(200));

      const rendered = el.shadowRoot?.querySelectorAll("[data-item-id]") ?? [];
      expect(rendered.length).to.be.greaterThan(0);
      expect(rendered.length).to.be.lessThan(200); // far fewer than the full list
    });

    it("scrolling changes what's rendered", async () => {
      const el = await mountInfinityScroll(makeManyItems(200));

      const renderedIds = () =>
        [...(el.shadowRoot?.querySelectorAll("[data-item-id]") ?? [])].map((n) => n.getAttribute("data-item-id"));
      expect(renderedIds()).to.include("i0");
      expect(renderedIds()).to.not.include("i199");

      const scroller = /** @type {HTMLElement} */ (el.shadowRoot?.querySelector(".infinity-scroll__scroller"));
      scroller.scrollTop = scroller.scrollHeight;
      scroller.dispatchEvent(new Event("wheel")); // simulates genuine user intent, per ScrollBehaviorController's
      //   wheel/pointerdown/touchstart cancellation — a raw scroll event alone is ambiguous
      scroller.dispatchEvent(new Event("scroll"));

      await waitFor(() => renderedIds().includes("i199"));
      expect(renderedIds()).to.not.include("i0"); // scrolled out
    });
  });

  describe("stick to bottom", () => {
    /** @param {HTMLElement} scroller */
    function isAtBottom(scroller) {
      return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 32;
    }

    // deliberately empty labels — an empty <div> collapses to zero height, so effectively the
    // whole list stays within the overscan window regardless of scroll position. These tests care
    // about scroll *position* behavior, not real virtualization windowing (covered separately by
    // the "virtualization" describe block above, which needs real, varied heights) — zero-height
    // items sidestep a real item genuinely falling outside the rendered window and never appearing
    /** @param {number} count */
    function makeManyItems(count) {
      return Array.from({ length: count }, (_, i) => ({ id: `i${i}`, label: "" }));
    }

    it("auto-scrolls to the bottom when a new item arrives while already at the bottom", async () => {
      const el = await mountInfinityScroll(makeManyItems(50));
      const scroller = /** @type {HTMLElement} */ (el.shadowRoot?.querySelector(".infinity-scroll__scroller"));
      await waitFor(() => isAtBottom(scroller)); // initial mount sticks to the bottom on its own

      let scrollEventCount = 0;
      el.addEventListener("chx-scroll-to-bottom", () => scrollEventCount++);

      el.data = [...el.data, { id: "new-item", label: "new" }];
      await el.updateComplete;

      await waitFor(() => !!el.shadowRoot?.querySelector('[data-item-id="new-item"]'));
      expect(isAtBottom(scroller)).to.be.true;
      expect(scrollEventCount).to.be.greaterThan(0);
    });

    it("scrollToBottom() is a public method that scrolls and fires chx-scroll-to-bottom", async () => {
      const el = await mountInfinityScroll(makeManyItems(50));
      const scroller = /** @type {HTMLElement} */ (el.shadowRoot?.querySelector(".infinity-scroll__scroller"));
      await waitFor(() => isAtBottom(scroller));

      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event("wheel"));
      scroller.dispatchEvent(new Event("scroll"));
      await el.updateComplete;
      expect(isAtBottom(scroller)).to.be.false;

      /** @type {Event | undefined} */
      let event;
      el.addEventListener("chx-scroll-to-bottom", (e) => (event = e));
      el.scrollToBottom();

      await waitFor(() => isAtBottom(scroller));
      expect(event).to.exist;
      expect(event?.bubbles).to.be.true;
      expect(event?.composed).to.be.true;
    });

    it("scrollToBottom() is a no-op on an empty list", async () => {
      const el = await mountInfinityScroll([]);
      let fired = false;
      el.addEventListener("chx-scroll-to-bottom", () => (fired = true));
      el.scrollToBottom();
      expect(fired).to.be.false;
    });

    it("leaves scroll position untouched when the user had scrolled up before a new item arrives", async () => {
      const el = await mountInfinityScroll(makeManyItems(50));
      const scroller = /** @type {HTMLElement} */ (el.shadowRoot?.querySelector(".infinity-scroll__scroller"));
      await waitFor(() => scroller.scrollHeight > scroller.clientHeight);

      // scrollToIndex(0), not a raw scrollTop assignment — jumping straight to an
      // unmeasured-before item via `scroller.scrollTop = 0` bypasses TanStack Virtual's own
      // internal scroll-offset tracking, leaving it briefly stale relative to the first real
      // measurement of every newly-visible item and causing its own resizeItem compensation to
      // nudge the position afterward — an artifact of that direct DOM bypass, not reproducible
      // through the real scrollToIndex()/scrollToBottom() API paths a real user's input drives
      el.scrollToIndex(0);
      scroller.dispatchEvent(new Event("wheel"));
      scroller.dispatchEvent(new Event("scroll"));
      await el.updateComplete;
      expect(scroller.scrollTop).to.equal(0);

      el.data = [...el.data, { id: "new-item", label: "new" }];
      await el.updateComplete;
      await waitFor(() => !!el.shadowRoot?.querySelector('[data-item-id="new-item"]'));
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(scroller.scrollTop).to.equal(0);
    });

    it("follows growing content the same way, but not once scrolled up", async () => {
      const el = await mountInfinityScroll(makeManyItems(50));
      const scroller = /** @type {HTMLElement} */ (el.shadowRoot?.querySelector(".infinity-scroll__scroller"));
      await waitFor(() => isAtBottom(scroller));

      const growingReply = (/** @type {string} */ label) => [
        ...el.data.filter((/** @type {any} */ item) => item.id !== "stream-reply"),
        { id: "stream-reply", label },
      ];

      el.data = growingReply("Hel");
      await el.updateComplete;
      el.data = growingReply("Hello there, this is a growing streamed reply");
      await el.updateComplete;
      await waitFor(() => !!el.shadowRoot?.querySelector('[data-item-id="stream-reply"]'));
      expect(isAtBottom(scroller)).to.be.true;

      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event("wheel"));
      scroller.dispatchEvent(new Event("scroll"));
      await el.updateComplete;

      el.data = growingReply("Hello there, this is a growing streamed reply that keeps extending");
      await el.updateComplete;
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(scroller.scrollTop).to.equal(0);
    });
  });

  describe("pagination", () => {
    it("renders a load-more sentinel as the first child of the scroller", async () => {
      const el = await mountInfinityScroll([]);
      const scroller = el.shadowRoot?.querySelector(".infinity-scroll__scroller");
      expect(scroller?.firstElementChild?.className).to.equal("infinity-scroll__load-more-sentinel");
    });

    it("fires chx-load-more when a short list doesn't fill the viewport (the overflow-check fallback)", async () => {
      const el = await mountInfinityScroll([]);
      let fired = false;
      el.addEventListener("chx-load-more", () => (fired = true));
      el.data = [{ id: "i1", label: "one" }]; // one short item — nowhere near 400px tall
      await el.updateComplete;

      await waitFor(() => fired);
    });

    it("fires chx-load-more via IntersectionObserver when scrolled to the sentinel at the top", async () => {
      const el = await mountInfinityScroll(makeManyItems(50));
      const scroller = /** @type {HTMLElement} */ (el.shadowRoot?.querySelector(".infinity-scroll__scroller"));
      await waitFor(() => scroller.scrollHeight > scroller.clientHeight);

      let calls = 0;
      el.addEventListener("chx-load-more", () => calls++);
      const before = calls;

      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event("wheel"));
      scroller.dispatchEvent(new Event("scroll"));

      await waitFor(() => calls > before);
    });

    it("preserves scroll position when older data is prepended (no visible jump)", async () => {
      const el = await mountInfinityScroll(makeManyItems(50));
      const scroller = /** @type {HTMLElement} */ (el.shadowRoot?.querySelector(".infinity-scroll__scroller"));
      await waitFor(() => scroller.scrollHeight > scroller.clientHeight);

      scroller.scrollTop = 0; // scrolled to the very top, about to trigger a load
      scroller.dispatchEvent(new Event("wheel"));
      scroller.dispatchEvent(new Event("scroll"));
      await el.updateComplete;

      /** @returns {number | undefined} */
      const anchorTop = () => el.shadowRoot?.querySelector('[data-item-id="i0"]')?.getBoundingClientRect().top;
      const before = anchorTop();

      const older = Array.from({ length: 20 }, (_, i) => ({ id: `older-${i}`, label: `Older ${i}` }));
      el.data = [...older, ...el.data]; // simulates a real load-more's own output shape
      await el.updateComplete;

      await waitFor(() => {
        const top = anchorTop();
        return top !== undefined && Math.abs(top - /** @type {number} */ (before)) < 1;
      });

      expect(anchorTop()).to.be.closeTo(/** @type {number} */ (before), 1);
    });
  });
});
