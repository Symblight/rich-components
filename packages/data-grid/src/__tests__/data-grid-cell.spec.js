import { expect, fixture, html } from "@open-wc/testing";

import "../index.js";
/** @import { MdDataGrid } from "../base/data-grid.js" */

// md-data-grid-cell always renders inside an md-data-grid (it consumes
// dataGridContext), so we exercise it through a minimal real grid rather than
// hand-rolling a synthetic context provider.
describe("md-data-grid-cell", () => {
  it("renders the raw field value when no renderCell/valueGetter is given", async () => {
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`<md-data-grid></md-data-grid>`)
    );
    el.columns = [{ field: "name" }];
    el.rows = [{ id: 1, name: "Ada" }];
    await el.updateComplete;

    const cell = /** @type {any} */ (
      el.shadowRoot.querySelector("md-data-grid-cell")
    );
    await cell.updateComplete;
    expect(cell.shadowRoot.textContent).to.contain("Ada");
  });

  it("uses valueGetter to compute the displayed value", async () => {
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`<md-data-grid></md-data-grid>`)
    );
    el.columns = [
      {
        field: "amount",
        valueGetter: ({ row }) => `${row.amount} €`,
      },
    ];
    el.rows = [{ id: 1, amount: 12 }];
    await el.updateComplete;

    const cell = /** @type {any} */ (
      el.shadowRoot.querySelector("md-data-grid-cell")
    );
    await cell.updateComplete;
    expect(cell.shadowRoot.textContent).to.contain("12 €");
  });

  it("passes { row, column, rowIndex, value } to renderCell", async () => {
    let received;
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`<md-data-grid></md-data-grid>`)
    );
    el.columns = [
      {
        field: "name",
        renderCell: (params) => {
          received = params;
          return html`${params.value}`;
        },
      },
    ];
    el.rows = [{ id: 1, name: "Ada" }];
    await el.updateComplete;

    const cell = /** @type {any} */ (
      el.shadowRoot.querySelector("md-data-grid-cell")
    );
    await cell.updateComplete;

    expect(received.row).to.deep.equal({ id: 1, name: "Ada" });
    expect(received.column.field).to.equal("name");
    expect(received.rowIndex).to.equal(0);
    expect(received.value).to.equal("Ada");
  });

  it("applies an align modifier class from column.align", async () => {
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`<md-data-grid></md-data-grid>`)
    );
    el.columns = [{ field: "amount", align: "right" }];
    el.rows = [{ id: 1, amount: 12 }];
    await el.updateComplete;

    const cell = /** @type {any} */ (
      el.shadowRoot.querySelector("md-data-grid-cell")
    );
    await cell.updateComplete;
    expect(cell.classList.contains("data-grid-cell_align-right")).to.be.true;
  });

  it("focusCell() moves DOM focus to the cell itself", async () => {
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`<md-data-grid></md-data-grid>`)
    );
    el.columns = [{ field: "name" }];
    el.rows = [{ id: 1, name: "Ada" }];
    await el.updateComplete;

    const cell = /** @type {any} */ (
      el.shadowRoot.querySelector("md-data-grid-cell")
    );
    await cell.updateComplete;
    cell.focusCell();

    expect(el.shadowRoot.activeElement).to.equal(cell);
  });

  describe("highlight on focus", () => {
    it("applies data-grid-cell_highlighted once the cell is focused", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [{ field: "name" }];
      el.rows = [{ id: 1, name: "Ada" }];
      await el.updateComplete;

      const cell = /** @type {any} */ (
        el.shadowRoot.querySelector("md-data-grid-cell")
      );
      await cell.updateComplete;
      expect(cell.classList.contains("data-grid-cell_highlighted")).to.be.false;

      cell.focusCell();
      await el.updateComplete;
      await cell.updateComplete;

      expect(cell.classList.contains("data-grid-cell_highlighted")).to.be.true;
    });

    it("skips the highlight class when the grid has disable-cell-highlight set", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid disable-cell-highlight></md-data-grid>`,
        )
      );
      el.columns = [{ field: "name" }];
      el.rows = [{ id: 1, name: "Ada" }];
      await el.updateComplete;

      const cell = /** @type {any} */ (
        el.shadowRoot.querySelector("md-data-grid-cell")
      );
      await cell.updateComplete;
      cell.focusCell();
      await el.updateComplete;
      await cell.updateComplete;

      expect(cell.classList.contains("data-grid-cell_highlighted")).to.be.false;
      // still logically the focused cell — only the visual is suppressed
      expect(el._gridContextProvider.value.focusedCell).to.deep.equal({
        rowIndex: 0,
        colIndex: 0,
      });
    });

    it("moves the highlight to a different cell clicked afterwards", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [{ field: "a" }, { field: "b" }];
      el.rows = [{ id: 1, a: "x", b: "y" }];
      await el.updateComplete;

      const cells = /** @type {any[]} */ (
        Array.from(el.shadowRoot.querySelectorAll("md-data-grid-cell"))
      );
      await Promise.all(cells.map((c) => c.updateComplete));

      cells[0].focusCell();
      await el.updateComplete;
      await Promise.all(cells.map((c) => c.updateComplete));
      expect(cells[0].classList.contains("data-grid-cell_highlighted")).to.be
        .true;

      cells[1].focusCell();
      await el.updateComplete;
      await Promise.all(cells.map((c) => c.updateComplete));

      expect(cells[0].classList.contains("data-grid-cell_highlighted")).to.be
        .false;
      expect(cells[1].classList.contains("data-grid-cell_highlighted")).to.be
        .true;
    });
  });
});
