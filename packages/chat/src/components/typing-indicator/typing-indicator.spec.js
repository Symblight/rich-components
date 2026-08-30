import { expect, fixture, html } from "@open-wc/testing";

import "./typing-indicator.js";
/** @import { ChxTypingIndicator } from "./typing-indicator.js" */

describe("chx-typing-indicator", () => {
  it("renders a default label when value is unset", async () => {
    const el = /** @type {ChxTypingIndicator} */ (
      await fixture(html`<chx-typing-indicator></chx-typing-indicator>`)
    );
    expect(el.shadowRoot?.textContent?.trim()).to.equal("Typing…");
  });

  it("renders value when provided, instead of the default", async () => {
    const el = /** @type {ChxTypingIndicator} */ (
      await fixture(html`<chx-typing-indicator value="Alex is typing…"></chx-typing-indicator>`)
    );
    expect(el.shadowRoot?.textContent?.trim()).to.equal("Alex is typing…");
  });

  it("has an aria-live=polite label region", async () => {
    const el = /** @type {ChxTypingIndicator} */ (
      await fixture(html`<chx-typing-indicator></chx-typing-indicator>`)
    );
    const region = el.shadowRoot?.querySelector("[aria-live]");
    expect(region).to.exist;
    expect(region?.getAttribute("aria-live")).to.equal("polite");
  });
});
