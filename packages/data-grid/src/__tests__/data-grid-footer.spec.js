import { expect, fixture, html } from "@open-wc/testing";

import "../index.js";
/** @import { MdDataGrid } from "../base/data-grid.js" */

/** @param {number} count */
function makeRows(count) {
  return Array.from({ length: count }, (_, i) => ({ id: i }));
}

const COLUMNS = [{ field: "id" }];

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// md-data-grid-footer always renders inside an md-data-grid (it consumes
// dataGridContext), so we exercise it through a minimal real grid rather than
// hand-rolling a synthetic context provider.
describe("md-data-grid-footer", () => {
  it("renders the '{first}–{last} of {total}' count text", async () => {
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`<md-data-grid></md-data-grid>`)
    );
    el.columns = COLUMNS;
    el.rows = makeRows(10);
    el.paginationModel = { page: 1, pageSize: 4 }; // rows 4-7
    await el.updateComplete;

    const footer = /** @type {any} */ (
      el.shadowRoot.querySelector("md-data-grid-footer")
    );
    await footer.updateComplete;

    const count = footer.shadowRoot.querySelector('[part="footer-count"]');
    expect(count.textContent.replace(/\s+/g, " ").trim()).to.equal("5–8 of 10");
  });

  it("disables prev at the first page and next at the last page", async () => {
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`<md-data-grid></md-data-grid>`)
    );
    el.columns = COLUMNS;
    el.rows = makeRows(9);
    el.paginationModel = { page: 0, pageSize: 3 }; // 3 pages total
    await el.updateComplete;

    const footer = /** @type {any} */ (
      el.shadowRoot.querySelector("md-data-grid-footer")
    );
    await footer.updateComplete;
    const prev = footer.shadowRoot.querySelector('[part="footer-prev"]');
    const next = footer.shadowRoot.querySelector('[part="footer-next"]');
    expect(prev.disabled).to.be.true;
    expect(next.disabled).to.be.false;
  });

  it("clicking next advances the grid's paginationModel", async () => {
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`<md-data-grid></md-data-grid>`)
    );
    el.columns = COLUMNS;
    el.rows = makeRows(9);
    el.paginationModel = { page: 0, pageSize: 3 };
    await el.updateComplete;

    const footer = /** @type {any} */ (
      el.shadowRoot.querySelector("md-data-grid-footer")
    );
    await footer.updateComplete;
    const next = footer.shadowRoot.querySelector('[part="footer-next"]');
    next.dispatchEvent(new Event("click", { bubbles: true }));

    expect(el.paginationModel.page).to.equal(1);
  });

  it("clicking prev at the first page is a no-op (button disabled)", async () => {
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`<md-data-grid></md-data-grid>`)
    );
    el.columns = COLUMNS;
    el.rows = makeRows(9);
    el.paginationModel = { page: 0, pageSize: 3 };
    await el.updateComplete;

    const footer = /** @type {any} */ (
      el.shadowRoot.querySelector("md-data-grid-footer")
    );
    await footer.updateComplete;
    const prev = footer.shadowRoot.querySelector('[part="footer-prev"]');
    expect(prev.disabled).to.be.true;
    expect(el.paginationModel.page).to.equal(0);
  });

  describe("rows-per-page selector (md-select)", () => {
    it("renders the label and default page size options", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(9);
      el.paginationModel = { page: 0, pageSize: 25 };
      await el.updateComplete;

      const footer = /** @type {any} */ (
        el.shadowRoot.querySelector("md-data-grid-footer")
      );
      await footer.updateComplete;

      const label = footer.shadowRoot.querySelector(
        '[part="rows-per-page-label"]',
      );
      expect(label.textContent).to.contain("Rows per page:");

      const select = /** @type {any} */ (
        footer.shadowRoot.querySelector('[part="page-size-select"]')
      );
      expect(select.tagName.toLowerCase()).to.equal("md-select");
      await select.updateComplete;
      const values = Array.from(select.querySelectorAll("md-option")).map(
        (/** @type {any} */ o) => Number(o.value),
      );
      expect(values).to.deep.equal([10, 25, 50, 100]);

      await settle();
      expect(select.value).to.equal("25");
    });

    it("respects a custom pageSizeOptions list", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(9);
      el.pageSizeOptions = [5, 15];
      el.paginationModel = { page: 0, pageSize: 5 };
      await el.updateComplete;

      const footer = /** @type {any} */ (
        el.shadowRoot.querySelector("md-data-grid-footer")
      );
      await footer.updateComplete;
      const select = /** @type {any} */ (
        footer.shadowRoot.querySelector('[part="page-size-select"]')
      );
      await select.updateComplete;
      const values = Array.from(select.querySelectorAll("md-option")).map(
        (/** @type {any} */ o) => Number(o.value),
      );
      expect(values).to.deep.equal([5, 15]);
    });

    it("merges an out-of-list current pageSize into the options so it stays selectable", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(9);
      el.paginationModel = { page: 0, pageSize: 8 }; // not in the default [10,25,50,100]
      await el.updateComplete;

      const footer = /** @type {any} */ (
        el.shadowRoot.querySelector("md-data-grid-footer")
      );
      await footer.updateComplete;
      const select = /** @type {any} */ (
        footer.shadowRoot.querySelector('[part="page-size-select"]')
      );
      await select.updateComplete;
      const values = Array.from(select.querySelectorAll("md-option")).map(
        (/** @type {any} */ o) => Number(o.value),
      );
      expect(values).to.deep.equal([8, 10, 25, 50, 100]);

      await settle();
      expect(select.value).to.equal("8");
    });

    it("changing the select calls setPageSize and resets to page 0", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(60);
      el.paginationModel = { page: 1, pageSize: 25 };
      await el.updateComplete;

      const footer = /** @type {any} */ (
        el.shadowRoot.querySelector("md-data-grid-footer")
      );
      await footer.updateComplete;
      const select = /** @type {any} */ (
        footer.shadowRoot.querySelector('[part="page-size-select"]')
      );
      await select.updateComplete;
      await settle();

      // Drive the change through md-select's own internal native <select>,
      // the way a real user selection would, so md-select's handleChange
      // re-dispatches "change" on itself for our footer to react to.
      const nativeSelect = select.shadowRoot.querySelector("select");
      nativeSelect.value = "50";
      nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));

      expect(el.paginationModel).to.deep.equal({ page: 0, pageSize: 50 });
    });

    it("hides the selector when pageSizeOptions is empty", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(9);
      el.pageSizeOptions = [];
      el.paginationModel = { page: 0, pageSize: 3 };
      await el.updateComplete;

      const footer = /** @type {any} */ (
        el.shadowRoot.querySelector("md-data-grid-footer")
      );
      await footer.updateComplete;
      expect(footer.shadowRoot.querySelector('[part="page-size-select"]')).to.be
        .null;
    });
  });
});
