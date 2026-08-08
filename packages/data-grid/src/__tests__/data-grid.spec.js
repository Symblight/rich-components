import { expect, fixture, html } from "@open-wc/testing";

import "../index.js";
import { buildDataGridContext } from "../base/data-grid-build-context.js";
/** @import { MdDataGrid } from "../base/data-grid.js" */

/** @param {number} count */
function makeRows(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: `Row ${i}`,
  }));
}

const COLUMNS = [
  { field: "id", headerName: "ID", width: 60 },
  { field: "name", headerName: "Name" },
];

const settle = () =>
  new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );

describe("md-data-grid", () => {
  describe("rendering", () => {
    it("renders with no children and no error", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      expect(el).to.exist;
      expect(el.shadowRoot).to.exist;
    });

    it("renders one md-data-grid-header-cell per column, in order", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      const headers = el.shadowRoot.querySelectorAll(
        "md-data-grid-header-cell",
      );
      expect(headers.length).to.equal(2);
      expect(/** @type {any} */ (headers[0]).column.field).to.equal("id");
      expect(/** @type {any} */ (headers[1]).column.field).to.equal("name");
    });

    it("renderCell/valueGetter callbacks receive correct params and their output appears in the cell", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [
        { field: "name", headerName: "Name" },
        {
          field: "id",
          headerName: "ID",
          valueGetter: ({ row }) => `#${row.id}`,
          renderCell: ({ value }) => html`<b>${value}</b>`,
        },
      ];
      el.rows = makeRows(2);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const cell = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-cell")[1]
      );
      await cell.updateComplete;
      expect(cell.shadowRoot.textContent).to.contain("#0");
    });

    it("clips long text to the column's track width instead of blowing out into the next column", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="display:block; width: 400px;"
          ></md-data-grid>`,
        )
      );
      el.columns = [
        { field: "id", headerName: "ID", width: 60 },
        {
          field: "name",
          headerName: "A Very Long Column Header Label",
          width: 60,
        },
      ];
      el.rows = [
        { id: 1, name: "A Very Long Cell Value That Should Be Clipped" },
      ];
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const header = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[1]
      );
      await header.updateComplete;
      expect(header.getBoundingClientRect().width).to.be.at.most(60);

      const cell = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-cell")[1]
      );
      await cell.updateComplete;
      expect(cell.getBoundingClientRect().width).to.be.at.most(60);
    });

    it("wires --height on each row to rowHeight, so cells render at exactly that height", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid row-height="64"></md-data-grid>`)
      );
      el.columns = [{ field: "a" }];
      el.rows = [{ id: 1, a: "x" }];
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const cell = /** @type {any} */ (
        el.shadowRoot.querySelector("md-data-grid-cell")
      );
      await cell.updateComplete;
      expect(getComputedStyle(cell).height).to.equal("64px");
      expect(cell.getBoundingClientRect().height).to.equal(64);
    });

    it("keeps header columns the same width as body columns when squeezed narrow (no header-only blowout)", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="display:block; width: 60px;"
          ></md-data-grid>`,
        )
      );
      el.columns = [
        { field: "trader", headerName: "Trader Name" },
        { field: "trade", headerName: "Trade" },
      ];
      el.rows = [{ id: 1, trader: "Mittiford Longname", trade: "zebra-alpha" }];
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const headerRow = el.shadowRoot.querySelector(".data-grid__header");
      const bodyRow = el.shadowRoot.querySelector(".data-grid__row");
      // Padding alone (not text content) sets each grid item's minimum
      // width — if the header's padding is bigger than the cell's, its
      // tracks are forced wider than the body's, overflowing the header
      // row past the grid's own width instead of eliding the label.
      expect(getComputedStyle(headerRow).gridTemplateColumns).to.equal(
        getComputedStyle(bodyRow).gridTemplateColumns,
      );
      expect(headerRow.getBoundingClientRect().width).to.equal(
        bodyRow.getBoundingClientRect().width,
      );
    });
  });

  describe("virtualization", () => {
    it("only renders cells within the visible window + overscan for a large rows array", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="display: block; height: 300px;"
          ></md-data-grid>`,
        )
      );
      el.columns = COLUMNS;
      el.rows = makeRows(10000);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const rows = el.shadowRoot.querySelectorAll(".data-grid__row");
      expect(rows.length).to.be.lessThan(50);
    });

    it("getVisibleRows() matches the actually-rendered rows after scrolling", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="display: block; height: 300px;"
          ></md-data-grid>`,
        )
      );
      el.columns = COLUMNS;
      el.rows = makeRows(500);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const viewport = el.shadowRoot.querySelector(".data-grid__viewport");
      viewport.scrollTop = 2000;
      viewport.dispatchEvent(new Event("scroll"));
      await settle();
      await el.updateComplete;

      const visible = el.getVisibleRows();
      const renderedRowIndexes = Array.from(
        el.shadowRoot.querySelectorAll("md-data-grid-cell"),
      )
        .filter((/** @type {any} */ cell) => cell.colIndex === 0)
        .map((/** @type {any} */ cell) => cell.rowIndex);

      expect(visible.map((v) => v.rowIndex)).to.deep.equal(renderedRowIndexes);
    });

    it("adds a header gutter matching the viewport's scrollbar width when a scrollbar is present", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="display: block; height: 200px; width: 300px;"
          ></md-data-grid>`,
        )
      );
      el.columns = COLUMNS;
      el.rows = makeRows(500); // spacer is way taller than the viewport -> scrollbar appears
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const viewport = el.shadowRoot.querySelector(".data-grid__viewport");
      const scrollbarWidth = viewport.offsetWidth - viewport.clientWidth;
      const gutter = el.shadowRoot.querySelector(".data-grid__header-gutter");

      if (scrollbarWidth > 0) {
        expect(gutter).to.exist;
        const header = el.shadowRoot.querySelector(".data-grid__header");
        expect(header.style.gridTemplateColumns).to.contain(
          `${scrollbarWidth}px`,
        );
      } else {
        // headless environments without a rendered scrollbar (e.g. overlay
        // scrollbars with 0 width) legitimately have no gutter to add
        expect(gutter).to.be.null;
      }
    });

    it("renders no header gutter when the content fits without a scrollbar", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="display: block; height: 400px;"
          ></md-data-grid>`,
        )
      );
      el.columns = COLUMNS;
      el.rows = makeRows(2); // fits comfortably, no scrollbar
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      expect(el.shadowRoot.querySelector(".data-grid__header-gutter")).to.be
        .null;
    });

    it("recycles row/cell DOM nodes across a scroll jump instead of tearing them down and recreating them", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="display: block; height: 300px; width: 500px;"
          ></md-data-grid>`,
        )
      );
      el.columns = COLUMNS;
      el.rows = makeRows(5000);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const rowsBefore = [...el.shadowRoot.querySelectorAll(".data-grid__row")];
      const cellsBefore = [
        ...el.shadowRoot.querySelectorAll("md-data-grid-cell"),
      ];
      expect(rowsBefore.length).to.be.greaterThan(0);

      const viewport = el.shadowRoot.querySelector(".data-grid__viewport");
      viewport.scrollTop = 50000;
      viewport.dispatchEvent(new Event("scroll"));
      await settle();
      await el.updateComplete;

      const rowsAfter = [...el.shadowRoot.querySelectorAll(".data-grid__row")];
      const cellsAfter = [
        ...el.shadowRoot.querySelectorAll("md-data-grid-cell"),
      ];

      // Every row/cell element from before the jump is still the exact
      // same DOM node afterward — rebound to a different row rather than
      // destroyed and recreated.
      expect(rowsBefore.every((row) => rowsAfter.includes(row))).to.be.true;
      expect(cellsBefore.every((cell) => cellsAfter.includes(cell))).to.be.true;

      // The recycled cells reflect the NEW row, not stale data from before.
      const firstCellAfter = /** @type {any} */ (cellsAfter[0]);
      expect(firstCellAfter.rowIndex).to.be.greaterThan(900);
      expect(firstCellAfter.row.id).to.equal(firstCellAfter.rowIndex);
    });

    it("releases DOM focus (and dataGridContext's focusedCell) when a focused cell's DOM node is recycled to a different row", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="display: block; height: 300px; width: 500px;"
          ></md-data-grid>`,
        )
      );
      el.columns = COLUMNS;
      el.rows = makeRows(5000);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const firstCell = /** @type {any} */ (
        el.shadowRoot.querySelector("md-data-grid-cell")
      );
      firstCell.focus();
      await el.updateComplete;
      expect(el.shadowRoot.activeElement).to.equal(firstCell);
      expect(el._gridContextProvider.value.hasFocus).to.be.true;

      const viewport = el.shadowRoot.querySelector(".data-grid__viewport");
      viewport.scrollTop = 50000;
      viewport.dispatchEvent(new Event("scroll"));
      await settle();
      await el.updateComplete;

      // Same DOM node, now representing a different row — but no longer
      // holding real focus, and the shared focus state was released with
      // it (not left stuck pointing at a cell that's no longer focused).
      expect(el.shadowRoot.contains(firstCell)).to.be.true;
      expect(firstCell.rowIndex).to.be.greaterThan(900);
      expect(el.shadowRoot.activeElement).to.not.equal(firstCell);
      expect(el._gridContextProvider.value.hasFocus).to.be.false;
    });
  });

  describe("events", () => {
    it("dispatches md-data-grid-row-click with the correct detail", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(2);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const rowEl = el.shadowRoot.querySelector(".data-grid__row");
      let detail;
      el.addEventListener("md-data-grid-row-click", (e) => {
        detail = /** @type {CustomEvent} */ (e).detail;
      });
      rowEl.dispatchEvent(new Event("click", { bubbles: true }));

      expect(detail.rowIndex).to.equal(0);
      expect(detail.row.id).to.equal(0);
    });
  });

  describe("getRowId", () => {
    it("defaults to row.id", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = [{ id: "custom-1", name: "A" }];
      await el.updateComplete;

      expect(el.getRowId(el.rows[0])).to.equal("custom-1");
    });

    it("supports a custom override", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.getRowId = (row) => /** @type {any} */ (row).uuid;
      el.columns = COLUMNS;
      el.rows = [{ uuid: "abc", name: "A" }];
      await el.updateComplete;

      expect(el.getRowId(el.rows[0])).to.equal("abc");
    });
  });

  describe("pagination — client mode", () => {
    it("slices rows to the current page", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(10);
      el.paginationModel = { page: 1, pageSize: 4 };
      await el.updateComplete;

      expect(el._effectiveRows.map((r) => r.id)).to.deep.equal([4, 5, 6, 7]);
    });

    it("renders md-data-grid-footer with the correct count text and prev/next disabled state", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(10);
      el.paginationModel = { page: 0, pageSize: 4 };
      await el.updateComplete;

      const footer = /** @type {any} */ (
        el.shadowRoot.querySelector("md-data-grid-footer")
      );
      expect(footer).to.exist;
      await footer.updateComplete;

      const prev = footer.shadowRoot.querySelector('[part="footer-prev"]');
      const next = footer.shadowRoot.querySelector('[part="footer-next"]');
      expect(prev.disabled).to.be.true;
      expect(next.disabled).to.be.false;
    });

    it("prev/next disabled state flips at the last page", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(10);
      el.paginationModel = { page: 2, pageSize: 4 }; // pages: [0-3][4-7][8-9]
      await el.updateComplete;

      const footer = /** @type {any} */ (
        el.shadowRoot.querySelector("md-data-grid-footer")
      );
      await footer.updateComplete;

      const prev = footer.shadowRoot.querySelector('[part="footer-prev"]');
      const next = footer.shadowRoot.querySelector('[part="footer-next"]');
      expect(prev.disabled).to.be.false;
      expect(next.disabled).to.be.true;
    });
  });

  describe("pagination — server mode", () => {
    it("does not slice rows client-side; rowCount drives pageCount", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.paginationMode = "server";
      el.rows = makeRows(4); // just one page's worth
      el.rowCount = 42;
      el.paginationModel = { page: 0, pageSize: 4 };
      await el.updateComplete;

      expect(el._effectiveRows.length).to.equal(4);
      expect(el._pageCount).to.equal(Math.ceil(42 / 4));
    });

    it("changing pages dispatches md-data-grid-pagination-model-change without mutating rows", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.paginationMode = "server";
      const page0Rows = makeRows(4);
      el.rows = page0Rows;
      el.rowCount = 42;
      el.paginationModel = { page: 0, pageSize: 4 };
      await el.updateComplete;

      let detail;
      el.addEventListener("md-data-grid-pagination-model-change", (e) => {
        detail = /** @type {CustomEvent} */ (e).detail;
      });

      el.setPage(1);

      expect(detail).to.deep.equal({ page: 1, pageSize: 4 });
      expect(el.rows).to.equal(page0Rows); // untouched by the grid itself
    });
  });

  describe("setPage / setPageSize", () => {
    it("clamps setPage to [0, pageCount - 1]", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(10);
      el.paginationModel = { page: 0, pageSize: 4 }; // pageCount = 3

      el.setPage(99);
      expect(el.paginationModel.page).to.equal(2);

      el.setPage(-5);
      expect(el.paginationModel.page).to.equal(0);
    });

    it("setPageSize resets page to 0", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(10);
      el.paginationModel = { page: 2, pageSize: 4 };

      el.setPageSize(5);
      expect(el.paginationModel).to.deep.equal({ page: 0, pageSize: 5 });
    });

    it("does nothing when pagination is not enabled", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(10);

      el.setPage(1);
      expect(el.paginationModel).to.be.undefined;
    });
  });

  describe("hidePagination", () => {
    it("hides md-data-grid-footer while keeping pagination logic active", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(10);
      el.paginationModel = { page: 1, pageSize: 4 };
      el.hidePagination = true;
      await el.updateComplete;

      expect(el.shadowRoot.querySelector("md-data-grid-footer")).to.be.null;
      expect(el._effectiveRows.map((r) => r.id)).to.deep.equal([4, 5, 6, 7]);
    });

    it("setPage still works and still dispatches the event when hidden", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(10);
      el.paginationModel = { page: 0, pageSize: 4 };
      el.hidePagination = true;
      await el.updateComplete;

      let fired = false;
      el.addEventListener("md-data-grid-pagination-model-change", () => {
        fired = true;
      });
      el.setPage(1);

      expect(fired).to.be.true;
      expect(el.paginationModel.page).to.equal(1);
    });
  });

  describe("keyboard navigation", () => {
    it("focusing a cell updates focusedCell and moves tabindex", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const cells = /** @type {any[]} */ (
        Array.from(el.shadowRoot.querySelectorAll("md-data-grid-cell"))
      );
      const secondRowFirstCell = cells.find(
        (c) => c.rowIndex === 1 && c.colIndex === 0,
      );
      await secondRowFirstCell.updateComplete;
      secondRowFirstCell.dispatchEvent(new Event("focusin"));
      await el.updateComplete;

      expect(el._gridContextProvider.value.focusedCell).to.deep.equal({
        rowIndex: 1,
        colIndex: 0,
      });
    });

    it("ArrowRight moves focus to the next column", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const viewport = el.shadowRoot.querySelector(".data-grid__viewport");
      viewport.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
      await el.updateComplete;

      expect(el._gridContextProvider.value.focusedCell).to.deep.equal({
        rowIndex: 0,
        colIndex: 1,
      });
    });

    it("blurring the focused cell drops the highlight", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const cell = /** @type {any} */ (
        el.shadowRoot.querySelector("md-data-grid-cell")
      );
      await cell.updateComplete;
      cell.dispatchEvent(new Event("focusin"));
      await el.updateComplete;
      expect(el._gridContextProvider.value.hasFocus).to.be.true;
      expect(cell.classList.contains("data-grid-cell_highlighted")).to.be.true;

      cell.dispatchEvent(new Event("focusout"));
      await el.updateComplete;

      expect(el._gridContextProvider.value.hasFocus).to.be.false;
      expect(cell.classList.contains("data-grid-cell_highlighted")).to.be.false;
    });

    it("a stale blur from a cell that's no longer focused doesn't clear the new highlight", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const cells = /** @type {any[]} */ (
        Array.from(el.shadowRoot.querySelectorAll("md-data-grid-cell"))
      );
      const firstCell = cells.find((c) => c.rowIndex === 0 && c.colIndex === 0);
      const secondCell = cells.find(
        (c) => c.rowIndex === 1 && c.colIndex === 0,
      );
      await firstCell.updateComplete;
      firstCell.dispatchEvent(new Event("focusin"));
      await el.updateComplete;

      // Focus already moved to secondCell (e.g. via arrow-key nav) before
      // firstCell's own blur fires — its blur should now be a no-op.
      secondCell.dispatchEvent(new Event("focusin"));
      await el.updateComplete;
      firstCell.dispatchEvent(new Event("focusout"));
      await el.updateComplete;

      expect(el._gridContextProvider.value.focusedCell).to.deep.equal({
        rowIndex: 1,
        colIndex: 0,
      });
      expect(el._gridContextProvider.value.hasFocus).to.be.true;
    });
  });

  describe("updateRows", () => {
    it("deletes a row matching _action: 'delete'", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      el.updateRows([{ id: 1, _action: "delete" }]);
      await el.updateComplete;

      expect(el.rows.map((r) => r.id)).to.deep.equal([0, 2]);
    });

    it("shallow-merges an entry without _action onto the matching row", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = [{ id: 1, name: "Old", extra: "kept" }];
      await el.updateComplete;

      el.updateRows([{ id: 1, name: "New" }]);
      await el.updateComplete;

      expect(el.rows).to.deep.equal([{ id: 1, name: "New", extra: "kept" }]);
    });

    it("inserts a new row (appended to the end) when no existing row matches", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(2); // ids 0, 1
      await el.updateComplete;

      el.updateRows([{ id: 5, name: "Five" }]);
      await el.updateComplete;

      expect(el.rows.map((r) => r.id)).to.deep.equal([0, 1, 5]);
      expect(el.rows[2]).to.deep.equal({ id: 5, name: "Five" });
    });

    it("does not leak _action into the stored row data", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = [];
      await el.updateComplete;

      el.updateRows([{ id: 1, name: "A" }]);
      await el.updateComplete;

      expect(el.rows[0]).to.not.have.property("_action");
    });

    it("applies a mixed batch (delete + update + insert) in a single rows reassignment", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3); // ids 0, 1, 2
      await el.updateComplete;

      el.updateRows([
        { id: 0, _action: "delete" },
        { id: 1, name: "Updated" },
        { id: 9, name: "New" },
      ]);
      await el.updateComplete;

      expect(el.rows).to.deep.equal([
        { id: 1, name: "Updated" },
        { id: 2, name: "Row 2" },
        { id: 9, name: "New" },
      ]);
    });

    it("accepts a single object instead of an array", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(1);
      await el.updateComplete;

      el.updateRows({ id: 0, name: "Solo" });
      await el.updateComplete;

      expect(el.rows[0].name).to.equal("Solo");
    });

    it("matches entries via the grid's configured getRowId, not a literal .id", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.getRowId = (row) => /** @type {any} */ (row).uuid;
      el.rows = [{ uuid: "a", name: "Alpha" }];
      await el.updateComplete;

      el.updateRows([{ uuid: "a", name: "Alpha Updated" }]);
      await el.updateComplete;

      expect(el.rows).to.deep.equal([{ uuid: "a", name: "Alpha Updated" }]);
    });

    it("warns and skips entries with no resolvable id, still applying the rest of the batch", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(1);
      await el.updateComplete;

      const originalWarn = console.warn;
      let warned = false;
      console.warn = () => {
        warned = true;
      };
      try {
        el.updateRows([{ name: "no id here" }, { id: 5, name: "Five" }]);
      } finally {
        console.warn = originalWarn;
      }
      await el.updateComplete;

      expect(warned).to.be.true;
      expect(el.rows.map((r) => r.id)).to.deep.equal([0, 5]);
    });

    it("is a no-op (no rows reassignment) when nothing actually changes", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(2);
      await el.updateComplete;
      const originalRows = el.rows;

      el.updateRows([{ id: 999, _action: "delete" }]); // doesn't exist

      expect(el.rows).to.equal(originalRows);
    });

    it("dispatches md-data-grid-rows-update with added/updated/deleted ids", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(2); // ids 0, 1
      await el.updateComplete;

      let detail;
      el.addEventListener("md-data-grid-rows-update", (e) => {
        detail = /** @type {CustomEvent} */ (e).detail;
      });

      el.updateRows([
        { id: 0, _action: "delete" },
        { id: 1, name: "Updated" },
        { id: 9, name: "New" },
      ]);

      expect(detail).to.deep.equal({ added: [9], updated: [1], deleted: [0] });
    });

    it("clamps paginationModel.page if the change empties the current page (client mode)", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(9);
      el.paginationModel = { page: 2, pageSize: 4 }; // pages: [0-3][4-7][8] -> page 2 has just row 8
      await el.updateComplete;

      el.updateRows([{ id: 8, _action: "delete" }]);
      await el.updateComplete;

      expect(el.paginationModel.page).to.equal(1); // clamped: only 2 pages left now
    });
  });

  describe("column sizing", () => {
    it("uses a fixed px track when width is set, ignoring minWidth/maxWidth", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [{ field: "id", width: 100, minWidth: 50, maxWidth: 500 }];
      el.rows = [];
      await el.updateComplete;

      const header = el.shadowRoot.querySelector(".data-grid__header");
      expect(header.style.gridTemplateColumns.trim()).to.equal("100px");
    });

    it("stays a bare 1fr track when neither minWidth nor maxWidth is set", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [{ field: "name" }];
      el.rows = [];
      await el.updateComplete;

      const header = el.shadowRoot.querySelector(".data-grid__header");
      expect(header.style.gridTemplateColumns.trim()).to.equal("1fr");
    });

    it("uses minmax(0, {maxWidth}px) when only maxWidth is set", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [{ field: "name", maxWidth: 300 }];
      el.rows = [];
      await el.updateComplete;

      const header = el.shadowRoot.querySelector(".data-grid__header");
      // the browser normalizes the unitless 0 we pass in to "0px"
      expect(header.style.gridTemplateColumns.trim()).to.equal(
        "minmax(0px, 300px)",
      );
    });

    it("uses minmax({minWidth}px, 1fr) when only minWidth is set", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [{ field: "name", minWidth: 120 }];
      el.rows = [];
      await el.updateComplete;

      const header = el.shadowRoot.querySelector(".data-grid__header");
      expect(header.style.gridTemplateColumns.trim()).to.equal(
        "minmax(120px, 1fr)",
      );
    });

    it("combines minWidth and maxWidth into one minmax() track", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [{ field: "name", minWidth: 120, maxWidth: 300 }];
      el.rows = [];
      await el.updateComplete;

      const header = el.shadowRoot.querySelector(".data-grid__header");
      expect(header.style.gridTemplateColumns.trim()).to.equal(
        "minmax(120px, 300px)",
      );
    });
  });

  describe("colSpan", () => {
    it("renders one header per column when colSpan is unset", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS; // 2 columns
      el.rows = [];
      await el.updateComplete;

      const headers = el.shadowRoot.querySelectorAll(
        "md-data-grid-header-cell",
      );
      expect(headers.length).to.equal(2);
      expect(/** @type {any} */ (headers[0]).colSpan).to.equal(1);
    });

    it("skips the header cells covered by a preceding colSpan", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [{ field: "a", colSpan: 2 }, { field: "b" }, { field: "c" }];
      el.rows = [];
      await el.updateComplete;

      const headers = /** @type {any[]} */ (
        Array.from(el.shadowRoot.querySelectorAll("md-data-grid-header-cell"))
      );
      // "b"'s header cell is covered by "a"'s span and never renders.
      expect(headers.map((h) => h.column.field)).to.deep.equal(["a", "c"]);
      expect(headers[0].colSpan).to.equal(2);
      expect(headers[1].colSpan).to.equal(1);
    });

    it("applies grid-column: span N directly on the spanning header host", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [{ field: "a", colSpan: 3 }, { field: "b" }, { field: "c" }];
      el.rows = [];
      await el.updateComplete;

      const header = /** @type {any} */ (
        el.shadowRoot.querySelector("md-data-grid-header-cell")
      );
      await header.updateComplete;
      expect(header.style.gridColumn).to.equal("1 / span 3");
    });

    it("clamps colSpan so it never reaches past the last column", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [{ field: "a" }, { field: "b", colSpan: 5 }];
      el.rows = [];
      await el.updateComplete;

      const headers = /** @type {any[]} */ (
        Array.from(el.shadowRoot.querySelectorAll("md-data-grid-header-cell"))
      );
      expect(headers.map((h) => h.column.field)).to.deep.equal(["a", "b"]);
      expect(headers[1].colSpan).to.equal(1); // clamped from 5 down to the 1 remaining column
    });

    it("also skips the data cells covered by a preceding colSpan, in every row", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [{ field: "a", colSpan: 2 }, { field: "b" }, { field: "c" }];
      el.rows = [
        { a: 1, b: 2, c: 3 },
        { a: 4, b: 5, c: 6 },
      ];
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      // 2 rows * 2 cells each (colSpan swallows "b"'s cell, "c" is unaffected).
      const cells = /** @type {any[]} */ ([
        ...el.shadowRoot.querySelectorAll("md-data-grid-cell"),
      ]);
      expect(cells.length).to.equal(4);
      expect(cells.map((c) => c.column.field)).to.deep.equal([
        "a",
        "c",
        "a",
        "c",
      ]);
    });

    it("applies grid-column: span N to the spanning data cell, in every row", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [{ field: "a", colSpan: 2 }, { field: "b" }, { field: "c" }];
      el.rows = [{ a: 1, b: 2, c: 3 }];
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const cell = /** @type {any} */ (
        el.shadowRoot.querySelector("md-data-grid-cell")
      );
      await cell.updateComplete;
      expect(cell.column.field).to.equal("a");
      expect(cell.style.gridColumn).to.equal("1 / span 2");
    });
  });

  describe("empty state", () => {
    it("shows 'No rows' centered when there are no rows", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = [];
      await el.updateComplete;

      const emptyState = el.shadowRoot.querySelector('[part="empty-state"]');
      expect(emptyState).to.exist;
      expect(emptyState.textContent.trim()).to.equal("No rows");
      expect(el.shadowRoot.querySelector(".data-grid__row")).to.be.null;
    });

    it("hides the empty state once rows are added", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = [];
      await el.updateComplete;
      expect(el.shadowRoot.querySelector('[part="empty-state"]')).to.exist;

      el.rows = makeRows(3);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      expect(el.shadowRoot.querySelector('[part="empty-state"]')).to.be.null;
      expect(el.shadowRoot.querySelectorAll(".data-grid__row").length).to.equal(
        3,
      );
    });

    it("shows the empty state when pagination leaves the current page with zero rows", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = [];
      el.paginationModel = { page: 0, pageSize: 10 };
      await el.updateComplete;

      expect(el.shadowRoot.querySelector('[part="empty-state"]')).to.exist;
    });

    it("replaces the default text with slot=empty-label content", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`
          <md-data-grid>
            <span slot="empty-label">Nothing to see here</span>
          </md-data-grid>
        `)
      );
      el.columns = COLUMNS;
      el.rows = [];
      await el.updateComplete;

      // .textContent on a shadow-DOM ancestor of a <slot> only ever reflects
      // the slot's own fallback children (its literal DOM children) — the
      // light-DOM assigned nodes live elsewhere in the tree and are only
      // visually flattened through the slot. assignedElements() is the
      // correct way to check what's actually slotted.
      const slot = /** @type {HTMLSlotElement} */ (
        el.shadowRoot.querySelector('slot[name="empty-label"]')
      );
      const assigned = slot.assignedElements();
      expect(assigned).to.have.lengthOf(1);
      expect(assigned[0].textContent.trim()).to.equal("Nothing to see here");
    });

    it("falls back to the default 'No rows' text when nothing is slotted", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = [];
      await el.updateComplete;

      const slot = /** @type {HTMLSlotElement} */ (
        el.shadowRoot.querySelector('slot[name="empty-label"]')
      );
      expect(slot.assignedElements()).to.have.lengthOf(0);
      expect(slot.textContent.trim()).to.equal("No rows");
    });
  });

  describe("footer slot", () => {
    it("falls back to the internal md-data-grid-footer when nothing is slotted and pagination is active", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      el.paginationModel = { page: 0, pageSize: 10 };
      await el.updateComplete;

      const slot = /** @type {HTMLSlotElement} */ (
        el.shadowRoot.querySelector('slot[name="footer"]')
      );
      expect(slot.assignedElements()).to.have.lengthOf(0);
      expect(slot.querySelector("md-data-grid-footer")).to.exist;
    });

    it("renders nothing in the fallback when there's no paginationModel", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      const slot = /** @type {HTMLSlotElement} */ (
        el.shadowRoot.querySelector('slot[name="footer"]')
      );
      expect(slot.querySelector("md-data-grid-footer")).to.be.null;
    });

    it("replaces the internal md-data-grid-footer with slot=footer content, even with pagination active", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`
          <md-data-grid>
            <div slot="footer">Custom footer</div>
          </md-data-grid>
        `)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      el.paginationModel = { page: 0, pageSize: 10 };
      await el.updateComplete;

      const slot = /** @type {HTMLSlotElement} */ (
        el.shadowRoot.querySelector('slot[name="footer"]')
      );
      const assigned = slot.assignedElements();
      expect(assigned).to.have.lengthOf(1);
      expect(assigned[0].textContent.trim()).to.equal("Custom footer");
      // Deliberately not also asserting md-data-grid-footer is absent from
      // el.shadowRoot here — with paginationModel set, native <slot>
      // fallback-content semantics mean it's still constructed as an inert
      // child of the slot (just visually superseded by the real assigned
      // content above), so that query would find a real, non-null element.
      // Previously asserted `.to.be.null` here, which — being a real,
      // circularly-referenced Lit element rather than an actual null —
      // made the *failing* assertion hang trying to serialize it for the
      // error message instead of failing loudly. The `assigned` checks
      // above already fully cover "slotted content wins".
    });

    it("keeps slot=footer content even with hidePagination set", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`
          <md-data-grid hide-pagination>
            <div slot="footer">Custom footer</div>
          </md-data-grid>
        `)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      el.paginationModel = { page: 0, pageSize: 10 };
      await el.updateComplete;

      const slot = /** @type {HTMLSlotElement} */ (
        el.shadowRoot.querySelector('slot[name="footer"]')
      );
      expect(slot.assignedElements()).to.have.lengthOf(1);
    });
  });

  describe("CSS parts", () => {
    it("puts part on the spacer and rows containers", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      expect(el.shadowRoot.querySelector('[part="spacer"]')).to.exist;
      expect(el.shadowRoot.querySelector('[part="rows"]')).to.exist;
    });

    it("forwards nested sub-component parts via exportparts", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(1);
      el.paginationModel = { page: 0, pageSize: 10 };
      await el.updateComplete;

      // md-data-grid-cell also has no wrapper div — part="cell" lives directly
      // on its own tag, so it needs no exportparts entry either.
      const cell = el.shadowRoot.querySelector("md-data-grid-cell");
      expect(cell.getAttribute("part")).to.equal("cell");
      expect(cell.getAttribute("exportparts")).to.be.null;
      // md-data-grid-header-cell has no wrapper div — part="header-cell" lives
      // on its own tag (a light-DOM child of md-data-grid's shadow root),
      // so it's already reachable directly and needs no exportparts entry.
      // "separator" still lives one shadow root deeper (on
      // md-data-grid-column-separator's own tag) and does need forwarding.
      const header = el.shadowRoot.querySelector("md-data-grid-header-cell");
      expect(header.getAttribute("part")).to.equal("header-cell");
      expect(header.getAttribute("exportparts")).to.equal(
        "separator, title, sort-icon",
      );
      // md-data-grid-footer also has no wrapper div — part="footer" lives
      // directly on its own tag. The other footer parts (count,
      // prev/next buttons, page-size select) are genuine children inside
      // its shadow root and still need forwarding.
      const footer = el.shadowRoot.querySelector("md-data-grid-footer");
      expect(footer.getAttribute("part")).to.equal("footer");
      const footerExportparts = footer.getAttribute("exportparts");
      expect(footerExportparts).to.not.contain("footer,");
      expect(footerExportparts).to.contain("footer-prev");
    });
  });

  describe("column resize", () => {
    /**
     * md-data-grid-column-separator is itself the interactive hit-area (no
     * wrapper div — pointer listeners and part live directly on the host).
     * @param {any} header
     */
    const getHandle = async (header) => {
      await header.updateComplete;
      const separator = header.shadowRoot.querySelector(
        "md-data-grid-column-separator",
      );
      await separator.updateComplete;
      return separator;
    };

    /** @param {any} handle @param {number} clientX */
    const pointerDown = (handle, clientX) =>
      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 1,
          clientX,
          bubbles: true,
        }),
      );
    /** @param {any} handle @param {number} clientX */
    const pointerMove = (handle, clientX) =>
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          clientX,
          bubbles: true,
        }),
      );
    /** @param {any} handle @param {number} clientX */
    const pointerUp = (handle, clientX) =>
      handle.dispatchEvent(
        new PointerEvent("pointerup", { pointerId: 1, clientX, bubbles: true }),
      );

    it("drags a column wider, trading width with its right neighbor (total width unchanged)", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="display:block; width: 400px;"
          ></md-data-grid>`,
        )
      );
      el.columns = [
        { field: "a", headerName: "A", width: 100 },
        { field: "b", headerName: "B", width: 100 },
      ];
      el.rows = makeRows(1);
      await el.updateComplete;

      const header = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[0]
      );
      const handle = await getHandle(header);
      expect(handle).to.exist;

      pointerDown(handle, 100);
      pointerMove(handle, 140);
      pointerUp(handle, 140);
      await el.updateComplete;

      expect(el.columns[0].width).to.equal(140);
      expect(el.columns[1].width).to.equal(60);
    });

    it("paints the drag directly onto the DOM without mutating columns until the drag ends", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="display:block; width: 400px;"
          ></md-data-grid>`,
        )
      );
      const originalColumns = [
        { field: "a", headerName: "A", width: 100 },
        { field: "b", headerName: "B", width: 100 },
      ];
      el.columns = originalColumns;
      el.rows = makeRows(1);
      await el.updateComplete;

      const header = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[0]
      );
      const handle = await getHandle(header);

      pointerDown(handle, 100);
      pointerMove(handle, 140);

      // Mid-drag: the DOM already reflects the new (traded) widths...
      const headerRow = el.shadowRoot.querySelector(".data-grid__header");
      const bodyRow = el.shadowRoot.querySelector(".data-grid__row");
      expect(headerRow.style.gridTemplateColumns).to.equal("140px 60px");
      expect(bodyRow.style.gridTemplateColumns).to.equal("140px 60px");
      // ...but columns itself is untouched — no reactive re-render has run.
      expect(el.columns).to.equal(originalColumns);
      expect(el.columns[0].width).to.equal(100);

      pointerUp(handle, 140);
      await el.updateComplete;

      // On release, the real (reactive) commit happens.
      expect(el.columns).to.not.equal(originalColumns);
      expect(el.columns[0].width).to.equal(140);
    });

    it("sets a col-resize cursor on the document body for the duration of the drag", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="display:block; width: 400px;"
          ></md-data-grid>`,
        )
      );
      el.columns = [
        { field: "a", headerName: "A", width: 100 },
        { field: "b", headerName: "B", width: 100 },
      ];
      el.rows = makeRows(1);
      await el.updateComplete;

      const header = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[0]
      );
      const handle = await getHandle(header);

      expect(document.body.style.cursor).to.not.equal("col-resize");
      pointerDown(handle, 100);
      expect(document.body.style.cursor).to.equal("col-resize");
      pointerMove(handle, 140);
      expect(document.body.style.cursor).to.equal("col-resize");
      pointerUp(handle, 140);
      expect(document.body.style.cursor).to.not.equal("col-resize");
    });

    it("clamps to minWidth/maxWidth, and to a 40px floor when neither is set", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="display:block; width: 400px;"
          ></md-data-grid>`,
        )
      );
      el.columns = [
        {
          field: "a",
          headerName: "A",
          width: 100,
          minWidth: 80,
          maxWidth: 150,
        },
        { field: "b", headerName: "B", width: 100 },
      ];
      el.rows = makeRows(1);
      await el.updateComplete;

      const header = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[0]
      );
      const handle = await getHandle(header);

      pointerDown(handle, 100);
      pointerMove(handle, 500);
      pointerUp(handle, 500);
      await el.updateComplete;
      expect(el.columns[0].width).to.equal(150);

      el.columns = [
        {
          field: "a",
          headerName: "A",
          width: 100,
          minWidth: 80,
          maxWidth: 150,
        },
        { field: "b", headerName: "B", width: 100 },
      ];
      await el.updateComplete;
      const header2 = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[0]
      );
      const handle2 = await getHandle(header2);
      pointerDown(handle2, 100);
      pointerMove(handle2, -500);
      pointerUp(handle2, -500);
      await el.updateComplete;
      expect(el.columns[0].width).to.equal(80);
    });

    it("floors at 40px when neither minWidth nor maxWidth is set", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="display:block; width: 400px;"
          ></md-data-grid>`,
        )
      );
      el.columns = [
        { field: "a", headerName: "A", width: 100 },
        { field: "b", headerName: "B", width: 100 },
      ];
      el.rows = makeRows(1);
      await el.updateComplete;

      const header = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[0]
      );
      const handle = await getHandle(header);

      pointerDown(handle, 100);
      pointerMove(handle, -500);
      pointerUp(handle, -500);
      await el.updateComplete;
      expect(el.columns[0].width).to.equal(40);
    });

    it("dispatches md-data-grid-column-resize with start/resize/end phases", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="display:block; width: 400px;"
          ></md-data-grid>`,
        )
      );
      el.columns = [
        { field: "a", headerName: "A", width: 100 },
        { field: "b", headerName: "B", width: 100 },
      ];
      el.rows = makeRows(1);
      await el.updateComplete;

      const header = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[0]
      );
      const handle = await getHandle(header);

      const phases = [];
      el.addEventListener("md-data-grid-column-resize", (e) =>
        phases.push({ ...e.detail }),
      );

      pointerDown(handle, 100);
      pointerMove(handle, 130);
      pointerUp(handle, 130);
      await el.updateComplete;

      expect(phases.map((p) => p.phase)).to.deep.equal([
        "start",
        "resize",
        "end",
      ]);
      expect(phases[0].field).to.equal("a");
      expect(phases[0].colIndex).to.equal(0);
      expect(phases[2].width).to.equal(130);
    });

    it("resizable: false on a column renders a non-interactive separator (no handle)", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [
        { field: "a", headerName: "A", width: 100, resizable: false },
        { field: "b", headerName: "B", width: 100 },
      ];
      el.rows = makeRows(1);
      await el.updateComplete;

      const header = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[0]
      );
      await header.updateComplete;
      const separator = header.shadowRoot.querySelector(
        "md-data-grid-column-separator",
      );
      // The divider itself still renders (every column boundary keeps its
      // line) — only the drag interaction is disabled.
      expect(separator).to.exist;
      expect(separator.resizable).to.be.false;
      const handle = await getHandle(header);
      expect(handle.hasAttribute("resizable")).to.be.false;
    });

    it("disable-column-resize on the grid disables every separator's interactivity", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid disable-column-resize></md-data-grid>`)
      );
      el.columns = [
        { field: "a", headerName: "A", width: 100 },
        { field: "b", headerName: "B", width: 100 },
      ];
      el.rows = makeRows(1);
      await el.updateComplete;

      const headers = /** @type {any[]} */ ([
        ...el.shadowRoot.querySelectorAll("md-data-grid-header-cell"),
      ]);
      for (const header of headers) {
        const handle = await getHandle(header);
        expect(handle.hasAttribute("resizable")).to.be.false;
      }
    });

    it("the last column's separator is non-interactive (no partner to trade with)", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [
        { field: "a", headerName: "A", width: 100 },
        { field: "b", headerName: "B", width: 100 },
      ];
      el.rows = makeRows(1);
      await el.updateComplete;

      const headers = /** @type {any[]} */ ([
        ...el.shadowRoot.querySelectorAll("md-data-grid-header-cell"),
      ]);
      const handle = await getHandle(headers[1]);
      expect(handle).to.exist;
      expect(handle.hasAttribute("resizable")).to.be.false;
    });

    it("a colSpan header's handle resizes the last covered column, not its own field", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="display:block; width: 400px;"
          ></md-data-grid>`,
        )
      );
      el.columns = [
        { field: "a", headerName: "A", width: 100, colSpan: 2 },
        { field: "b", headerName: "B", width: 100 },
        { field: "c", headerName: "C", width: 100 },
      ];
      el.rows = makeRows(1);
      await el.updateComplete;

      // colSpan collapses columns[1]'s own header cell, so the spanning
      // header (columns[0]) is the first rendered md-data-grid-header-cell.
      const spanningHeader = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[0]
      );
      await spanningHeader.updateComplete;
      expect(spanningHeader.resizeColIndex).to.equal(1);

      const handle = await getHandle(spanningHeader);
      pointerDown(handle, 100);
      pointerMove(handle, 150);
      pointerUp(handle, 150);
      await el.updateComplete;

      expect(el.columns[0].width).to.equal(100);
      expect(el.columns[1].width).to.equal(150);
      expect(el.columns[2].width).to.equal(50);
    });

    it("caps the trade at whichever column's own min/max is hit first, keeping the pair's combined width constant", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="display:block; width: 400px;"
          ></md-data-grid>`,
        )
      );
      el.columns = [
        { field: "a", headerName: "A", width: 100 },
        { field: "b", headerName: "B", width: 100, minWidth: 70 },
      ];
      el.rows = makeRows(1);
      await el.updateComplete;

      const header = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[0]
      );
      const handle = await getHandle(header);

      // Drag far to the right — B's own minWidth (70) should cap the trade
      // before A's (unset, 40px-floor) bound ever comes into play.
      pointerDown(handle, 100);
      pointerMove(handle, 200);
      pointerUp(handle, 200);
      await el.updateComplete;

      expect(el.columns[0].width).to.equal(130);
      expect(el.columns[1].width).to.equal(70);
      expect(el.columns[0].width + el.columns[1].width).to.equal(200);
    });

    // Regression: _commitWidth()'s host._columns -> host.columns index
    // translation once only subtracted the checkbox column's offset —
    // correct on its own, but silently wrong (writing the drag onto the
    // wrong public column) as soon as treeData's grouping column or
    // master-detail's toggle column were *also* prepended, since neither
    // was counted. These lock in the offset for every prepended-column
    // combination, not just the one that happened to be tested before.
    describe("offset correctness with prepended synthetic columns", () => {
      it("still resizes the correct column with just checkboxSelection prepended (offset 1)", async () => {
        const el = /** @type {MdDataGrid} */ (
          await fixture(
            html`<md-data-grid
              checkbox-selection
              style="display:block; width: 400px;"
            ></md-data-grid>`,
          )
        );
        el.columns = [
          { field: "a", headerName: "A", width: 100 },
          { field: "b", headerName: "B", width: 100 },
        ];
        el.rows = makeRows(1);
        await el.updateComplete;

        // Header cells: [0] checkbox, [1] "A", [2] "B".
        const header = /** @type {any} */ (
          el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[1]
        );
        const handle = await getHandle(header);
        pointerDown(handle, 100);
        pointerMove(handle, 140);
        pointerUp(handle, 140);
        await el.updateComplete;

        expect(el.columns[0].width).to.equal(140);
        expect(el.columns[1].width).to.equal(60);
      });

      it("resizes the correct column when getDetailPanelContent prepends a toggle column (offset 1)", async () => {
        const el = /** @type {MdDataGrid} */ (
          await fixture(
            html`<md-data-grid
              style="display:block; width: 400px;"
            ></md-data-grid>`,
          )
        );
        el.getDetailPanelContent = () => html`detail`;
        el.columns = [
          { field: "a", headerName: "A", width: 100 },
          { field: "b", headerName: "B", width: 100 },
        ];
        el.rows = makeRows(1);
        await el.updateComplete;

        // Header cells: [0] detail-toggle, [1] "A", [2] "B".
        const header = /** @type {any} */ (
          el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[1]
        );
        const handle = await getHandle(header);
        pointerDown(handle, 100);
        pointerMove(handle, 140);
        pointerUp(handle, 140);
        await el.updateComplete;

        expect(el.columns[0].width).to.equal(140);
        expect(el.columns[1].width).to.equal(60);
      });
    });

    describe("resizingColumnField (dataGridContext)", () => {
      it("is undefined before any resize starts", async () => {
        const el = /** @type {MdDataGrid} */ (
          await fixture(
            html`<md-data-grid
              style="display:block; width: 400px;"
            ></md-data-grid>`,
          )
        );
        el.columns = [
          { field: "a", headerName: "A", width: 100 },
          { field: "b", headerName: "B", width: 100 },
        ];
        el.rows = makeRows(1);
        await el.updateComplete;

        expect(buildDataGridContext(el).resizingColumnField).to.equal(
          undefined,
        );
      });

      it("reflects the dragged column's field for the duration of the drag, then clears on release", async () => {
        const el = /** @type {MdDataGrid} */ (
          await fixture(
            html`<md-data-grid
              style="display:block; width: 400px;"
            ></md-data-grid>`,
          )
        );
        el.columns = [
          { field: "a", headerName: "A", width: 100 },
          { field: "b", headerName: "B", width: 100 },
        ];
        el.rows = makeRows(1);
        await el.updateComplete;

        const header = /** @type {any} */ (
          el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[0]
        );
        const handle = await getHandle(header);

        pointerDown(handle, 100);
        expect(buildDataGridContext(el).resizingColumnField).to.equal("a");

        pointerMove(handle, 140);
        expect(buildDataGridContext(el).resizingColumnField).to.equal("a");

        pointerUp(handle, 140);
        await el.updateComplete;
        expect(buildDataGridContext(el).resizingColumnField).to.equal(
          undefined,
        );
      });
    });
  });

  describe("column sorting", () => {
    const RATING_COLUMNS = [
      { field: "id", headerName: "ID", width: 60 },
      { field: "rating", headerName: "Rating" },
    ];

    /** @param {any[]} rows */
    const ratingRows = (rows) => rows.map((rating, id) => ({ id, rating }));

    it("clicking a sortable header's title cycles none -> asc -> desc -> none", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = RATING_COLUMNS;
      el.rows = ratingRows([3, 1, 2]);
      await el.updateComplete;

      const header = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[1]
      );
      await header.updateComplete;

      header.dispatchEvent(new Event("click", { bubbles: true }));
      await el.updateComplete;
      expect(el.sortModel).to.deep.equal([{ field: "rating", sort: "asc" }]);

      header.dispatchEvent(new Event("click", { bubbles: true }));
      await el.updateComplete;
      expect(el.sortModel).to.deep.equal([{ field: "rating", sort: "desc" }]);

      header.dispatchEvent(new Event("click", { bubbles: true }));
      await el.updateComplete;
      expect(el.sortModel).to.deep.equal([]);
    });

    it("sorts rows ascending/descending by the active sortModel entry", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = RATING_COLUMNS;
      el.rows = ratingRows([3, 1, 2]);
      await el.updateComplete;

      el.sortModel = [{ field: "rating", sort: "asc" }];
      await el.updateComplete;
      expect(el._effectiveRows.map((r) => r.rating)).to.deep.equal([1, 2, 3]);

      el.sortModel = [{ field: "rating", sort: "desc" }];
      await el.updateComplete;
      expect(el._effectiveRows.map((r) => r.rating)).to.deep.equal([3, 2, 1]);
    });

    it("is initializable with a pre-set sortModel", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.sortModel = [{ field: "rating", sort: "desc" }];
      el.columns = RATING_COLUMNS;
      el.rows = ratingRows([3, 1, 2]);
      await el.updateComplete;

      expect(el._effectiveRows.map((r) => r.rating)).to.deep.equal([3, 2, 1]);
    });

    it("ignores a sortModel entry whose sort is null/undefined", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = RATING_COLUMNS;
      el.rows = ratingRows([3, 1, 2]);
      el.sortModel = [{ field: "rating", sort: null }];
      await el.updateComplete;

      expect(el._effectiveRows.map((r) => r.rating)).to.deep.equal([3, 1, 2]);
    });

    it("dispatches md-data-grid-sort-model-change with the new sortModel", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = RATING_COLUMNS;
      el.rows = ratingRows([3, 1, 2]);
      await el.updateComplete;

      const events = [];
      el.addEventListener("md-data-grid-sort-model-change", (e) =>
        events.push(e.detail),
      );

      const header = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[1]
      );
      await header.updateComplete;
      header.dispatchEvent(new Event("click", { bubbles: true }));
      await el.updateComplete;

      expect(events).to.deep.equal([[{ field: "rating", sort: "asc" }]]);
    });

    it("column.sortable: false skips the click-to-sort affordance", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [
        { field: "id", headerName: "ID", width: 60 },
        { field: "rating", headerName: "Rating", sortable: false },
      ];
      el.rows = ratingRows([3, 1, 2]);
      await el.updateComplete;

      const header = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[1]
      );
      await header.updateComplete;
      expect(header.hasAttribute("sortable")).to.be.false;

      header.dispatchEvent(new Event("click", { bubbles: true }));
      await el.updateComplete;
      expect(el.sortModel).to.deep.equal([]);
    });

    it("disable-column-sorting disables sorting on every column", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid disable-column-sorting></md-data-grid>`,
        )
      );
      el.columns = RATING_COLUMNS;
      el.rows = ratingRows([3, 1, 2]);
      await el.updateComplete;

      const header = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[1]
      );
      await header.updateComplete;
      expect(header.hasAttribute("sortable")).to.be.false;

      header.dispatchEvent(new Event("click", { bubbles: true }));
      await el.updateComplete;
      expect(el.sortModel).to.deep.equal([]);
    });

    it("renders the sort icon only on the active sort column, rotated for desc", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = RATING_COLUMNS;
      el.rows = ratingRows([3, 1, 2]);
      await el.updateComplete;

      const [idHeader, ratingHeader] = /** @type {any[]} */ ([
        ...el.shadowRoot.querySelectorAll("md-data-grid-header-cell"),
      ]);

      el.sortModel = [{ field: "rating", sort: "asc" }];
      await el.updateComplete;
      await idHeader.updateComplete;
      await ratingHeader.updateComplete;

      expect(idHeader.hasAttribute("sort")).to.be.false;
      expect(ratingHeader.getAttribute("sort")).to.equal("asc");
      expect(
        ratingHeader.shadowRoot.querySelector(
          ".data-grid-header-cell__sort-icon",
        ),
      ).to.exist;

      el.sortModel = [{ field: "rating", sort: "desc" }];
      await el.updateComplete;
      await ratingHeader.updateComplete;
      expect(ratingHeader.getAttribute("sort")).to.equal("desc");
    });

    it("renders the sort icon hidden (opacity 0) for a sortable-but-unsorted column, visible once active", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = RATING_COLUMNS;
      el.rows = ratingRows([3, 1, 2]);
      await el.updateComplete;

      const header = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[1]
      );
      await header.updateComplete;
      const icon = header.shadowRoot.querySelector(
        ".data-grid-header-cell__sort-icon",
      );
      // Present in the DOM (so :hover can reveal it via CSS alone, with no
      // extra render) but invisible by default — not the active sort field.
      expect(icon).to.exist;
      expect(header.hasAttribute("sort")).to.be.false;
      expect(getComputedStyle(icon).opacity).to.equal("0");

      el.sortModel = [{ field: "rating", sort: "asc" }];
      await el.updateComplete;
      await header.updateComplete;
      // The opacity change is CSS-transitioned (150ms) — outlast it before
      // reading the settled computed value.
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(getComputedStyle(icon).opacity).to.equal("1");
    });

    it("a resize drag on a sortable column doesn't also toggle its sort", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="display:block; width: 400px;"
          ></md-data-grid>`,
        )
      );
      el.columns = [
        { field: "rating", headerName: "Rating", width: 100 },
        { field: "id", headerName: "ID", width: 100 },
      ];
      el.rows = ratingRows([3, 1, 2]);
      await el.updateComplete;

      const header = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[0]
      );
      await header.updateComplete;
      const separator = header.shadowRoot.querySelector(
        "md-data-grid-column-separator",
      );
      await separator.updateComplete;

      separator.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 1,
          clientX: 100,
          bubbles: true,
        }),
      );
      separator.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          clientX: 130,
          bubbles: true,
        }),
      );
      separator.dispatchEvent(
        new PointerEvent("pointerup", {
          pointerId: 1,
          clientX: 130,
          bubbles: true,
        }),
      );
      // The browser fires "click" right after "pointerup" on the same
      // target — dispatch it too, the same way a real drag-release would,
      // to actually exercise the click-suppression this test is for.
      separator.dispatchEvent(
        new Event("click", { bubbles: true, cancelable: true }),
      );
      await el.updateComplete;

      expect(el.columns[0].width).to.equal(130);
      expect(el.sortModel).to.deep.equal([]);
    });
  });

  describe("row spanning", () => {
    const GROUP_COLUMNS = [
      { field: "group", headerName: "Group", width: 100 },
      { field: "name", headerName: "Name", width: 150 },
    ];

    /** @param {[string, string][]} pairs */
    const groupRows = (pairs) =>
      pairs.map(([group, name], id) => ({ id, group, name }));

    it("is off by default — every row renders a cell for every column", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = GROUP_COLUMNS;
      el.rows = groupRows([
        ["A", "Ada"],
        ["A", "Bea"],
      ]);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      expect(
        el.shadowRoot.querySelectorAll("md-data-grid-cell").length,
      ).to.equal(4);
    });

    it("merges consecutive rows with an equal value into one taller owner cell", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid row-spanning></md-data-grid>`)
      );
      el.columns = GROUP_COLUMNS;
      el.rows = groupRows([
        ["A", "Ada"],
        ["A", "Bea"],
        ["B", "Cid"],
      ]);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const cells = /** @type {any[]} */ ([
        ...el.shadowRoot.querySelectorAll("md-data-grid-cell"),
      ]);
      const groupCells = cells.filter((c) => c.column.field === "group");
      const nameCells = cells.filter((c) => c.column.field === "name");

      // "name" never repeats, so it's unaffected: still one cell per row.
      expect(nameCells.length).to.equal(3);
      // "group" merges rows 0-1 (both "A") into a single owner cell; row 2
      // ("B") starts a fresh run of its own.
      expect(groupCells.length).to.equal(2);
      expect(groupCells.map((c) => [c.rowIndex, c.rowSpan])).to.deep.equal([
        [0, 2],
        [2, 1],
      ]);

      await groupCells[0].updateComplete;
      expect(getComputedStyle(groupCells[0]).height).to.equal(
        `${el.rowHeight * 2}px`,
      );
    });

    it("a covered row's remaining cells still land in their real columns, not shifted left by the omitted one", async () => {
      // The covered row's "group" cell renders nothing (no DOM node at
      // all, not an empty placeholder) — without an explicit grid-column
      // on every cell, CSS Grid auto-placement packs whatever real cells
      // DO exist into the next available tracks in DOM order, shifting
      // "name" into "group"'s column instead of leaving it in its own.
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid row-spanning></md-data-grid>`)
      );
      el.columns = GROUP_COLUMNS;
      el.rows = groupRows([
        ["A", "Ada"],
        ["A", "Bea"],
      ]);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const cells = /** @type {any[]} */ ([
        ...el.shadowRoot.querySelectorAll("md-data-grid-cell"),
      ]);
      const coveredRowNameCell = cells.find(
        (c) => c.column.field === "name" && c.rowIndex === 1,
      );
      await coveredRowNameCell.updateComplete;

      // "name" is column index 1 -> CSS grid line 2.
      expect(coveredRowNameCell.style.gridColumn).to.equal("2 / span 1");
    });

    it("the owner cell visually paints over the covered row's slot for that column", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            row-spanning
            style="display:block; width: 300px; height: 300px;"
          ></md-data-grid>`,
        )
      );
      el.columns = GROUP_COLUMNS;
      el.rows = groupRows([
        ["A", "Ada"],
        ["A", "Bea"],
      ]);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const owner = /** @type {any} */ (
        el.shadowRoot.querySelector("md-data-grid-cell")
      );
      await owner.updateComplete;
      const rect = owner.getBoundingClientRect();
      // A point inside row 1's vertical slice (which renders no "group"
      // cell of its own) should resolve to the owner overflowing over it,
      // not a gap or something from row 1.
      const covered = el.shadowRoot.elementFromPoint(
        rect.left + 10,
        rect.top + rect.height - 5,
      );
      expect(covered).to.equal(owner);
    });

    it("column.rowSpannable: false opts a column out even when row-spanning is on", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid row-spanning></md-data-grid>`)
      );
      el.columns = [
        { field: "group", headerName: "Group", rowSpannable: false },
        { field: "name", headerName: "Name" },
      ];
      el.rows = groupRows([
        ["A", "Ada"],
        ["A", "Bea"],
      ]);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      expect(
        el.shadowRoot.querySelectorAll("md-data-grid-cell").length,
      ).to.equal(4);
    });

    it("a colSpan column is never row-spannable, even with equal adjacent values", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid row-spanning></md-data-grid>`)
      );
      el.columns = [
        { field: "group", headerName: "Group", colSpan: 2 },
        { field: "name", headerName: "Name" },
        { field: "extra", headerName: "Extra" },
      ];
      el.rows = [
        { id: 1, group: "A", name: "x", extra: "e1" },
        { id: 2, group: "A", name: "y", extra: "e2" },
      ];
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      // colSpan already collapses "name"'s own cell in every row; if "group"
      // were also row-spanning it would collapse further to 2 total.
      const cells = el.shadowRoot.querySelectorAll("md-data-grid-cell");
      expect(cells.length).to.equal(4); // 2 rows * (1 spanning "group" + 1 "extra")
    });

    it("uses rowSpanValueGetter for the equality key when provided", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid row-spanning></md-data-grid>`)
      );
      el.columns = [
        {
          field: "score",
          headerName: "Score",
          // Groups by rounded value rather than the exact number.
          rowSpanValueGetter: ({ value }) =>
            Math.round(/** @type {number} */ (value)),
        },
        { field: "name", headerName: "Name" },
      ];
      el.rows = [
        { id: 1, score: 1.1, name: "a" },
        { id: 2, score: 1.4, name: "b" },
        { id: 3, score: 2.0, name: "c" },
      ];
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const scoreCells = /** @type {any[]} */ ([
        ...el.shadowRoot.querySelectorAll("md-data-grid-cell"),
      ]).filter((c) => c.column.field === "score");
      expect(scoreCells.map((c) => [c.rowIndex, c.rowSpan])).to.deep.equal([
        [0, 2],
        [2, 1],
      ]);
    });

    it("re-detects runs against the current sort order", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid row-spanning></md-data-grid>`)
      );
      el.columns = GROUP_COLUMNS;
      // Not adjacent in insertion order — sorting by "group" makes them so.
      el.rows = groupRows([
        ["A", "Ada"],
        ["B", "Cid"],
        ["A", "Bea"],
      ]);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      expect(
        el.shadowRoot.querySelectorAll("md-data-grid-cell").length,
      ).to.equal(6); // no merging yet — no two A's are adjacent

      el.sortModel = [{ field: "group", sort: "asc" }];
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const groupCells = /** @type {any[]} */ ([
        ...el.shadowRoot.querySelectorAll("md-data-grid-cell"),
      ]).filter((c) => c.column.field === "group");
      // Sorted: A, A, B — the two A's are now adjacent and merge.
      expect(groupCells.map((c) => c.rowSpan)).to.deep.equal([2, 1]);
    });

    it("a run never crosses a page boundary in client pagination", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid row-spanning></md-data-grid>`)
      );
      el.columns = GROUP_COLUMNS;
      el.rows = groupRows([
        ["A", "Ada"], // page 0
        ["A", "Bea"], // page 0
        ["A", "Cid"], // page 1 — same value, but a new page
      ]);
      el.paginationModel = { page: 1, pageSize: 2 };
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      // Page 1 has exactly one row — nothing for it to merge with.
      const groupCells = /** @type {any[]} */ ([
        ...el.shadowRoot.querySelectorAll("md-data-grid-cell"),
      ]).filter((c) => c.column.field === "group");
      expect(groupCells.length).to.equal(1);
      expect(groupCells[0].rowSpan).to.equal(1);
    });
  });

  describe("loading", () => {
    it("is off by default — no progress indicator rendered", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      expect(el.shadowRoot.querySelector("md-progress-linear")).to.not.exist;
    });

    it("the loading attribute renders an indeterminate md-progress-linear, absolutely positioned full-width at the top of the viewport", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid loading></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      const indicator = /** @type {any} */ (
        el.shadowRoot.querySelector("md-progress-linear")
      );
      expect(indicator).to.exist;
      expect(indicator.getAttribute("part")).to.equal("loading-indicator");
      // No `value` set — renders as indeterminate.
      expect(indicator.value).to.be.undefined;

      // A child of the viewport (its containing block via position:
      // relative), absolutely positioned pinned to its own top edge —
      // doesn't occupy normal-flow space, so it never affects the
      // viewport's own height/scroll math, and stays full-width/at the
      // top regardless of scroll position.
      const viewport = el.shadowRoot.querySelector(".data-grid__viewport");
      expect(viewport.contains(indicator)).to.be.true;
      const style = getComputedStyle(indicator);
      expect(style.position).to.equal("absolute");
      expect(style.top).to.equal("0px");
      expect(style.left).to.equal("0px");
      expect(style.right).to.equal("0px");
    });

    it("renders a translucent overlay covering the viewport while loading", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid loading></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      const overlay = el.shadowRoot.querySelector('[part="loading-overlay"]');
      expect(overlay).to.exist;
      const viewport = el.shadowRoot.querySelector(".data-grid__viewport");
      expect(viewport.contains(overlay)).to.be.true;
      expect(getComputedStyle(overlay).position).to.equal("absolute");
    });

    it("can be toggled imperatively via a property (e.g. a ref), same as any other property", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;
      expect(el.shadowRoot.querySelector("md-progress-linear")).to.not.exist;

      el.loading = true;
      await el.updateComplete;
      expect(el.shadowRoot.querySelector("md-progress-linear")).to.exist;
      expect(el.hasAttribute("loading")).to.be.true;

      el.loading = false;
      await el.updateComplete;
      expect(el.shadowRoot.querySelector("md-progress-linear")).to.not.exist;
      expect(el.hasAttribute("loading")).to.be.false;
    });

    it("shows skeleton rows instead of the progress bar/overlay when rows is empty", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid loading></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = [];
      await el.updateComplete;

      // Skeleton mode, not the progress-bar/overlay mode.
      expect(el.shadowRoot.querySelector("md-progress-linear")).to.not.exist;
      expect(el.shadowRoot.querySelector('[part="loading-overlay"]')).to.not
        .exist;
      expect(el.shadowRoot.querySelector('[part="skeleton-rows"]')).to.exist;
      // The default "No rows" empty state is suppressed while skeletons show.
      expect(el.shadowRoot.querySelector('[part="empty-state"]')).to.not.exist;

      const skeletonRows = el.shadowRoot.querySelectorAll(
        '[part="skeleton-rows"] > .data-grid__row',
      );
      expect(skeletonRows.length).to.equal(8);
      // One md-skeleton per column, in every skeleton row.
      const firstRowSkeletons = skeletonRows[0].querySelectorAll("md-skeleton");
      expect(firstRowSkeletons.length).to.equal(COLUMNS.length);
    });

    it("switches from skeleton rows to the progress bar/overlay once rows arrive while still loading", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid loading></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = [];
      await el.updateComplete;
      expect(el.shadowRoot.querySelector('[part="skeleton-rows"]')).to.exist;

      el.rows = makeRows(3);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      expect(el.shadowRoot.querySelector('[part="skeleton-rows"]')).to.not
        .exist;
      expect(el.shadowRoot.querySelector("md-progress-linear")).to.exist;
      expect(el.shadowRoot.querySelector('[part="loading-overlay"]')).to.exist;
    });

    it("shows the default empty state (not skeletons) when rows is empty and loading is off", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = [];
      await el.updateComplete;

      expect(el.shadowRoot.querySelector('[part="skeleton-rows"]')).to.not
        .exist;
      expect(el.shadowRoot.querySelector('[part="empty-state"]')).to.exist;
    });
  });

  describe("row selection", () => {
    /** @param {MdDataGrid} el */
    function rowEls(el) {
      return /** @type {HTMLElement[]} */ ([
        ...el.shadowRoot.querySelectorAll(".data-grid__row"),
      ]);
    }

    /**
     * @param {HTMLElement} rowEl
     * @param {{ ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean }} [modifiers]
     */
    function click(rowEl, modifiers = {}) {
      rowEl.dispatchEvent(
        new MouseEvent("click", { bubbles: true, ...modifiers }),
      );
    }

    it("plain click selects just that row, highlighting it", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      click(rowEls(el)[0]);
      await el.updateComplete;

      expect([...el.rowSelectionModel]).to.deep.equal([0]);
      expect(rowEls(el)[0].classList.contains("data-grid__row_selected")).to.be
        .true;
      expect(rowEls(el)[0].getAttribute("aria-selected")).to.equal("true");
      expect(rowEls(el)[1].getAttribute("aria-selected")).to.equal("false");
    });

    it("plain click on a different row replaces the selection", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      click(rowEls(el)[0]);
      await el.updateComplete;
      click(rowEls(el)[1]);
      await el.updateComplete;

      expect([...el.rowSelectionModel]).to.deep.equal([1]);
      expect(rowEls(el)[0].classList.contains("data-grid__row_selected")).to.be
        .false;
      expect(rowEls(el)[1].classList.contains("data-grid__row_selected")).to.be
        .true;
    });

    it("Ctrl/Cmd-click toggles a row into the selection additively", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      click(rowEls(el)[0]);
      await el.updateComplete;
      click(rowEls(el)[2], { ctrlKey: true });
      await el.updateComplete;

      expect([...el.rowSelectionModel].sort()).to.deep.equal([0, 2]);
    });

    it("Ctrl/Cmd-click on an already-selected row toggles it off", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      click(rowEls(el)[0]);
      await el.updateComplete;
      click(rowEls(el)[1], { metaKey: true });
      await el.updateComplete;
      click(rowEls(el)[1], { metaKey: true });
      await el.updateComplete;

      expect([...el.rowSelectionModel]).to.deep.equal([0]);
    });

    it("Shift-click selects the contiguous range from the last click", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(5);
      await el.updateComplete;

      click(rowEls(el)[1]);
      await el.updateComplete;
      click(rowEls(el)[3], { shiftKey: true });
      await el.updateComplete;

      expect([...el.rowSelectionModel].sort()).to.deep.equal([1, 2, 3]);
    });

    it("shift-mousedown is prevented, so it doesn't drag a text selection across cells", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(5);
      await el.updateComplete;

      const plainMousedown = rowEls(el)[0].dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      const shiftMousedown = rowEls(el)[1].dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          shiftKey: true,
        }),
      );

      // dispatchEvent() returns false when the event was cancelled.
      expect(plainMousedown).to.be.true;
      expect(shiftMousedown).to.be.false;
    });

    it("Shift-click works backwards from the anchor too", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(5);
      await el.updateComplete;

      click(rowEls(el)[3]);
      await el.updateComplete;
      click(rowEls(el)[1], { shiftKey: true });
      await el.updateComplete;

      expect([...el.rowSelectionModel].sort()).to.deep.equal([1, 2, 3]);
    });

    it("Shift-click with no prior click behaves like a plain click", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      click(rowEls(el)[1], { shiftKey: true });
      await el.updateComplete;

      expect([...el.rowSelectionModel]).to.deep.equal([1]);
    });

    it("Shift-click merges its range into the existing selection instead of replacing it", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(10);
      await el.updateComplete;

      // An unrelated row, selected additively — nothing to do with the
      // upcoming shift gesture.
      click(rowEls(el)[8], { ctrlKey: true });
      await el.updateComplete;

      click(rowEls(el)[1], { ctrlKey: true });
      await el.updateComplete;
      click(rowEls(el)[3], { shiftKey: true });
      await el.updateComplete;

      // Row 8 survives — a replace-based implementation would have wiped
      // it out when the shift range was applied.
      expect([...el.rowSelectionModel].sort()).to.deep.equal([1, 2, 3, 8]);
    });

    it("shrinking: shift-clicking an already-selected row doesn't deselect that row, only backs the range off beyond it", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(10);
      await el.updateComplete;

      click(rowEls(el)[1]);
      await el.updateComplete;
      click(rowEls(el)[5], { shiftKey: true });
      await el.updateComplete;
      expect([...el.rowSelectionModel].sort()).to.deep.equal([1, 2, 3, 4, 5]);

      // Row 3 is already selected — shrinks back to [1..3], row 3 itself
      // stays selected rather than toggling off.
      click(rowEls(el)[3], { shiftKey: true });
      await el.updateComplete;

      expect([...el.rowSelectionModel].sort()).to.deep.equal([1, 2, 3]);
    });

    it("shift-clicking the current anchor row while it's still selected is a no-op", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(5);
      await el.updateComplete;

      click(rowEls(el)[2]);
      await el.updateComplete;

      let dispatched = false;
      el.addEventListener("md-data-grid-row-selection-model-change", () => {
        dispatched = true;
      });
      click(rowEls(el)[2], { shiftKey: true });
      await el.updateComplete;

      expect([...el.rowSelectionModel]).to.deep.equal([2]);
      expect(dispatched).to.be.false;
    });

    it("the anchor advances after a shift-click, so a following shift-click is relative to it, not the original click", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(10);
      await el.updateComplete;

      click(rowEls(el)[5]);
      await el.updateComplete;
      click(rowEls(el)[1], { shiftKey: true });
      await el.updateComplete;
      expect([...el.rowSelectionModel].sort()).to.deep.equal([1, 2, 3, 4, 5]);

      // Anchor is now 1 (the last shift-clicked row), not the original 5 —
      // shrinking from row 3 (already selected) backs off toward THIS
      // anchor, landing on [3, 4, 5]. A fixed anchor stuck at 5 would
      // instead have produced [1, 2, 3].
      click(rowEls(el)[3], { shiftKey: true });
      await el.updateComplete;

      expect([...el.rowSelectionModel].sort()).to.deep.equal([3, 4, 5]);
    });

    it("disableMultipleRowSelection makes Ctrl/Shift-click behave like a plain click", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid disable-multiple-row-selection></md-data-grid>`,
        )
      );
      el.columns = COLUMNS;
      el.rows = makeRows(5);
      await el.updateComplete;

      click(rowEls(el)[1]);
      await el.updateComplete;
      click(rowEls(el)[3], { ctrlKey: true });
      await el.updateComplete;

      expect([...el.rowSelectionModel]).to.deep.equal([3]);
    });

    it("disableRowSelectionOnClick prevents selection but still dispatches row-click", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid disable-row-selection-on-click></md-data-grid>`,
        )
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      let clicked = false;
      el.addEventListener("md-data-grid-row-click", () => {
        clicked = true;
      });
      click(rowEls(el)[0]);
      await el.updateComplete;

      expect(el.rowSelectionModel.size).to.equal(0);
      expect(clicked).to.be.true;
    });

    it("dispatches md-data-grid-row-selection-model-change with the new Set", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      let detail;
      el.addEventListener("md-data-grid-row-selection-model-change", (e) => {
        detail = /** @type {CustomEvent} */ (e).detail;
      });
      click(rowEls(el)[0]);

      expect(detail).to.be.instanceOf(Set);
      expect([...detail]).to.deep.equal([0]);
    });

    it("is controlled — setting rowSelectionModel highlights the matching row", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      el.rowSelectionModel = new Set([1]);
      await el.updateComplete;

      expect(rowEls(el)[1].classList.contains("data-grid__row_selected")).to.be
        .true;
      expect(rowEls(el)[0].classList.contains("data-grid__row_selected")).to.be
        .false;
    });

    it("re-anchors shift-range selection after rows are resorted", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(5);
      await el.updateComplete;

      click(rowEls(el)[1]);
      await el.updateComplete;

      // Re-triggers `updated()`'s rows-changed path, resetting the anchor —
      // a stale anchor index would otherwise silently range-select against
      // whatever row now sits at that same position.
      el.rows = [...el.rows];
      await el.updateComplete;

      click(rowEls(el)[3], { shiftKey: true });
      await el.updateComplete;

      // No anchor -> shift-click behaved like a plain click.
      expect([...el.rowSelectionModel]).to.deep.equal([3]);
    });
  });

  describe("cellClassName", () => {
    it("applies a plain string as a class on every cell in that column", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [
        { field: "id", headerName: "ID", cellClassName: "id-cell" },
        { field: "name", headerName: "Name" },
      ];
      el.rows = makeRows(2);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const cells = /** @type {any[]} */ ([
        ...el.shadowRoot.querySelectorAll("md-data-grid-cell"),
      ]);
      const idCells = cells.filter((c) => c.column.field === "id");
      const nameCells = cells.filter((c) => c.column.field === "name");

      expect(idCells.length).to.be.greaterThan(0);
      for (const cell of idCells) {
        expect(cell.classList.contains("id-cell")).to.be.true;
      }
      for (const cell of nameCells) {
        expect(cell.classList.contains("id-cell")).to.be.false;
      }
    });

    it("computes a class per cell when given a function", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [
        {
          field: "id",
          headerName: "ID",
          cellClassName: ({ row }) =>
            /** @type {{ id: number }} */ (row).id % 2 === 0
              ? "id-even"
              : "id-odd",
        },
      ];
      el.rows = makeRows(3);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const cells = /** @type {any[]} */ ([
        ...el.shadowRoot.querySelectorAll("md-data-grid-cell"),
      ]);
      const byRow = new Map(cells.map((c) => [c.rowIndex, c]));

      expect(byRow.get(0).classList.contains("id-even")).to.be.true;
      expect(byRow.get(1).classList.contains("id-odd")).to.be.true;
      expect(byRow.get(2).classList.contains("id-even")).to.be.true;
    });

    it("removes the previous class when cellClassName's value changes", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [
        { field: "id", headerName: "ID", cellClassName: "first-class" },
      ];
      el.rows = makeRows(1);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const cell = /** @type {any} */ (
        el.shadowRoot.querySelector("md-data-grid-cell")
      );
      expect(cell.classList.contains("first-class")).to.be.true;

      el.columns = [
        { field: "id", headerName: "ID", cellClassName: "second-class" },
      ];
      await el.updateComplete;

      expect(cell.classList.contains("first-class")).to.be.false;
      expect(cell.classList.contains("second-class")).to.be.true;
    });
  });

  describe("headerClassName", () => {
    it("applies a plain string as a class on that column's header", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [
        { field: "id", headerName: "ID", headerClassName: "id-header" },
        { field: "name", headerName: "Name" },
      ];
      el.rows = makeRows(1);
      await el.updateComplete;

      const headers = /** @type {any[]} */ ([
        ...el.shadowRoot.querySelectorAll("md-data-grid-header-cell"),
      ]);
      expect(headers[0].classList.contains("id-header")).to.be.true;
      expect(headers[1].classList.contains("id-header")).to.be.false;
    });

    it("computes a class from the column when given a function", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [
        {
          field: "id",
          headerName: "ID",
          headerClassName: (column) => `header-for-${column.field}`,
        },
      ];
      el.rows = makeRows(1);
      await el.updateComplete;

      const header = /** @type {any} */ (
        el.shadowRoot.querySelector("md-data-grid-header-cell")
      );
      expect(header.classList.contains("header-for-id")).to.be.true;
    });

    it("removes the previous class when headerClassName's value changes", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [
        { field: "id", headerName: "ID", headerClassName: "first-class" },
      ];
      el.rows = makeRows(1);
      await el.updateComplete;

      const header = /** @type {any} */ (
        el.shadowRoot.querySelector("md-data-grid-header-cell")
      );
      expect(header.classList.contains("first-class")).to.be.true;

      el.columns = [
        { field: "id", headerName: "ID", headerClassName: "second-class" },
      ];
      await el.updateComplete;

      expect(header.classList.contains("first-class")).to.be.false;
      expect(header.classList.contains("second-class")).to.be.true;
    });
  });

  describe("checkboxSelection", () => {
    /**
     * @param {MdDataGrid} el
     * @param {number} rowIndex
     */
    async function getRowCheckbox(el, rowIndex) {
      const cells = /** @type {any[]} */ ([
        ...el.shadowRoot.querySelectorAll("md-data-grid-cell"),
      ]);
      const cell = cells.find(
        (c) => c.rowIndex === rowIndex && c.colIndex === 0,
      );
      await cell.updateComplete;
      const checkboxCell = cell.shadowRoot.querySelector(
        "md-data-grid-checkbox-cell",
      );
      await checkboxCell.updateComplete;
      return checkboxCell.shadowRoot.querySelector("md-checkbox");
    }

    /** @param {MdDataGrid} el */
    async function getHeaderCheckbox(el) {
      const headerCell = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[0]
      );
      await headerCell.updateComplete;
      const checkboxHeader = headerCell.shadowRoot.querySelector(
        "md-data-grid-checkbox-header",
      );
      if (!checkboxHeader) return null;
      await checkboxHeader.updateComplete;
      return checkboxHeader.shadowRoot.querySelector("md-checkbox");
    }

    /**
     * @param {HTMLElement} checkbox
     * @param {{ shiftKey?: boolean, ctrlKey?: boolean }} [modifiers]
     */
    function clickCheckbox(checkbox, modifiers = {}) {
      checkbox.dispatchEvent(
        new MouseEvent("click", { bubbles: true, ...modifiers }),
      );
    }

    it("is off by default — no checkbox column rendered", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      expect(el._columns).to.deep.equal(COLUMNS);
      expect(el.shadowRoot.querySelector("md-data-grid-checkbox-header")).to.not
        .exist;
    });

    it("prepends GRID_CHECKBOX_SELECTION_COL_DEF without mutating the public columns array", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid checkbox-selection></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      expect(el._columns.length).to.equal(COLUMNS.length + 1);
      expect(el._columns[0].field).to.equal("__check__");
      expect(el._columns.slice(1)).to.deep.equal(COLUMNS);
      // The public property itself is never touched.
      expect(el.columns).to.deep.equal(COLUMNS);
    });

    it("the checkbox column is not resizable or sortable", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid checkbox-selection></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      const checkboxHeaderCell = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[0]
      );
      expect(checkboxHeaderCell.resizable).to.be.false;
      expect(checkboxHeaderCell.sortable).to.be.false;
    });

    it("clicking a row's checkbox toggles just that row into the selection additively", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid checkbox-selection></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      el.rowSelectionModel = new Set([0]);
      await el.updateComplete;

      const checkbox = await getRowCheckbox(el, 2);
      clickCheckbox(checkbox);
      await el.updateComplete;

      expect([...el.rowSelectionModel].sort()).to.deep.equal([0, 2]);
    });

    it("clicking an already-checked row's checkbox unchecks just that row", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid checkbox-selection></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      el.rowSelectionModel = new Set([0, 1]);
      await el.updateComplete;

      const checkbox = await getRowCheckbox(el, 0);
      clickCheckbox(checkbox);
      await el.updateComplete;

      expect([...el.rowSelectionModel]).to.deep.equal([1]);
    });

    it("shift-clicking a checkbox range-selects, same as shift-clicking a row", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid checkbox-selection></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(5);
      await el.updateComplete;

      const first = await getRowCheckbox(el, 1);
      clickCheckbox(first);
      await el.updateComplete;

      const fourth = await getRowCheckbox(el, 3);
      clickCheckbox(fourth, { shiftKey: true });
      await el.updateComplete;

      expect([...el.rowSelectionModel].sort()).to.deep.equal([1, 2, 3]);
    });

    it("a checkbox click doesn't also trigger the row's own click-to-select (no double handling)", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid checkbox-selection></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      el.rowSelectionModel = new Set([0, 1]);
      await el.updateComplete;

      // If the click also bubbled to the row's own handler, a plain
      // (unmodified) click there would replace the selection with just
      // row 2 instead of adding to it.
      const checkbox = await getRowCheckbox(el, 2);
      clickCheckbox(checkbox);
      await el.updateComplete;

      expect([...el.rowSelectionModel].sort()).to.deep.equal([0, 1, 2]);
    });

    it("a plain click anywhere in a row is additive too, same as clicking its checkbox — it doesn't drop the previous selection", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid checkbox-selection></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      const rows = el.shadowRoot.querySelectorAll(".data-grid__row");
      rows[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await el.updateComplete;
      rows[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await el.updateComplete;

      expect([...el.rowSelectionModel].sort()).to.deep.equal([0, 2]);
    });

    it("without checkboxSelection, a plain row click still replaces the selection as before", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      const rows = el.shadowRoot.querySelectorAll(".data-grid__row");
      rows[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await el.updateComplete;
      rows[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await el.updateComplete;

      expect([...el.rowSelectionModel]).to.deep.equal([2]);
    });

    it("shift-clicking a row still range-selects when checkboxSelection is on", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid checkbox-selection></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(5);
      await el.updateComplete;

      const rows = el.shadowRoot.querySelectorAll(".data-grid__row");
      rows[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await el.updateComplete;
      rows[3].dispatchEvent(
        new MouseEvent("click", { bubbles: true, shiftKey: true }),
      );
      await el.updateComplete;

      expect([...el.rowSelectionModel].sort()).to.deep.equal([1, 2, 3]);
    });

    it("header checkbox reflects unchecked/indeterminate/checked across the selection", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid checkbox-selection></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      let headerCheckbox = await getHeaderCheckbox(el);
      expect(headerCheckbox.checked).to.be.false;
      expect(headerCheckbox.indeterminate).to.be.false;

      el.rowSelectionModel = new Set([0]);
      await el.updateComplete;
      headerCheckbox = await getHeaderCheckbox(el);
      expect(headerCheckbox.checked).to.be.false;
      expect(headerCheckbox.indeterminate).to.be.true;

      el.rowSelectionModel = new Set([0, 1, 2]);
      await el.updateComplete;
      headerCheckbox = await getHeaderCheckbox(el);
      expect(headerCheckbox.checked).to.be.true;
      expect(headerCheckbox.indeterminate).to.be.false;
    });

    it("clicking the header checkbox selects every row across the whole dataset, not just the current page", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid checkbox-selection></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(10);
      el.paginationModel = { page: 0, pageSize: 4 };
      await el.updateComplete;

      const headerCheckbox = await getHeaderCheckbox(el);
      clickCheckbox(headerCheckbox);
      await el.updateComplete;

      expect(el.rowSelectionModel.size).to.equal(10);
    });

    it("clicking the header checkbox again clears the selection", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid checkbox-selection></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      el.rowSelectionModel = new Set([0, 1, 2]);
      await el.updateComplete;

      const headerCheckbox = await getHeaderCheckbox(el);
      clickCheckbox(headerCheckbox);
      await el.updateComplete;

      expect(el.rowSelectionModel.size).to.equal(0);
    });

    it("renders no header checkbox when disableMultipleRowSelection is set", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            checkbox-selection
            disable-multiple-row-selection
          ></md-data-grid>`,
        )
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      expect(await getHeaderCheckbox(el)).to.equal(null);
    });

    it("dispatches md-data-grid-row-selection-model-change on checkbox click, same event as row clicks", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid checkbox-selection></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      let detail;
      el.addEventListener("md-data-grid-row-selection-model-change", (e) => {
        detail = /** @type {CustomEvent} */ (e).detail;
      });
      const checkbox = await getRowCheckbox(el, 1);
      clickCheckbox(checkbox);

      expect(detail).to.be.instanceOf(Set);
      expect([...detail]).to.deep.equal([1]);
    });

    it("resizing a real column after the checkbox column writes back to the correct entry in the public columns array", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            checkbox-selection
            style="display:block; width: 400px;"
          ></md-data-grid>`,
        )
      );
      el.columns = [
        { field: "a", headerName: "A", width: 100 },
        { field: "b", headerName: "B", width: 100 },
      ];
      el.rows = makeRows(1);
      await el.updateComplete;
      await settle();
      await el.updateComplete;

      // Column "a" is merged index 1 (checkbox is 0) — its resize handle
      // lives on the header at that position.
      const header = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[1]
      );
      await header.updateComplete;
      const handle = header.shadowRoot.querySelector(
        "md-data-grid-column-separator",
      );
      await handle.updateComplete;

      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 1,
          clientX: 100,
          bubbles: true,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          clientX: 140,
          bubbles: true,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointerup", {
          pointerId: 1,
          clientX: 140,
          bubbles: true,
        }),
      );
      await el.updateComplete;

      // Written back to host.columns (raw, no checkbox entry) at index 0,
      // not index 1 — the offset introduced by the merged checkbox column
      // must be subtracted back out.
      expect(el.columns[0].field).to.equal("a");
      expect(el.columns[0].width).to.equal(140);
      expect(el.columns[1].field).to.equal("b");
      expect(el.columns[1].width).to.equal(60);
    });
  });

  describe("master detail", () => {
    /**
     * `md-data-grid-detail-toggle-cell` itself always exists once the column is
     * present — only its inner icon-button is conditionally omitted for a
     * row with no detail content. Returns that button, or `null`. Never
     * assert `.to.not.exist` against the cell/component itself instead of
     * this — a live, circularly-referenced Lit element failing that
     * assertion makes chai hang trying to serialize it for the failure
     * message, rather than failing loudly (see the `footer slot` describe
     * block above for the same lesson learned the hard way).
     * @param {MdDataGrid} el
     * @param {number} rowIndex
     */
    async function getToggleButton(el, rowIndex) {
      const cells = /** @type {any[]} */ ([
        ...el.shadowRoot.querySelectorAll("md-data-grid-cell"),
      ]);
      const cell = cells.find(
        (c) => c.rowIndex === rowIndex && c.colIndex === 0,
      );
      await cell.updateComplete;
      const toggleCell = cell.shadowRoot.querySelector(
        "md-data-grid-detail-toggle-cell",
      );
      await toggleCell.updateComplete;
      return toggleCell.shadowRoot.querySelector("md-icon-button");
    }

    it("is off by default — no detail-toggle column rendered", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      await el.updateComplete;

      expect(el._columns).to.deep.equal(COLUMNS);
    });

    it("prepends GRID_DETAIL_PANEL_TOGGLE_COL_DEF after checkbox, before user columns", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid checkbox-selection></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(2);
      el.getDetailPanelContent = () => html`<div>Detail</div>`;
      await el.updateComplete;

      expect(el._columns.map((c) => c.field)).to.deep.equal([
        "__check__",
        "__detail_panel_toggle__",
        "id",
        "name",
      ]);
      // The public property itself is never touched.
      expect(el.columns).to.deep.equal(COLUMNS);
    });

    it("renders a toggle button per row and expands a detail row on click", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="height: 400px; display: block;"
          ></md-data-grid>`,
        )
      );
      el.columns = COLUMNS;
      el.rows = makeRows(5);
      el.getDetailPanelContent = ({ row }) =>
        html`<div>Detail for ${row.name}</div>`;
      await el.updateComplete;

      for (let i = 0; i < 5; i++) {
        expect(await getToggleButton(el, i), `row ${i}`).to.exist;
      }
      expect(
        el.shadowRoot.querySelectorAll(".data-grid__detail-row"),
      ).to.have.lengthOf(0);

      const button = await getToggleButton(el, 1);
      button.click();
      await el.updateComplete;

      const detailRows = el.shadowRoot.querySelectorAll(
        ".data-grid__detail-row",
      );
      expect(detailRows).to.have.lengthOf(1);
      expect(detailRows[0].textContent).to.contain("Detail for Row 1");

      button.click();
      await el.updateComplete;
      expect(
        el.shadowRoot.querySelectorAll(".data-grid__detail-row"),
      ).to.have.lengthOf(0);
    });

    it("updates aria-expanded and rotates the icon immediately on click, without needing blur", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="height: 400px; display: block;"
          ></md-data-grid>`,
        )
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      el.getDetailPanelContent = ({ row }) => html`<div>Detail ${row.id}</div>`;
      await el.updateComplete;

      const button = await getToggleButton(el, 0);
      expect(button.getAttribute("aria-expanded")).to.equal("false");

      // No focus/blur dispatched anywhere here — willUpdate()'s context
      // rebuild has to fire from the detailPanelExpandedRowIds change
      // itself, not incidentally from some later, unrelated focus change.
      button.click();
      await el.updateComplete;

      expect(button.getAttribute("aria-expanded")).to.equal("true");
      const icon = button.querySelector(".data-grid-detail-toggle-cell__icon");
      expect(
        icon.classList.contains("data-grid-detail-toggle-cell__icon_expanded"),
      ).to.be.true;

      button.click();
      await el.updateComplete;
      expect(button.getAttribute("aria-expanded")).to.equal("false");
    });

    it("hides the toggle button for a row getDetailPanelContent returns nothing for", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="height: 400px; display: block;"
          ></md-data-grid>`,
        )
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      el.getDetailPanelContent = ({ row }) =>
        row.id === 1 ? undefined : html`<div>Detail</div>`;
      await el.updateComplete;

      expect(await getToggleButton(el, 0)).to.exist;
      expect(await getToggleButton(el, 1)).to.not.exist;
      expect(await getToggleButton(el, 2)).to.exist;
    });

    it("clicking the toggle does not also select the row", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="height: 400px; display: block;"
          ></md-data-grid>`,
        )
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      el.getDetailPanelContent = ({ row }) => html`<div>Detail ${row.id}</div>`;
      await el.updateComplete;

      const button = await getToggleButton(el, 0);
      button.click();
      await el.updateComplete;

      expect(el.rowSelectionModel.size).to.equal(0);
      expect(el.detailPanelExpandedRowIds.has(0)).to.be.true;
    });

    it("toggleDetailPanel() flips a single row imperatively", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      el.getDetailPanelContent = ({ row }) => html`<div>Detail ${row.id}</div>`;
      await el.updateComplete;

      el.toggleDetailPanel(1);
      await el.updateComplete;
      expect(el.detailPanelExpandedRowIds.has(1)).to.be.true;

      el.toggleDetailPanel(1);
      await el.updateComplete;
      expect(el.detailPanelExpandedRowIds.has(1)).to.be.false;
    });

    it("setExpandedDetailPanel() replaces the whole expanded set wholesale", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="height: 400px; display: block;"
          ></md-data-grid>`,
        )
      );
      el.columns = COLUMNS;
      el.rows = makeRows(5);
      el.getDetailPanelContent = ({ row }) => html`<div>Detail ${row.id}</div>`;
      await el.updateComplete;

      el.setExpandedDetailPanel(new Set([0, 2, 4]));
      await el.updateComplete;

      expect(
        el.shadowRoot.querySelectorAll(".data-grid__detail-row"),
      ).to.have.lengthOf(3);
      expect([...el.detailPanelExpandedRowIds]).to.deep.equal([0, 2, 4]);
    });

    it("dispatches md-data-grid-detail-panel-expanded-row-ids-change on toggle", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(3);
      el.getDetailPanelContent = () => html`<div>Detail</div>`;
      await el.updateComplete;

      /** @type {Set<PropertyKey> | undefined} */
      let detail;
      el.addEventListener(
        "md-data-grid-detail-panel-expanded-row-ids-change",
        (e) => {
          detail = /** @type {CustomEvent} */ (e).detail;
        },
      );
      el.toggleDetailPanel(1);

      expect(detail).to.be.instanceOf(Set);
      expect([...(detail ?? [])]).to.deep.equal([1]);
    });

    it("keyboard ArrowDown skips over a detail row entirely", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="height: 400px; display: block;"
          ></md-data-grid>`,
        )
      );
      el.columns = COLUMNS;
      el.rows = makeRows(5);
      el.getDetailPanelContent = ({ row }) => html`<div>Detail ${row.id}</div>`;
      await el.updateComplete;

      el.toggleDetailPanel(0);
      await el.updateComplete;

      const root = el.shadowRoot.querySelector('[part="root"]');
      root.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          composed: true,
        }),
      );
      await el.updateComplete;

      // Row 1, not the detail row in between — KeyboardNavController never
      // sees detail rows as a concept at all (see DetailPanelController's
      // own doc comment).
      expect(el._focus.focusedCell).to.deep.equal({ rowIndex: 1, colIndex: 0 });
    });

    it("scrollToRow() and getVisibleRows() stay correct with a row expanded above the target", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(
          html`<md-data-grid
            style="height: 200px; display: block;"
          ></md-data-grid>`,
        )
      );
      el.columns = COLUMNS;
      el.rows = makeRows(50);
      el.getDetailPanelContent = ({ row }) => html`<div>Detail ${row.id}</div>`;
      await el.updateComplete;

      el.toggleDetailPanel(0);
      await el.updateComplete;

      el.scrollToRow(10);
      await el.updateComplete;

      const rowIndices = el.getVisibleRows().map((v) => v.rowIndex);
      expect(rowIndices).to.include(10);
      // getVisibleRows() only ever returns real rows, never detail items.
      expect(rowIndices.every((i) => Number.isInteger(i))).to.be.true;
    });

    it("expanded rows don't count against pageSize", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = COLUMNS;
      el.rows = makeRows(20);
      el.getDetailPanelContent = ({ row }) => html`<div>Detail ${row.id}</div>`;
      el.paginationModel = { page: 0, pageSize: 5 };
      await el.updateComplete;

      el.setExpandedDetailPanel(new Set([0, 1, 2]));
      await el.updateComplete;

      // Still exactly 5 data rows on the page — the 3 detail rows are extra,
      // not substitutes.
      const cells = el.shadowRoot.querySelectorAll("md-data-grid-cell");
      const dataRowIndices = new Set(
        [...cells].map((c) => /** @type {any} */ (c).rowIndex),
      );
      expect(dataRowIndices.size).to.equal(5);
      expect(
        el.shadowRoot.querySelectorAll(".data-grid__detail-row"),
      ).to.have.lengthOf(3);
    });
  });

  // The rest of treeData's behavior (hierarchical rows, cascading
  // selection, column order, etc.) lives in data-grid-tree.spec.js against
  // <md-data-grid-tree> — these two are base-class regression guards,
  // asserting plain <md-data-grid> (no tree behavior at all after the
  // split) stays completely unaffected.
  describe("treeData (base class has none — see data-grid-tree.spec.js)", () => {
    const TREE_COLUMNS = [{ field: "name", headerName: "Name" }];

    /** Every path segment has a real backing row — no synthetic groups. */
    const REAL_ROWS = [
      { id: "eng", path: ["Engineering"], name: "Engineering" },
      { id: "fe", path: ["Engineering", "Frontend"], name: "Frontend" },
      { id: "be", path: ["Engineering", "Backend"], name: "Backend" },
      { id: "sales", path: ["Sales"], name: "Sales" },
    ];

    it("no grouping column rendered — there's no tree column def on the base class at all", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = TREE_COLUMNS;
      el.rows = REAL_ROWS;
      await el.updateComplete;

      expect(el._columns).to.deep.equal(TREE_COLUMNS);
    });

    it("getDataPath alone, without the tree subclass, has no effect — every row renders at the top level", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.getDataPath = (row) => /** @type {any} */ (row).path;
      el.columns = TREE_COLUMNS;
      el.rows = REAL_ROWS;
      await el.updateComplete;

      expect(el._columns).to.deep.equal(TREE_COLUMNS);
      expect(
        el.shadowRoot.querySelectorAll(".data-grid__row"),
      ).to.have.lengthOf(REAL_ROWS.length);
    });
  });
});
