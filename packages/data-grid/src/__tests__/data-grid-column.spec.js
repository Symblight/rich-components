import { expect, fixture, html } from "@open-wc/testing";

import "../index.js";
/** @import { MdDataGridColumn } from "../components/column/data-grid-column.js" */

// md-data-grid-column never renders anything and doesn't consume any
// context — it's a standalone data carrier, so it's exercised directly
// rather than inside an md-data-grid.
describe("md-data-grid-column", () => {
  it("renders nothing (display: none)", async () => {
    const el = /** @type {MdDataGridColumn} */ (
      await fixture(
        html`<md-data-grid-column field="name"></md-data-grid-column>`,
      )
    );
    expect(getComputedStyle(el).display).to.equal("none");
  });

  it("converts every serializable attribute to its matching property", async () => {
    const el = /** @type {MdDataGridColumn} */ (
      await fixture(html`
        <md-data-grid-column
          field="amount"
          header-name="Amount"
          width="140"
          min-width="80"
          max-width="200"
          col-span="2"
          align="right"
        ></md-data-grid-column>
      `)
    );

    expect(el.field).to.equal("amount");
    expect(el.headerName).to.equal("Amount");
    expect(el.width).to.equal(140);
    expect(el.minWidth).to.equal(80);
    expect(el.maxWidth).to.equal(200);
    expect(el.colSpan).to.equal(2);
    expect(el.align).to.equal("right");
  });

  describe("tri-state boolean attributes (resizable/sortable/rowSpannable)", () => {
    it("are undefined when the attribute is absent — not false", async () => {
      const el = /** @type {MdDataGridColumn} */ (
        await fixture(
          html`<md-data-grid-column field="a"></md-data-grid-column>`,
        )
      );
      expect(el.resizable).to.be.undefined;
      expect(el.sortable).to.be.undefined;
      expect(el.rowSpannable).to.be.undefined;
    });

    it("are true when the attribute is present with no value (shorthand)", async () => {
      const el = /** @type {MdDataGridColumn} */ (
        await fixture(
          html`<md-data-grid-column
            field="a"
            resizable
            sortable
            row-spannable
          ></md-data-grid-column>`,
        )
      );
      expect(el.resizable).to.be.true;
      expect(el.sortable).to.be.true;
      expect(el.rowSpannable).to.be.true;
    });

    it('are false only when the attribute value is exactly "false"', async () => {
      const el = /** @type {MdDataGridColumn} */ (
        await fixture(
          html`<md-data-grid-column
            field="a"
            resizable="false"
            sortable="false"
            row-spannable="false"
          ></md-data-grid-column>`,
        )
      );
      expect(el.resizable).to.be.false;
      expect(el.sortable).to.be.false;
      expect(el.rowSpannable).to.be.false;
    });
  });

  describe("toColumnDef()", () => {
    it("includes only the fields that were actually set", async () => {
      const el = /** @type {MdDataGridColumn} */ (
        await fixture(
          html`<md-data-grid-column field="name"></md-data-grid-column>`,
        )
      );
      expect(el.toColumnDef()).to.deep.equal({ field: "name" });
    });

    it("matches a hand-written DataGridColumn object for a fully-specified column", async () => {
      const el = /** @type {MdDataGridColumn} */ (
        await fixture(html`
          <md-data-grid-column
            field="amount"
            header-name="Amount"
            width="140"
            min-width="80"
            max-width="200"
            col-span="2"
            resizable="false"
            sortable
            row-spannable="false"
            align="right"
            cell-class-name="amount-cell"
            header-class-name="amount-header"
          ></md-data-grid-column>
        `)
      );

      expect(el.toColumnDef()).to.deep.equal({
        field: "amount",
        headerName: "Amount",
        width: 140,
        minWidth: 80,
        maxWidth: 200,
        colSpan: 2,
        resizable: false,
        sortable: true,
        rowSpannable: false,
        align: "right",
        cellClassName: "amount-cell",
        headerClassName: "amount-header",
      });
    });

    it("carries function-valued fields set imperatively (the non-attribute escape hatch)", async () => {
      const el = /** @type {MdDataGridColumn} */ (
        await fixture(
          html`<md-data-grid-column field="status"></md-data-grid-column>`,
        )
      );

      const renderCell = (/** @type {any} */ { value }) => `<b>${value}</b>`;
      const valueGetter = (/** @type {any} */ { row }) => row.status;
      const renderHeader = () => "Status";
      const rowSpanValueGetter = (/** @type {any} */ { row }) => row.status;
      el.renderCell = renderCell;
      el.valueGetter = valueGetter;
      el.renderHeader = renderHeader;
      el.rowSpanValueGetter = rowSpanValueGetter;

      const column = el.toColumnDef();
      expect(column.renderCell).to.equal(renderCell);
      expect(column.valueGetter).to.equal(valueGetter);
      expect(column.renderHeader).to.equal(renderHeader);
      expect(column.rowSpanValueGetter).to.equal(rowSpanValueGetter);
    });

    it("accepts a function assigned directly to cellClassName/headerClassName despite their string-typed attribute", async () => {
      const el = /** @type {MdDataGridColumn} */ (
        await fixture(
          html`<md-data-grid-column field="status"></md-data-grid-column>`,
        )
      );

      const cellClassName = () => "computed-cell";
      el.cellClassName = cellClassName;

      expect(el.toColumnDef().cellClassName).to.equal(cellClassName);
    });

    it("treats a removed numeric attribute the same as one that was never set", async () => {
      const el = /** @type {MdDataGridColumn} */ (
        await fixture(
          html`<md-data-grid-column
            field="a"
            width="140"
          ></md-data-grid-column>`,
        )
      );
      expect(el.toColumnDef().width).to.equal(140);

      el.removeAttribute("width");
      await el.updateComplete;

      expect(el.toColumnDef()).to.not.have.property("width");
    });
  });
});
