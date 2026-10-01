import { expect, fixture, html } from "@open-wc/testing";

import "../index.js";

describe("cdx-code-editor", () => {
  it("renders", async () => {
    const el = await fixture(html`<cdx-code-editor></cdx-code-editor>`);
    expect(el.shadowRoot?.querySelector("[part=content]")).to.exist;
  });
});
