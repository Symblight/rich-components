import { expect, fixture, html } from "@open-wc/testing";

import "../index.js";
/** @import { MdDataGrid } from "../base/data-grid.js" */

// md-data-grid-header-cell always renders inside an md-data-grid (it consumes
// dataGridContext), so we exercise it through a minimal real grid rather than
// hand-rolling a synthetic context provider.
describe("md-data-grid-header-cell", () => {
  it("renders the column's headerName", async () => {
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`<md-data-grid></md-data-grid>`)
    );
    el.columns = [{ field: "name", headerName: "Full Name" }];
    el.rows = [];
    await el.updateComplete;

    const header = /** @type {any} */ (
      el.shadowRoot.querySelector("md-data-grid-header-cell")
    );
    await header.updateComplete;
    expect(header.shadowRoot.textContent).to.contain("Full Name");
  });

  it("falls back to the field name when headerName is omitted", async () => {
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`<md-data-grid></md-data-grid>`)
    );
    el.columns = [{ field: "email" }];
    el.rows = [];
    await el.updateComplete;

    const header = /** @type {any} */ (
      el.shadowRoot.querySelector("md-data-grid-header-cell")
    );
    await header.updateComplete;
    expect(header.shadowRoot.textContent).to.contain("email");
  });

  it("uses renderHeader when provided", async () => {
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`<md-data-grid></md-data-grid>`)
    );
    el.columns = [
      {
        field: "name",
        renderHeader: (column) => html`<i>${column.field}!</i>`,
      },
    ];
    el.rows = [];
    await el.updateComplete;

    const header = /** @type {any} */ (
      el.shadowRoot.querySelector("md-data-grid-header-cell")
    );
    await header.updateComplete;
    expect(header.shadowRoot.querySelector("i")).to.exist;
    expect(header.shadowRoot.textContent).to.contain("name!");
  });

  it("applies an align modifier class from column.align", async () => {
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`<md-data-grid></md-data-grid>`)
    );
    el.columns = [{ field: "amount", align: "right" }];
    el.rows = [];
    await el.updateComplete;

    const header = /** @type {any} */ (
      el.shadowRoot.querySelector("md-data-grid-header-cell")
    );
    await header.updateComplete;
    expect(header.classList.contains("data-grid-header-cell_align-right")).to.be
      .true;
  });
});
