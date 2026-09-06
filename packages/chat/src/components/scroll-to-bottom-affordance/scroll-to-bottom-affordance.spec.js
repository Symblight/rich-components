import { expect, fixture, html, oneEvent } from "@open-wc/testing";

import "./scroll-to-bottom-affordance.js";
/** @import { ChxScrollToBottomAffordance } from "./scroll-to-bottom-affordance.js" */

describe("chx-scroll-to-bottom-affordance", () => {
  it("renders a default arrow icon inside an md-icon-button", async () => {
    const el = /** @type {ChxScrollToBottomAffordance} */ (
      await fixture(html`<chx-scroll-to-bottom-affordance></chx-scroll-to-bottom-affordance>`)
    );
    const button = el.shadowRoot?.querySelector("md-icon-button");
    expect(button).to.exist;
    expect(button?.getAttribute("aria-label")).to.equal("Scroll to latest messages");
    expect(el.shadowRoot?.querySelector("md-icon")).to.exist;
  });

  it("defaults scrollBehavior to smooth", async () => {
    const el = /** @type {ChxScrollToBottomAffordance} */ (
      await fixture(html`<chx-scroll-to-bottom-affordance></chx-scroll-to-bottom-affordance>`)
    );
    expect(el.scrollBehavior).to.equal("smooth");
  });

  it("fires chx-scroll-to-bottom-click with the current scrollBehavior on click", async () => {
    const el = /** @type {ChxScrollToBottomAffordance} */ (
      await fixture(
        html`<chx-scroll-to-bottom-affordance scroll-behavior="instant"></chx-scroll-to-bottom-affordance>`,
      )
    );
    const button = /** @type {HTMLElement} */ (el.shadowRoot?.querySelector("md-icon-button"));
    const listener = oneEvent(el, "chx-scroll-to-bottom-click");
    button.click();
    const event = await listener;
    expect(event.detail.behavior).to.equal("instant");
    expect(event.bubbles).to.be.true;
    expect(event.composed).to.be.true;
  });
});
