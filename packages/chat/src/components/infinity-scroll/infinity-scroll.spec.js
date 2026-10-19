import { expect, fixture, html } from "@open-wc/testing";

import "./infinity-scroll.js";
/** @import { ChxInfinityScroll } from "./infinity-scroll.js" */

/**
 * @param {() => boolean} predicate
 * @param {number} [timeout]
 */
async function waitFor(predicate, timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("waitFor timed out");
}

/** Resolves once `scrollTop` has held still for `quiet` ms. @param {HTMLElement} scroller */
async function settled(scroller, quiet = 400) {
  let last = scroller.scrollTop;
  let since = Date.now();
  const start = Date.now();
  while (Date.now() - since < quiet && Date.now() - start < 5000) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (Math.abs(scroller.scrollTop - last) > 0.5) {
      last = scroller.scrollTop;
      since = Date.now();
    }
  }
}

/** @param {HTMLElement} scroller */
function distanceToBottom(scroller) {
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
}

/**
 * Rows far taller than the estimate, like agent replies with code blocks.
 * @param {{ count?: number, scrollMode?: "pin-top" | "stick-bottom", footer?: boolean }} [options]
 */
async function tallRows({ count = 60, scrollMode = "stick-bottom", footer = false } = {}) {
  /** @type {Map<number, number>} */
  const heights = new Map();
  const el = /** @type {ChxInfinityScroll} */ (
    await fixture(html`
      <chx-infinity-scroll
        style="height: 400px;"
        scroll-mode=${scrollMode}
        .hasMore=${false}
        .data=${Array.from({ length: count }, (_, i) => i)}
        .estimateItemSize=${() => 40}
        .renderItem=${(/** @type {number} */ i) =>
          html`<div class="row" data-row=${i} style="height: ${heights.get(i) ?? 240}px">
            ${i}
          </div>`}
      >
        ${footer ? html`<div slot="footer" style="height: 120px">typing…</div>` : ""}
      </chx-infinity-scroll>
    `)
  );
  const scroller = /** @type {HTMLElement} */ (
    el.shadowRoot?.querySelector(".infinity-scroll__scroller")
  );
  await waitFor(() => scroller.scrollHeight > 1000 && distanceToBottom(scroller) <= 1);
  await settled(scroller);
  return { el, scroller, heights };
}

/** A user scroll to the top, as the wheel would do it. @param {HTMLElement} scroller */
async function userScrollToTop(scroller) {
  scroller.dispatchEvent(new Event("wheel"));
  scroller.scrollTop = 0;
  scroller.dispatchEvent(new Event("scroll"));
  await settled(scroller);
}

/** Every smooth scroll stops 200px before where it would land. @param {HTMLElement} scroller */
function endSmoothScrollsShort(scroller) {
  const scrollTo = scroller.scrollTo.bind(scroller);
  scroller.scrollTo = /** @type {typeof scroller.scrollTo} */ (
    (/** @type {ScrollToOptions} */ options) => {
      if (options.behavior !== "smooth") return scrollTo(options);
      const max = scroller.scrollHeight - scroller.clientHeight;
      scrollTo({ top: Math.min(options.top ?? 0, max) - 200 });
    }
  );
}

/**
 * Grows `index`'s row for a few frames, while a smooth scroll is underway.
 * @param {ChxInfinityScroll} el
 * @param {Map<number, number>} heights
 * @param {number} index
 */
async function growWhileScrolling(el, heights, index) {
  for (let step = 0; step < 5; step++) {
    await new Promise((resolve) => setTimeout(resolve, 40));
    heights.set(index, (heights.get(index) ?? 240) + 200);
    el.requestUpdate();
  }
}

describe("chx-infinity-scroll", () => {
  describe("scrollToBottom()", function () {
    this.timeout(15000);

    it("lands below the footer", async () => {
      const { el, scroller } = await tallRows({ footer: true });
      await userScrollToTop(scroller);

      el.scrollToBottom();
      await settled(scroller);

      expect(distanceToBottom(scroller)).to.be.at.most(1);
    });
  });

  describe("scrollToBottom('smooth')", function () {
    this.timeout(15000);

    it("lands at the bottom when rows below were never measured", async () => {
      const { el, scroller } = await tallRows();
      await userScrollToTop(scroller);
      // as after a width change re-wraps every row: nothing below the view has a real height
      el.dropMeasurements(Array.from({ length: 60 }, (_, i) => i));
      await el.updateComplete;
      await settled(scroller);

      el.scrollToBottom("smooth");
      await settled(scroller);

      expect(distanceToBottom(scroller)).to.be.at.most(1);
    });

    it("lands at the bottom when the last row grows during the scroll", async () => {
      const { el, scroller, heights } = await tallRows();
      await userScrollToTop(scroller);

      el.scrollToBottom("smooth");
      await growWhileScrolling(el, heights, 59);
      await settled(scroller);

      expect(distanceToBottom(scroller)).to.be.at.most(1);
    });

    // WebKit ends a smooth scroll short when scrollHeight shrinks mid-animation (rows measured on
    // the way, a pin offset moving with them); this stands in for that.
    for (const scrollMode of /** @type {const} */ (["pin-top", "stick-bottom"])) {
      it(`finishes at the bottom when the animation ends short (${scrollMode})`, async () => {
        const { el, scroller } = await tallRows({ scrollMode });
        await userScrollToTop(scroller);
        endSmoothScrollsShort(scroller);

        el.scrollToBottom("smooth");
        await settled(scroller);

        expect(distanceToBottom(scroller)).to.be.at.most(1);
      });
    }

    it("leaves the view where the user scrolled up to during the animation", async () => {
      const { el, scroller } = await tallRows();
      await userScrollToTop(scroller);
      endSmoothScrollsShort(scroller);

      el.scrollToBottom("smooth");
      await new Promise((resolve) => setTimeout(resolve, 50));
      scroller.dispatchEvent(new Event("wheel"));
      scroller.scrollTop -= 1000;
      scroller.dispatchEvent(new Event("scroll"));
      await settled(scroller);

      expect(distanceToBottom(scroller)).to.be.greaterThan(1000);
    });
  });
});
