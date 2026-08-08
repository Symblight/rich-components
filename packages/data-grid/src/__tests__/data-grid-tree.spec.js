import { expect, fixture, html } from "@open-wc/testing";

import "../tree/data-grid-tree.js";
import { DATA_GRID_ROOT_GROUP_ID } from "../controllers/data-grid-tree-controller.js";
import { buildDataGridContext } from "../base/data-grid-build-context.js";
/** @import { MdDataGridTree } from "../tree/data-grid-tree.js" */

/** @param {number} count */
function makeRows(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: `Row ${i}`,
  }));
}

// The two base-class regression guards ("off by default", "getDataPath
// alone without the tag stays flat") live in data-grid.spec.js instead —
// they assert plain <md-data-grid> is unaffected by this split, so they
// belong with the class that has no tree behavior at all.

describe("md-data-grid-tree wiring", () => {
  it("builds a tree automatically when rows are set", async () => {
    const el = /** @type {MdDataGridTree} */ (
      await fixture(html`<md-data-grid-tree></md-data-grid-tree>`)
    );
    el.rows = makeRows(3);
    await el.updateComplete;

    expect(el._tree.tree.key).to.equal(DATA_GRID_ROOT_GROUP_ID);
    expect(el._tree.rows.map((row) => row.id)).to.deep.equal([0, 1, 2]);
  });

  it("rebuilds the tree when getRowId changes", async () => {
    const el = /** @type {MdDataGridTree} */ (
      await fixture(html`<md-data-grid-tree></md-data-grid-tree>`)
    );
    el.rows = [{ uid: "a" }, { uid: "b" }];
    el.getRowId = (row) => /** @type {{ uid: string }} */ (row).uid;
    await el.updateComplete;

    expect(el._tree.rows.map((row) => row.key)).to.deep.equal(["a", "b"]);
  });

  it("builds a hierarchical tree once getDataPath is set", async () => {
    const el = /** @type {MdDataGridTree} */ (
      await fixture(html`<md-data-grid-tree></md-data-grid-tree>`)
    );
    el.rows = [
      { id: 1, path: ["Fruit", "Apple"] },
      { id: 2, path: ["Fruit", "Orange"] },
    ];
    await el.updateComplete;

    // No getDataPath yet — stays flat.
    expect(el._tree.tree.children.size).to.equal(2);

    el.getDataPath = (row) => /** @type {{ path: string[] }} */ (row).path;
    await el.updateComplete;

    expect(el._tree.tree.children.size).to.equal(1);
    const fruit = [...el._tree.tree.children.values()][0];
    expect(fruit.children.size).to.equal(2);
  });
});

