import { expect, fixture, html } from "@open-wc/testing";

import "./message-list.js";
/** @import { ChxMessageList } from "./message-list.js" */
/** @import { ChxInfinityScroll } from "../infinity-scroll/infinity-scroll.js" */

/** @param {string} id @param {boolean} own @param {number} [words] */
function message(id, own, words = 60) {
  return {
    id,
    own,
    createdAt: Date.now(),
    parts: [{ id: `${id}-t1`, type: "text", text: "word ".repeat(words) }],
  };
}

/** @param {ChxMessageList} el */
function infinityScrollOf(el) {
  return /** @type {ChxInfinityScroll} */ (el.shadowRoot?.querySelector("chx-infinity-scroll"));
}

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

for (const noVirtualization of [false, true]) {
  describe(`chx-message-list scroll-mode="pin-top"${noVirtualization ? " (no-virtualization)" : ""}`, function () {
    this.timeout(10000);

    /** @param {"auto" | "smooth"} behavior */
    async function pinnedList(behavior) {
      const el = /** @type {ChxMessageList} */ (
        await fixture(
          html`<chx-message-list
            style="height: 300px; width: 400px;"
            scroll-mode="pin-top"
            scroll-behavior=${behavior}
            .noVirtualization=${noVirtualization}
          ></chx-message-list>`,
        )
      );
      el.messages = Array.from({ length: 10 }, (_, i) => message(`m${i}`, i % 2 === 0));
      await el.updateComplete;
      const scroller = /** @type {HTMLElement} */ (
        infinityScrollOf(el).shadowRoot?.querySelector(".infinity-scroll__scroller")
      );
      await waitFor(() => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 1);
      return { el, scroller };
    }

    /** The sent row's distance from the scroller's top edge, or `undefined` while unmounted.
     *  @param {ChxMessageList} el @param {HTMLElement} scroller */
    function sentRowTop(el, scroller) {
      const row = infinityScrollOf(el).shadowRoot?.querySelector('[data-item-key="sent"]');
      if (!row) return undefined;
      return row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    }

    /** @param {ChxMessageList} el @param {HTMLElement} scroller */
    function isPinned(el, scroller) {
      const top = sentRowTop(el, scroller);
      const paddingTop = parseFloat(getComputedStyle(scroller).paddingBlockStart) || 0;
      return top !== undefined && Math.abs(top - paddingTop) <= 1;
    }

    /** @param {ChxMessageList} el */
    async function send(el) {
      el.messages = [...el.messages, message("sent", true, 3)];
      await el.updateComplete;
    }

    for (const behavior of /** @type {const} */ (["auto", "smooth"])) {
      // rows above the pin are only estimated until the scroll mounts them, then measured
      it(`scrolls a sent message to the top (${behavior})`, async () => {
        const { el, scroller } = await pinnedList(behavior);
        await send(el);
        await waitFor(() => isPinned(el, scroller));
      });
    }

    it("lands the pin when the browser drops the smooth scroll", async () => {
      const { el, scroller } = await pinnedList("smooth");
      const scrollTo = scroller.scrollTo.bind(scroller);
      // WebKit sometimes takes a smooth scrollTo() and never moves, with no scroll event at all
      scroller.scrollTo = /** @type {typeof scroller.scrollTo} */ (
        (/** @type {ScrollToOptions} */ options) => {
          if (options?.behavior !== "smooth") scrollTo(options);
        }
      );
      await send(el);
      await waitFor(() => isPinned(el, scroller));
    });

    it("leaves a scroll it didn't make alone once landed", async () => {
      const { el, scroller } = await pinnedList("auto");
      await send(el);
      await waitFor(() => isPinned(el, scroller));
      await sleep(700); // past the settle (PinController's SETTLE_MS)

      // find-in-page, assistive tech, focus moving into an older message: no gesture on the scroller
      scroller.scrollTop -= 200;
      await sleep(50);
      const scrolledTo = /** @type {number} */ (sentRowTop(el, scroller));
      await sleep(300);
      expect(sentRowTop(el, scroller)).to.be.closeTo(scrolledTo, 1);
      expect(isPinned(el, scroller)).to.be.false;
    });

    it("leaves the view alone once the user scrolls", async () => {
      const { el, scroller } = await pinnedList("auto");
      await send(el);
      await waitFor(() => isPinned(el, scroller));

      scroller.dispatchEvent(new Event("wheel"));
      scroller.scrollTop -= 200;
      // where the content sits, not scrollTop: measuring rows above moves scrollTop under a still view
      const scrolledTo = /** @type {number} */ (sentRowTop(el, scroller));
      await sleep(300);
      expect(sentRowTop(el, scroller)).to.be.closeTo(scrolledTo, 1);
    });

    it("follows new messages again when the mode is switched off before the pin lands", async () => {
      const { el, scroller } = await pinnedList("auto");
      el.messages = [...el.messages, message("sent", true, 3)];
      el.scrollMode = "stick-bottom";
      await el.updateComplete;

      el.messages = [...el.messages, message("reply", false)];
      await el.updateComplete;
      await waitFor(() => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 1);
    });
  });
}
