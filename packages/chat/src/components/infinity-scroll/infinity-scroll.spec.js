import { expect, fixture, html } from "@open-wc/testing";

import "./infinity-scroll.js";
/** @import { ChxInfinityScroll } from "./infinity-scroll.js" */

/** @param {() => boolean} predicate @param {number} [timeout] */
async function waitFor(predicate, timeout = 3000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {number} from @param {number} count */
const items = (from, count) => Array.from({ length: count }, (_, i) => `item ${from + i}`);

describe("chx-infinity-scroll no-virtualization", function () {
  this.timeout(10000);

  async function plainList() {
    const el = /** @type {ChxInfinityScroll} */ (
      await fixture(
        html`<chx-infinity-scroll
          style="height: 300px; width: 300px;"
          no-virtualization
          .hasMore=${false}
          .data=${items(100, 40)}
          .itemKey=${(/** @type {string} */ item) => item}
          .renderItem=${(/** @type {string} */ item) => html`<div style="height: 50px;">${item}</div>`}
        ></chx-infinity-scroll>`,
      )
    );
    const scroller = /** @type {HTMLElement} */ (
      el.shadowRoot?.querySelector(".infinity-scroll__scroller")
    );
    await waitFor(() => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 1);
    return { el, scroller };
  }

  /** @param {ChxInfinityScroll} el @param {HTMLElement} scroller @param {string} key */
  function topOf(el, scroller, key) {
    const row = el.shadowRoot?.querySelector(`[data-item-key="${key}"]`);
    return (row?.getBoundingClientRect().top ?? NaN) - scroller.getBoundingClientRect().top;
  }

  /** The user scrolls up to `scrollTop`; `then` runs right after the list's own scroll handler.
   *  @param {HTMLElement} scroller @param {number} scrollTop @param {() => void} then */
  async function userScroll(scroller, scrollTop, then) {
    scroller.addEventListener("scroll", then, { once: true });
    scroller.dispatchEvent(new Event("wheel"));
    scroller.scrollTop = scrollTop;
    await waitFor(() => Math.abs(scroller.scrollTop - scrollTop) <= 1);
  }

  it("keeps the user's scroll when the rows change in the same frame", async () => {
    const { el, scroller } = await plainList();
    await userScroll(scroller, 300, () => {
      el.data = el.data.map((item) => (item === "item 139" ? "item 139 edited" : item));
    });

    await sleep(300);
    expect(scroller.scrollTop).to.be.closeTo(300, 1);
  });

  it("keeps the content in place when older rows are prepended during a scroll", async () => {
    const { el, scroller } = await plainList();
    /** @type {number} */
    let before = NaN;
    await userScroll(scroller, 300, () => {
      before = topOf(el, scroller, "item 106");
      el.data = [...items(90, 10), ...el.data];
    });

    await sleep(300);
    expect(topOf(el, scroller, "item 106")).to.be.closeTo(before, 1);
  });
});
