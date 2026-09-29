import { expect, fixture, html } from "@open-wc/testing";

import "../index.js";

describe("edx-editor", () => {
  it("renders", async () => {
    const el = await fixture(html`<edx-editor></edx-editor>`);
    expect(el.shadowRoot?.querySelector("[part=content]")).to.exist;
  });
});
