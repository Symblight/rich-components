import { expect, fixture, html } from "@open-wc/testing";

import "./streaming-indicator.js";
/** @import { ChxStreamingIndicator } from "./streaming-indicator.js" */

describe("chx-streaming-indicator", () => {
  it("renders a decorative dots bubble", async () => {
    const el = /** @type {ChxStreamingIndicator} */ (
      await fixture(html`<chx-streaming-indicator></chx-streaming-indicator>`)
    );
    const bubble = el.shadowRoot?.querySelector(".streaming-indicator__bubble");
    expect(bubble).to.exist;
    expect(bubble?.getAttribute("aria-hidden")).to.equal("true");
    expect(bubble?.querySelectorAll(".streaming-indicator__dot")).to.have.lengthOf(3);
  });

  it("has no aria-live region — streaming start/finish is announced elsewhere", async () => {
    const el = /** @type {ChxStreamingIndicator} */ (
      await fixture(html`<chx-streaming-indicator></chx-streaming-indicator>`)
    );
    expect(el.shadowRoot?.querySelector("[aria-live]")).to.not.exist;
  });
});