describe("md-data-grid-tree", () => {
  describe("column resize offset with a prepended grouping column", () => {
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

    it("resizes the correct column when the grouping column is prepended (offset 1)", async () => {
      const el = /** @type {MdDataGridTree} */ (
        await fixture(
          html`<md-data-grid-tree
            style="display:block; width: 400px;"
          ></md-data-grid-tree>`,
        )
      );
      el.getDataPath = (row) => /** @type {any} */ (row).path;
      el.columns = [
        { field: "a", headerName: "A", width: 100 },
        { field: "b", headerName: "B", width: 100 },
      ];
      el.rows = [{ id: 1, path: ["Root"], a: 1, b: 2 }];
      await el.updateComplete;

      // Header cells: [0] tree-toggle, [1] "A", [2] "B".
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

    it("resizes the correct column with checkbox + grouping + master-detail all prepended together (offset 3)", async () => {
      const el = /** @type {MdDataGridTree} */ (
        await fixture(
          html`<md-data-grid-tree
            checkbox-selection
            style="display:block; width: 400px;"
          ></md-data-grid-tree>`,
        )
      );
      el.getDataPath = (row) => /** @type {any} */ (row).path;
      el.getDetailPanelContent = () => html`detail`;
      el.columns = [
        { field: "a", headerName: "A", width: 100 },
        { field: "b", headerName: "B", width: 100 },
      ];
      el.rows = [{ id: 1, path: ["Root"], a: 1, b: 2 }];
      await el.updateComplete;

      // Header cells: [0] checkbox, [1] tree-toggle, [2] detail-toggle,
      // [3] "A", [4] "B".
      const header = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[3]
      );
      const handle = await getHandle(header);
      pointerDown(handle, 100);
      pointerMove(handle, 140);
      pointerUp(handle, 140);
      await el.updateComplete;

      expect(el.columns[0].width).to.equal(140);
      expect(el.columns[1].width).to.equal(60);
    });

    it("resizingColumnField (dataGridContext) reflects a prepended synthetic column's field too (not just user columns)", async () => {
      const el = /** @type {MdDataGridTree} */ (
        await fixture(
          html`<md-data-grid-tree
            style="display:block; width: 400px;"
          ></md-data-grid-tree>`,
        )
      );
      el.getDataPath = (row) => /** @type {any} */ (row).path;
      el.columns = [
        { field: "a", headerName: "A", width: 100 },
        { field: "b", headerName: "B", width: 100 },
      ];
      el.rows = [{ id: 1, path: ["Root"], a: 1, b: 2 }];
      await el.updateComplete;

      // Header cell [0] is the auto-prepended tree-toggle column.
      const header = /** @type {any} */ (
        el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[0]
      );
      const handle = await getHandle(header);

      pointerDown(handle, 160);
      expect(buildDataGridContext(el).resizingColumnField).to.equal(
        "__tree_data_group__",
      );
      pointerUp(handle, 160);
    });
  });

  const TREE_COLUMNS = [{ field: "name", headerName: "Name" }];

  /** Every path segment has a real backing row — no synthetic groups. */
  const REAL_ROWS = [
    { id: "eng", path: ["Engineering"], name: "Engineering" },
    { id: "fe", path: ["Engineering", "Frontend"], name: "Frontend" },
    { id: "be", path: ["Engineering", "Backend"], name: "Backend" },
    { id: "sales", path: ["Sales"], name: "Sales" },
  ];

  /** "Fruit"/"Vegetable" have no row of their own — auto-generated. */
  const SYNTHETIC_GROUP_ROWS = [
    { id: "apple", path: ["Fruit", "Apple"], name: "Apple", qty: 2 },
    { id: "orange", path: ["Fruit", "Orange"], name: "Orange", qty: 1 },
    { id: "broccoli", path: ["Vegetable", "Broccoli"], name: "Broccoli" },
  ];

  /**
   * @param {MdDataGridTree} el
   * @param {number} rowIndex
   * @param {number} [colIndex]
   */
  async function getToggleCell(el, rowIndex, colIndex = 0) {
    const cells = /** @type {any[]} */ ([
      ...el.shadowRoot.querySelectorAll("md-data-grid-cell"),
    ]);
    const cell = cells.find(
      (c) => c.rowIndex === rowIndex && c.colIndex === colIndex,
    );
    await cell.updateComplete;
    const toggleCell = cell.shadowRoot.querySelector(
      "md-data-grid-tree-toggle-cell",
    );
    await toggleCell.updateComplete;
    return toggleCell;
  }

  /**
   * @param {MdDataGridTree} el
   * @param {number} rowIndex
   */
  async function getRowCheckbox(el, rowIndex) {
    const cells = /** @type {any[]} */ ([
      ...el.shadowRoot.querySelectorAll("md-data-grid-cell"),
    ]);
    const cell = cells.find((c) => c.rowIndex === rowIndex && c.colIndex === 0);
    await cell.updateComplete;
    const checkboxCell = cell.shadowRoot.querySelector(
      "md-data-grid-checkbox-cell",
    );
    await checkboxCell.updateComplete;
    return checkboxCell.shadowRoot.querySelector("md-checkbox");
  }

  /**
   * @param {HTMLElement} el
   */
  function click(el) {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  it("prepends GRID_TREE_DATA_GROUPING_COL_DEF without mutating the public columns array", async () => {
    const el = /** @type {MdDataGridTree} */ (
      await fixture(html`<md-data-grid-tree></md-data-grid-tree>`)
    );
    el.getDataPath = (row) => /** @type {any} */ (row).path;
    el.columns = TREE_COLUMNS;
    el.rows = REAL_ROWS;
    await el.updateComplete;

    expect(el._columns.length).to.equal(TREE_COLUMNS.length + 1);
    expect(el._columns[0].field).to.equal("__tree_data_group__");
    expect(el._columns.slice(1)).to.deep.equal(TREE_COLUMNS);
    expect(el.columns).to.deep.equal(TREE_COLUMNS);
  });

  it("column order is checkbox, tree-toggle, detail-toggle, then user columns", async () => {
    const el = /** @type {MdDataGridTree} */ (
      await fixture(
        html`<md-data-grid-tree checkbox-selection></md-data-grid-tree>`,
      )
    );
    el.getDataPath = (row) => /** @type {any} */ (row).path;
    el.getDetailPanelContent = () => html`detail`;
    el.columns = TREE_COLUMNS;
    el.rows = REAL_ROWS;
    await el.updateComplete;

    expect(el._columns.map((c) => c.field)).to.deep.equal([
      "__check__",
      "__tree_data_group__",
      "__detail_panel_toggle__",
      "name",
    ]);
  });

  it("autoGroupColumnDef overrides headerName without redefining the column", async () => {
    const el = /** @type {MdDataGridTree} */ (
      await fixture(html`<md-data-grid-tree></md-data-grid-tree>`)
    );
    el.getDataPath = (row) => /** @type {any} */ (row).path;
    el.autoGroupColumnDef = { headerName: "Org unit" };
    el.columns = TREE_COLUMNS;
    el.rows = REAL_ROWS;
    await el.updateComplete;

    const headerCell = /** @type {any} */ (
      el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[0]
    );
    expect(headerCell.column.headerName).to.equal("Org unit");
  });

  it("is collapsed by default — only top-level rows render", async () => {
    const el = /** @type {MdDataGridTree} */ (
      await fixture(html`<md-data-grid-tree></md-data-grid-tree>`)
    );
    el.getDataPath = (row) => /** @type {any} */ (row).path;
    el.columns = TREE_COLUMNS;
    el.rows = REAL_ROWS;
    await el.updateComplete;

    // "Engineering" and "Sales" — "Frontend"/"Backend" stay hidden until
    // "Engineering" is expanded.
    expect(el.shadowRoot.querySelectorAll(".data-grid__row")).to.have.lengthOf(
      2,
    );
  });

  it("expanding a group reveals its children, indented one level further", async () => {
    const el = /** @type {MdDataGridTree} */ (
      await fixture(html`<md-data-grid-tree></md-data-grid-tree>`)
    );
    el.getDataPath = (row) => /** @type {any} */ (row).path;
    el.columns = TREE_COLUMNS;
    el.rows = REAL_ROWS;
    await el.updateComplete;

    const rootToggle = await getToggleCell(el, 0);
    const button = rootToggle.shadowRoot.querySelector("md-icon-button");
    click(button);
    await el.updateComplete;

    expect(el.shadowRoot.querySelectorAll(".data-grid__row")).to.have.lengthOf(
      4,
    );
    const childToggle = await getToggleCell(el, 1);
    expect(childToggle.style.paddingInlineStart).to.contain("* 1");
    expect(rootToggle.style.paddingInlineStart).to.contain("* 0");
  });

  it("auto-generates a synthetic group row for a path segment with no row of its own", async () => {
    const el = /** @type {MdDataGridTree} */ (
      await fixture(html`<md-data-grid-tree></md-data-grid-tree>`)
    );
    el.getDataPath = (row) => /** @type {any} */ (row).path;
    el.columns = TREE_COLUMNS;
    el.rows = SYNTHETIC_GROUP_ROWS;
    await el.updateComplete;

    // "Fruit" and "Vegetable" — neither is a real row, both auto-generated.
    expect(el.shadowRoot.querySelectorAll(".data-grid__row")).to.have.lengthOf(
      2,
    );
    const fruitToggle = await getToggleCell(el, 0);
    expect(fruitToggle.shadowRoot.textContent).to.contain("Fruit");
    expect(fruitToggle.shadowRoot.querySelector("md-icon-button")).to.exist;
  });

  it("sortModel sorts within each group, never disturbing the hierarchy", async () => {
    const el = /** @type {MdDataGridTree} */ (
      await fixture(html`<md-data-grid-tree></md-data-grid-tree>`)
    );
    el.getDataPath = (row) => /** @type {any} */ (row).path;
    el.columns = [{ field: "qty", headerName: "Qty" }];
    el.rows = SYNTHETIC_GROUP_ROWS;
    el.sortModel = [{ field: "qty", sort: "asc" }];
    await el.updateComplete;

    const fruitId = el._tree.getNode("apple")?.parent?.key;
    el.treeDataExpandedGroupIds = new Set([fruitId]);
    await el.updateComplete;

    // Orange (qty 1) sorts before Apple (qty 2) within Fruit; Fruit
    // itself still comes before Vegetable (both compare equal — neither
    // has a qty — so insertion order wins at that level).
    const cells = [
      ...el.shadowRoot.querySelectorAll("md-data-grid-cell"),
    ].filter((c) => /** @type {any} */ (c).colIndex === 0);
    const order = cells.map(
      (c) => /** @type {any} */ (c).row.groupingKey ?? c.row.name,
    );
    expect(order).to.deep.equal(["Fruit", "Orange", "Apple", "Vegetable"]);
  });

  it("checking a group's checkbox cascades to select every descendant", async () => {
    const el = /** @type {MdDataGridTree} */ (
      await fixture(
        html`<md-data-grid-tree checkbox-selection></md-data-grid-tree>`,
      )
    );
    el.getDataPath = (row) => /** @type {any} */ (row).path;
    el.columns = TREE_COLUMNS;
    el.rows = REAL_ROWS;
    await el.updateComplete;

    const checkbox = await getRowCheckbox(el, 0); // "Engineering"
    click(checkbox);
    await el.updateComplete;

    expect([...el.rowSelectionModel].sort()).to.deep.equal(["be", "eng", "fe"]);
  });

  it("a group's checkbox shows indeterminate when only some descendants are selected", async () => {
    const el = /** @type {MdDataGridTree} */ (
      await fixture(
        html`<md-data-grid-tree checkbox-selection></md-data-grid-tree>`,
      )
    );
    el.getDataPath = (row) => /** @type {any} */ (row).path;
    el.columns = TREE_COLUMNS;
    el.rows = REAL_ROWS;
    el.rowSelectionModel = new Set(["fe"]);
    await el.updateComplete;

    const checkbox = await getRowCheckbox(el, 0); // "Engineering"
    expect(checkbox.indeterminate).to.be.true;
    expect(checkbox.checked).to.be.false;
  });

  it("checking every child individually (never the parent's own checkbox) still selects the parent, not just indeterminate", async () => {
    const el = /** @type {MdDataGridTree} */ (
      await fixture(
        html`<md-data-grid-tree checkbox-selection></md-data-grid-tree>`,
      )
    );
    el.getDataPath = (row) => /** @type {any} */ (row).path;
    el.columns = TREE_COLUMNS;
    el.rows = REAL_ROWS; // "Engineering" -> "Frontend"/"Backend" (leaves)
    await el.updateComplete;

    // Expand "Engineering" so its children are actually rendered — the
    // tree-toggle column is colIndex 1 here (checkbox column is 0).
    const rootToggle = await getToggleCell(el, 0, 1);
    click(rootToggle.shadowRoot.querySelector("md-icon-button"));
    await el.updateComplete;

    // Check "Frontend" and "Backend" individually — never Engineering's
    // own checkbox.
    click(await getRowCheckbox(el, 1)); // "Frontend"
    await el.updateComplete;
    click(await getRowCheckbox(el, 2)); // "Backend"
    await el.updateComplete;

    expect([...el.rowSelectionModel].sort()).to.deep.equal(["be", "eng", "fe"]);

    const engCheckbox = await getRowCheckbox(el, 0);
    expect(engCheckbox.checked).to.be.true;
    expect(engCheckbox.indeterminate).to.be.false;
  });

  it("unchecking one child after full selection drops the parent back out", async () => {
    const el = /** @type {MdDataGridTree} */ (
      await fixture(
        html`<md-data-grid-tree checkbox-selection></md-data-grid-tree>`,
      )
    );
    el.getDataPath = (row) => /** @type {any} */ (row).path;
    el.columns = TREE_COLUMNS;
    el.rows = REAL_ROWS;
    await el.updateComplete;

    const rootToggle = await getToggleCell(el, 0, 1);
    click(rootToggle.shadowRoot.querySelector("md-icon-button"));
    await el.updateComplete;

    click(await getRowCheckbox(el, 1)); // "Frontend"
    await el.updateComplete;
    click(await getRowCheckbox(el, 2)); // "Backend"
    await el.updateComplete;
    expect(el.rowSelectionModel.has("eng")).to.be.true;

    click(await getRowCheckbox(el, 1)); // uncheck "Frontend"
    await el.updateComplete;

    expect(el.rowSelectionModel.has("fe")).to.be.false;
    expect(el.rowSelectionModel.has("eng")).to.be.false;
    const engCheckbox = await getRowCheckbox(el, 0);
    expect(engCheckbox.indeterminate).to.be.true;
    expect(engCheckbox.checked).to.be.false;
  });

  it("checking a synthetic group's checkbox cascades to its descendants too", async () => {
    const el = /** @type {MdDataGridTree} */ (
      await fixture(
        html`<md-data-grid-tree checkbox-selection></md-data-grid-tree>`,
      )
    );
    el.getDataPath = (row) => /** @type {any} */ (row).path;
    el.columns = TREE_COLUMNS;
    el.rows = SYNTHETIC_GROUP_ROWS;
    await el.updateComplete;

    const checkbox = await getRowCheckbox(el, 0); // "Fruit" (synthetic)
    click(checkbox);
    await el.updateComplete;

    const fruitId = el._tree.getNode("apple")?.parent?.key;
    expect([...el.rowSelectionModel].sort()).to.deep.equal(
      [fruitId, "apple", "orange"].sort(),
    );
  });

  it("a plain click on a synthetic group's row selects it (identity via the tree node's own key, not getRowId)", async () => {
    const el = /** @type {MdDataGridTree} */ (
      await fixture(html`<md-data-grid-tree></md-data-grid-tree>`)
    );
    el.getDataPath = (row) => /** @type {any} */ (row).path;
    el.columns = TREE_COLUMNS;
    el.rows = SYNTHETIC_GROUP_ROWS;
    await el.updateComplete;

    const rows = el.shadowRoot.querySelectorAll(".data-grid__row");
    click(/** @type {HTMLElement} */ (rows[0])); // "Fruit"
    await el.updateComplete;

    const fruitId = el._tree.getNode("apple")?.parent?.key;
    expect([...el.rowSelectionModel]).to.deep.equal([fruitId]);
  });

  it("select-all spans the whole tree — real rows and synthetic groups alike, regardless of collapse state", async () => {
    const el = /** @type {MdDataGridTree} */ (
      await fixture(
        html`<md-data-grid-tree checkbox-selection></md-data-grid-tree>`,
      )
    );
    el.getDataPath = (row) => /** @type {any} */ (row).path;
    el.columns = TREE_COLUMNS;
    el.rows = SYNTHETIC_GROUP_ROWS;
    await el.updateComplete;

    const headerCell = /** @type {any} */ (
      el.shadowRoot.querySelectorAll("md-data-grid-header-cell")[0]
    );
    await headerCell.updateComplete;
    const checkboxHeader = headerCell.shadowRoot.querySelector(
      "md-data-grid-checkbox-header",
    );
    await checkboxHeader.updateComplete;
    const selectAll = checkboxHeader.shadowRoot.querySelector("md-checkbox");
    click(selectAll);
    await el.updateComplete;

    const fruitId = el._tree.getNode("apple")?.parent?.key;
    const vegId = el._tree.getNode("broccoli")?.parent?.key;
    expect([...el.rowSelectionModel].sort()).to.deep.equal(
      [fruitId, vegId, "apple", "orange", "broccoli"].sort(),
    );
  });

  it("pagination counts only currently-visible (collapse-aware) rows", async () => {
    const el = /** @type {MdDataGridTree} */ (
      await fixture(html`<md-data-grid-tree></md-data-grid-tree>`)
    );
    el.getDataPath = (row) => /** @type {any} */ (row).path;
    el.columns = TREE_COLUMNS;
    el.rows = REAL_ROWS; // 2 top-level rows while collapsed
    el.paginationModel = { page: 0, pageSize: 10 };
    await el.updateComplete;

    expect(el.shadowRoot.querySelectorAll(".data-grid__row")).to.have.lengthOf(
      2,
    );

    const rootToggle = await getToggleCell(el, 0);
    click(rootToggle.shadowRoot.querySelector("md-icon-button"));
    await el.updateComplete;

    expect(el.shadowRoot.querySelectorAll(".data-grid__row")).to.have.lengthOf(
      4,
    );
  });
});
