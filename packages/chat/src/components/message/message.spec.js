import { expect, fixture, html } from "@open-wc/testing";

import "./message.js";
/** @import { ChxMessage } from "./message.js" */

describe("chx-message", () => {
  it("renders slotted content", async () => {
    const el = /** @type {ChxMessage} */ (
      await fixture(html`<chx-message><span>hello</span></chx-message>`)
    );
    expect(el.shadowRoot?.querySelector("slot")).to.exist;
    expect(el.textContent?.trim()).to.equal("hello");
  });

  it("reflects own as a boolean attribute", async () => {
    const el = /** @type {ChxMessage} */ (await fixture(html`<chx-message></chx-message>`));
    expect(el.hasAttribute("own")).to.be.false;

    el.own = true;
    await el.updateComplete;
    expect(el.hasAttribute("own")).to.be.true;

    el.own = false;
    await el.updateComplete;
    expect(el.hasAttribute("own")).to.be.false;
  });

  it("sets role=article on the host once connected", async () => {
    const el = /** @type {ChxMessage} */ (await fixture(html`<chx-message></chx-message>`));
    expect(el.getAttribute("role")).to.equal("article");
  });

  it("reflects busy as an explicit aria-busy=\"true\"/\"false\" (not presence-only)", async () => {
    const el = /** @type {ChxMessage} */ (await fixture(html`<chx-message></chx-message>`));
    expect(el.getAttribute("aria-busy")).to.equal("false");

    el.busy = true;
    await el.updateComplete;
    expect(el.getAttribute("aria-busy")).to.equal("true");

    el.busy = false;
    await el.updateComplete;
    expect(el.getAttribute("aria-busy")).to.equal("false");
  });
});
