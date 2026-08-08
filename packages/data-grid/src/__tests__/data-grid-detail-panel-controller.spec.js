import { expect } from "@open-wc/testing";

import { DetailPanelController } from "../controllers/data-grid-detail-panel-controller.js";

/** @param {number} count */
function makeRows(count) {
  return Array.from({ length: count }, (_, i) => ({ id: i, name: `Row ${i}` }));
}

/**
 * @param {{
 *   rows?: Record<string, unknown>[],
 *   detailPanelExpandedRowIds?: Set<PropertyKey>,
 *   getDetailPanelContent?: (params: { row: Record<string, unknown>, rowIndex: number }) => unknown,
 * }} [options]
 * @returns {import("../controllers/data-grid-detail-panel-controller.js").DetailPanelControllerHost & { rows: Record<string, unknown>[] }}
 */
function makeHost({
  rows = [],
  detailPanelExpandedRowIds = new Set(),
  getDetailPanelContent,
} = {}) {
  return Object.assign(new EventTarget(), {
    rows,
    getRowId: (/** @type {Record<string, unknown>} */ row) =>
      /** @type {{ id: PropertyKey }} */ (row).id,
    detailPanelExpandedRowIds,
    getDetailPanelContent,
  });
}

describe("DetailPanelController", () => {
  describe("hasContent", () => {
    it("is false when getDetailPanelContent is unset", () => {
      const host = makeHost();
      const controller = new DetailPanelController(host);
      expect(controller.hasContent({ id: 1 }, 0)).to.be.false;
    });

    it("is true when getDetailPanelContent returns a non-null value", () => {
      const host = makeHost({ getDetailPanelContent: () => "detail" });
      const controller = new DetailPanelController(host);
      expect(controller.hasContent({ id: 1 }, 0)).to.be.true;
    });

    it("is false when getDetailPanelContent returns undefined/null for this row", () => {
      const host = makeHost({ getDetailPanelContent: () => undefined });
      const controller = new DetailPanelController(host);
      expect(controller.hasContent({ id: 1 }, 0)).to.be.false;
    });

    it("passes row and rowIndex through to getDetailPanelContent", () => {
      const host = makeHost({
        getDetailPanelContent: ({ row, rowIndex }) =>
          rowIndex === 2 && row.id === "r" ? "detail" : undefined,
      });
      const controller = new DetailPanelController(host);
      expect(controller.hasContent({ id: "r" }, 2)).to.be.true;
      expect(controller.hasContent({ id: "r" }, 1)).to.be.false;
    });
  });

  describe("isExpanded / toggle / setExpanded", () => {
    it("toggle adds an id not already expanded", () => {
      const host = makeHost();
      const controller = new DetailPanelController(host);
      controller.toggle(1);
      expect(controller.isExpanded(1)).to.be.true;
      expect(host.detailPanelExpandedRowIds.has(1)).to.be.true;
    });

    it("toggle removes an id already expanded", () => {
      const host = makeHost({ detailPanelExpandedRowIds: new Set([1]) });
      const controller = new DetailPanelController(host);
      controller.toggle(1);
      expect(controller.isExpanded(1)).to.be.false;
    });

    it("toggle replaces host.detailPanelExpandedRowIds with a new Set instance", () => {
      const original = new Set([1]);
      const host = makeHost({ detailPanelExpandedRowIds: original });
      const controller = new DetailPanelController(host);
      controller.toggle(2);
      expect(host.detailPanelExpandedRowIds).to.not.equal(original);
      expect([...host.detailPanelExpandedRowIds]).to.deep.equal([1, 2]);
    });

    it("toggle dispatches md-data-grid-detail-panel-expanded-row-ids-change with a Set copy", (done) => {
      const host = makeHost();
      const controller = new DetailPanelController(host);
      host.addEventListener(
        "md-data-grid-detail-panel-expanded-row-ids-change",
        (e) => {
          const detail = /** @type {CustomEvent} */ (e).detail;
          expect(detail).to.be.instanceOf(Set);
          expect([...detail]).to.deep.equal([1]);
          expect(detail).to.not.equal(host.detailPanelExpandedRowIds);
          done();
        },
      );
      controller.toggle(1);
    });

    it("setExpanded replaces the whole set wholesale", () => {
      const host = makeHost({ detailPanelExpandedRowIds: new Set([1, 2, 3]) });
      const controller = new DetailPanelController(host);
      controller.setExpanded(new Set([9]));
      expect([...host.detailPanelExpandedRowIds]).to.deep.equal([9]);
    });

    it("setExpanded copies the passed-in Set rather than aliasing it", () => {
      const host = makeHost();
      const controller = new DetailPanelController(host);
      const ids = new Set([1]);
      controller.setExpanded(ids);
      expect(host.detailPanelExpandedRowIds).to.not.equal(ids);
      ids.add(2);
      expect(host.detailPanelExpandedRowIds.has(2)).to.be.false;
    });
  });

  describe("buildRenderItems", () => {
    it("is all-row items with an identity index map when getDetailPanelContent is unset", () => {
      const rows = makeRows(3);
      const host = makeHost({ rows });
      const controller = new DetailPanelController(host);
      const { items, rowIndexToVirtualIndex } =
        controller.buildRenderItems(rows);
      expect(items).to.deep.equal([
        { kind: "row", row: rows[0], rowIndex: 0 },
        { kind: "row", row: rows[1], rowIndex: 1 },
        { kind: "row", row: rows[2], rowIndex: 2 },
      ]);
      expect(rowIndexToVirtualIndex).to.deep.equal([0, 1, 2]);
    });

    it("is all-row items when getDetailPanelContent is set but nothing is expanded", () => {
      const rows = makeRows(3);
      const host = makeHost({ rows, getDetailPanelContent: () => "detail" });
      const controller = new DetailPanelController(host);
      const { items, rowIndexToVirtualIndex } =
        controller.buildRenderItems(rows);
      expect(items.every((item) => item.kind === "row")).to.be.true;
      expect(rowIndexToVirtualIndex).to.deep.equal([0, 1, 2]);
    });

    it("injects a detail item right after an expanded row with content", () => {
      const rows = makeRows(3);
      const host = makeHost({
        rows,
        detailPanelExpandedRowIds: new Set([1]),
        getDetailPanelContent: ({ row }) => `detail for ${row.id}`,
      });
      const controller = new DetailPanelController(host);
      const { items, rowIndexToVirtualIndex } =
        controller.buildRenderItems(rows);

      expect(items).to.deep.equal([
        { kind: "row", row: rows[0], rowIndex: 0 },
        { kind: "row", row: rows[1], rowIndex: 1 },
        { kind: "detail", row: rows[1], rowIndex: 1, content: "detail for 1" },
        { kind: "row", row: rows[2], rowIndex: 2 },
      ]);
      // Row 2 is pushed one slot further right by the detail item ahead of it.
      expect(rowIndexToVirtualIndex).to.deep.equal([0, 1, 3]);
    });

    it("injects nothing for a row that's expanded but has no content", () => {
      const rows = makeRows(2);
      const host = makeHost({
        rows,
        detailPanelExpandedRowIds: new Set([0, 1]),
        getDetailPanelContent: ({ row }) =>
          row.id === 0 ? "detail" : undefined,
      });
      const controller = new DetailPanelController(host);
      const { items, rowIndexToVirtualIndex } =
        controller.buildRenderItems(rows);

      expect(items).to.deep.equal([
        { kind: "row", row: rows[0], rowIndex: 0 },
        { kind: "detail", row: rows[0], rowIndex: 0, content: "detail" },
        { kind: "row", row: rows[1], rowIndex: 1 },
      ]);
      expect(rowIndexToVirtualIndex).to.deep.equal([0, 2]);
    });

    it("handles multiple expanded rows, each shifting later rows further", () => {
      const rows = makeRows(4);
      const host = makeHost({
        rows,
        detailPanelExpandedRowIds: new Set([0, 2]),
        getDetailPanelContent: ({ row }) => `detail ${row.id}`,
      });
      const controller = new DetailPanelController(host);
      const { rowIndexToVirtualIndex } = controller.buildRenderItems(rows);
      // row0(0) detail(1) row1(2) row2(3) detail(4) row3(5)
      expect(rowIndexToVirtualIndex).to.deep.equal([0, 2, 3, 5]);
    });

    it("calls getDetailPanelContent exactly once per data row", () => {
      const rows = makeRows(3);
      let calls = 0;
      const host = makeHost({
        rows,
        detailPanelExpandedRowIds: new Set([0, 1, 2]),
        getDetailPanelContent: () => {
          calls++;
          return "detail";
        },
      });
      const controller = new DetailPanelController(host);
      controller.buildRenderItems(rows);
      expect(calls).to.equal(3);
    });
  });
});
