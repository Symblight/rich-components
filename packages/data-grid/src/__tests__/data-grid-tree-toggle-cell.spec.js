import { expect, fixture, html } from "@open-wc/testing";

import "../tree/data-grid-tree.js";
import { buildDataGridContext } from "../base/data-grid-build-context.js";
/** @import { MdDataGridTree } from "../tree/data-grid-tree.js" */

// md-data-grid-tree-toggle-cell always renders inside an md-data-grid-tree
// (it consumes dataGridContext) — exercised through a minimal real grid,
// same convention as md-data-grid-cell.spec.js. `_columns` auto-prepends
// GRID_TREE_DATA_GROUPING_COL_DEF once `treeData`+`getDataPath` are both
// set — `columns` itself is left as the user's own (empty here); label
// overrides go through `autoGroupColumnDef`, the same escape hatch a real
// consumer would use. Every row used here has a real backing row at every
// path level, since a synthetic (auto-generated) group has no row to
// actually render this way.
describe("md-data-grid-tree-toggle-cell", () => {
  /**
   * @param {Record<string, unknown>[]} rows
   * @param {Partial<import("../base/data-grid.js").DataGridColumn>} [autoGroupColumnDef]
   */
  async function makeTreeGrid(rows, autoGroupColumnDef) {
    const el = /** @type {MdDataGridTree} */ (
      await fixture(html`<md-data-grid-tree></md-data-grid-tree>`)
    );
    el.getDataPath = (row) => /** @type {{ path: string[] }} */ (row).path;
    if (autoGroupColumnDef) el.autoGroupColumnDef = autoGroupColumnDef;
    el.rows = rows;
    await el.updateComplete;
    return el;
  }

  /**
   * @param {MdDataGridTree} el
   * @param {number} rowIndex
   */
  async function getToggleCell(el, rowIndex) {
    const cell = /** @type {any} */ (
      el.shadowRoot.querySelectorAll("md-data-grid-cell")[rowIndex]
    );
    const toggleCell = cell.shadowRoot.querySelector(
      "md-data-grid-tree-toggle-cell",
    );
    await toggleCell.updateComplete;
    return toggleCell;
  }

  const ROWS = [
    { id: "eng", path: ["Engineering"], name: "Engineering" },
    { id: "fe", path: ["Engineering", "Frontend"], name: "Frontend" },
  ];

  it("renders the raw path segment as the default label", async () => {
    const el = await makeTreeGrid(ROWS);

    const rootCell = await getToggleCell(el, 0);
    expect(rootCell.shadowRoot.textContent).to.contain("Engineering");

    // Collapsed by default — "Frontend" isn't rendered at all until its
    // parent is expanded.
    el.treeDataExpandedGroupIds = new Set(["eng"]);
    await el.updateComplete;

    const childCell = await getToggleCell(el, 1);
    expect(childCell.shadowRoot.textContent).to.contain("Frontend");
  });

  it("uses column.valueGetter to compute a custom label when given", async () => {
    const el = await makeTreeGrid(ROWS, {
      valueGetter: ({ row }) => `** ${row.name} **`,
    });

    const rootCell = await getToggleCell(el, 0);
    expect(rootCell.shadowRoot.textContent).to.contain("** Engineering **");
  });

  it("shows an expand/collapse toggle only for a row with children", async () => {
    const el = await makeTreeGrid(ROWS);

    const rootCell = await getToggleCell(el, 0);
    expect(rootCell.shadowRoot.querySelector("md-icon-button")).to.exist;
    expect(
      rootCell.shadowRoot.querySelector(".data-grid-tree-toggle-cell__spacer"),
    ).to.not.exist;

    // Collapsed by default — expand to reach the leaf row.
    el.treeDataExpandedGroupIds = new Set(["eng"]);
    await el.updateComplete;

    const leafCell = await getToggleCell(el, 1);
    expect(leafCell.shadowRoot.querySelector("md-icon-button")).to.not.exist;
    expect(
      leafCell.shadowRoot.querySelector(".data-grid-tree-toggle-cell__spacer"),
    ).to.exist;
  });

  it("indents deeper rows further via padding-inline-start", async () => {
    const el = await makeTreeGrid(ROWS);
    el.treeDataExpandedGroupIds = new Set(["eng"]);
    await el.updateComplete;

    const rootCell = await getToggleCell(el, 0);
    const childCell = await getToggleCell(el, 1);

    // Both resolve to the same CSS custom-property expression; only the
    // multiplier (depth) differs between them.
    expect(rootCell.style.paddingInlineStart).to.contain("* 0");
    expect(childCell.style.paddingInlineStart).to.contain("* 1");
  });

  it("clicking the toggle expands the group and dispatches the change event", async () => {
    const el = await makeTreeGrid(ROWS);
    let eventDetail;
    el.addEventListener(
      "md-data-grid-tree-data-expanded-group-ids-change",
      (e) => {
        eventDetail = /** @type {CustomEvent} */ (e).detail;
      },
    );

    const rootCell = await getToggleCell(el, 0);
    const button = rootCell.shadowRoot.querySelector("md-icon-button");
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await el.updateComplete;

    expect(el.treeDataExpandedGroupIds.has("eng")).to.be.true;
    expect(eventDetail.has("eng")).to.be.true;
  });

  it("aria-expanded reflects the current expand state", async () => {
    const el = await makeTreeGrid(ROWS);
    let rootCell = await getToggleCell(el, 0);
    let button = rootCell.shadowRoot.querySelector("md-icon-button");
    expect(button.getAttribute("aria-expanded")).to.equal("false");

    el.treeDataExpandedGroupIds = new Set(["eng"]);
    await el.updateComplete;

    rootCell = await getToggleCell(el, 0);
    button = rootCell.shadowRoot.querySelector("md-icon-button");
    expect(button.getAttribute("aria-expanded")).to.equal("true");
  });

  it("a toggle click doesn't also trigger the row's own click-to-select", async () => {
    const el = await makeTreeGrid(ROWS);
    let rowClicked = false;
    el.addEventListener("md-data-grid-row-click", () => {
      rowClicked = true;
    });

    const rootCell = await getToggleCell(el, 0);
    const button = rootCell.shadowRoot.querySelector("md-icon-button");
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await el.updateComplete;

    expect(rowClicked).to.be.false;
  });

  // Synthetic (auto-generated) group nodes have no real backing row, so
  // they can't be rendered by the grid's normal `renderCell` pipeline yet
  // (that requires `_effectiveRows` to know about tree nodes — separate,
  // later work). The context glue this cell depends on is still fully
  // testable directly against a synthetic id, though.
  describe("context getters against a synthetic group (not yet renderable)", () => {
    it("getGroupingKey/hasChildren/getRowDepth resolve correctly for an auto-generated group", async () => {
      const el = /** @type {MdDataGridTree} */ (
        await fixture(html`<md-data-grid-tree></md-data-grid-tree>`)
      );
      el.getDataPath = (row) => /** @type {{ path: string[] }} */ (row).path;
      el.rows = [
        { id: "apple", path: ["Fruit", "Apple"] },
        { id: "orange", path: ["Fruit", "Orange"] },
      ];
      await el.updateComplete;

      const fruitId = el._tree.getNode("apple")?.parent?.key;
      const ctx = buildDataGridContext(el);

      expect(ctx.getGroupingKey(fruitId)).to.equal("Fruit");
      expect(ctx.hasChildren(fruitId)).to.be.true;
      expect(ctx.getRowDepth(fruitId)).to.equal(0);
      expect(ctx.getRowDepth("apple")).to.equal(1);
      expect(ctx.hasChildren("apple")).to.be.false;
    });
  });
});
