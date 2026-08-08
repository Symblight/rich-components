import { expect } from "@open-wc/testing";

import {
  DATA_GRID_ROOT_GROUP_ID,
  createEmptyIndexTree,
  TreeController,
} from "../controllers/data-grid-tree-controller.js";

/** @param {number} count */
function makeRows(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: `Row ${i}`,
  }));
}

/**
 * An `EventTarget`-backed host — `TreeController._apply()` (expand-state
 * mutation) calls `host.dispatchEvent()`, so every host needs to be a real
 * `EventTarget`, not a plain object, even in tests that never exercise
 * expand state themselves.
 * @param {Record<string, unknown>[]} rows
 * @param {Partial<import("../controllers/data-grid-tree-controller.js").TreeControllerHost>} [overrides]
 * @returns {import("../controllers/data-grid-tree-controller.js").TreeControllerHost}
 */
function makeHost(rows, overrides = {}) {
  return Object.assign(new EventTarget(), {
    rows,
    getRowId: (row) => /** @type {{ id: PropertyKey }} */ (row).id,
    getDataPath: undefined,
    treeDataExpandedGroupIds: new Set(),
    ...overrides,
  });
}

describe("createEmptyIndexTree", () => {
  it("starts with no children, no parent, and a null key", () => {
    const node = createEmptyIndexTree();
    expect(node.children.size).to.equal(0);
    expect(node.parent).to.equal(null);
    expect(node.key).to.equal(null);
  });

  it("iterates to just itself when it has no children", () => {
    const node = createEmptyIndexTree();
    expect([...node]).to.deep.equal([node]);
    expect(node.size).to.equal(1);
  });

  it("iterates itself before descending into children, pre-order", () => {
    const root = createEmptyIndexTree();
    const child = createEmptyIndexTree();
    child.key = "a";
    child.parent = root;
    root.children.set("a", child);

    expect([...root]).to.deep.equal([root, child]);
    expect(root.size).to.equal(2);
  });

  it("recurses into grandchildren", () => {
    const root = createEmptyIndexTree();
    const child = createEmptyIndexTree();
    child.key = "a";
    child.parent = root;
    root.children.set("a", child);

    const grandchild = createEmptyIndexTree();
    grandchild.key = "b";
    grandchild.parent = child;
    child.children.set("b", grandchild);

    expect([...root]).to.deep.equal([root, child, grandchild]);
    expect(root.size).to.equal(3);
  });
});

describe("TreeController — flat mode (getDataPath unset, existing behavior)", () => {
  it("builds a root keyed by DATA_GRID_ROOT_GROUP_ID", () => {
    const controller = new TreeController(makeHost([]));
    controller.build();
    expect(controller.tree.key).to.equal(DATA_GRID_ROOT_GROUP_ID);
  });

  it("puts every row directly under the root", () => {
    const rows = makeRows(3);
    const controller = new TreeController(makeHost(rows));
    const root = controller.build();

    expect(root.children.size).to.equal(3);
    expect([...root.children.keys()]).to.deep.equal([0, 1, 2]);
  });

  it("copies each row's own fields onto its node", () => {
    const rows = makeRows(2);
    const controller = new TreeController(makeHost(rows));
    controller.build();

    const node = controller.getNode(1);
    expect(node?.id).to.equal(1);
    expect(node?.name).to.equal("Row 1");
    expect(node?.key).to.equal(1);
    expect(node?.parent).to.equal(controller.tree);
  });

  it("stamps uniform depth/isDataRow fields, same shape as hierarchical mode", () => {
    const controller = new TreeController(makeHost(makeRows(1)));
    controller.build();

    const node = controller.getNode(0);
    expect(node?.depth).to.equal(0);
    expect(node?.isDataRow).to.be.true;
  });

  it("exposes a flat, root-free array of rows via the .rows getter", () => {
    const rows = makeRows(4);
    const controller = new TreeController(makeHost(rows));
    controller.build();

    expect(controller.rows.map((row) => row.id)).to.deep.equal([0, 1, 2, 3]);
    expect(controller.rows.every((row) => row.key !== DATA_GRID_ROOT_GROUP_ID))
      .to.be.true;
  });

  it("[...tree] on the root includes the root sentinel first", () => {
    const rows = makeRows(2);
    const controller = new TreeController(makeHost(rows));
    controller.build();

    const flat = [...controller.tree];
    expect(flat[0]).to.equal(controller.tree);
    expect(flat.length).to.equal(3);
  });

  it("defaults to building from host.rows when called with no argument", () => {
    const host = makeHost(makeRows(2));
    const controller = new TreeController(host);
    controller.build();

    expect(controller.rows.map((row) => row.id)).to.deep.equal([0, 1]);
  });

  it("replaces the previous tree entirely on rebuild", () => {
    const host = makeHost(makeRows(2));
    const controller = new TreeController(host);
    controller.build();
    const firstRoot = controller.tree;

    host.rows = makeRows(1);
    controller.build();

    expect(controller.tree).to.not.equal(firstRoot);
    expect(controller.rows.map((row) => row.id)).to.deep.equal([0]);
  });

  it("visibleRows() returns exactly what .rows returns — no node ever has children", () => {
    const rows = makeRows(3);
    const controller = new TreeController(makeHost(rows));
    controller.build();

    expect(controller.visibleRows(new Set())).to.deep.equal(controller.rows);
  });

  describe("getNode", () => {
    it("finds a direct child of the root by id", () => {
      const controller = new TreeController(makeHost(makeRows(3)));
      controller.build();

      const node = controller.getNode(1);
      expect(node?.id).to.equal(1);
    });

    it("returns undefined for an id that isn't in the tree", () => {
      const controller = new TreeController(makeHost(makeRows(3)));
      controller.build();

      expect(controller.getNode(99)).to.equal(undefined);
    });

    it("finds a node nested arbitrarily deep (via a hierarchical build)", () => {
      const rows = [{ id: "leaf", path: ["a", "b", "c"] }];
      const host = makeHost(rows, {
        getDataPath: (row) => /** @type {{ path: string[] }} */ (row).path,
      });
      const controller = new TreeController(host);
      controller.build();

      const leaf = controller.getNode("leaf");
      expect(leaf?.depth).to.equal(2);
      expect(leaf?.parent?.depth).to.equal(1);
      expect(leaf?.parent?.parent?.depth).to.equal(0);
      expect(leaf?.parent?.parent?.parent).to.equal(controller.tree);
    });
  });
});

describe("TreeController — hierarchical build (getDataPath set)", () => {
  it("auto-generates a synthetic group for a path segment with no row of its own", () => {
    const rows = [
      { id: "apple", path: ["Fruit", "Apple"] },
      { id: "orange", path: ["Fruit", "Orange"] },
    ];
    const host = makeHost(rows, {
      getDataPath: (row) => /** @type {{ path: string[] }} */ (row).path,
    });
    const controller = new TreeController(host);
    const root = controller.build();

    expect(root.children.size).to.equal(1);
    const fruit = [...root.children.values()][0];
    expect(fruit.isDataRow).to.be.false;
    expect(fruit.children.size).to.equal(2);
    expect(fruit.groupingKey).to.equal("Fruit");

    const apple = controller.getNode("apple");
    expect(apple?.isDataRow).to.be.true;
    expect(apple?.parent).to.equal(fruit);
    expect(apple?.depth).to.equal(1);
  });

  it("is order-independent — a child before its parent in `rows` produces the same tree", () => {
    const childFirst = [
      { id: "apple", path: ["Fruit", "Apple"] },
      { id: "fruit", path: ["Fruit"] },
    ];
    const parentFirst = [
      { id: "fruit", path: ["Fruit"] },
      { id: "apple", path: ["Fruit", "Apple"] },
    ];
    const getDataPath = (row) => /** @type {{ path: string[] }} */ (row).path;

    const a = new TreeController(makeHost(childFirst, { getDataPath }));
    a.build();
    const b = new TreeController(makeHost(parentFirst, { getDataPath }));
    b.build();

    for (const controller of [a, b]) {
      const fruit = controller.getNode("fruit");
      expect(fruit?.isDataRow).to.be.true;
      expect(fruit?.children.size).to.equal(1);
      const apple = controller.getNode("apple");
      expect(apple?.parent).to.equal(fruit);
    }
  });

  it("upgrades a synthetic placeholder to a real row without losing already-attached children", () => {
    // Apple processed first creates a synthetic "Fruit" placeholder; the
    // real "Fruit" row arrives second and must claim that exact node.
    const rows = [
      { id: "apple", path: ["Fruit", "Apple"] },
      { id: "fruit", path: ["Fruit"], label: "All fruit" },
    ];
    const host = makeHost(rows, {
      getDataPath: (row) => /** @type {{ path: string[] }} */ (row).path,
    });
    const controller = new TreeController(host);
    controller.build();

    const fruit = controller.getNode("fruit");
    expect(fruit?.isDataRow).to.be.true;
    expect(fruit?.label).to.equal("All fruit");
    expect(fruit?.children.size).to.equal(1);

    const apple = controller.getNode("apple");
    expect(apple?.parent).to.equal(fruit);
  });

  it("a real row can simultaneously be a leaf's ancestor — isDataRow and children coexist", () => {
    const rows = [
      { id: "eng", path: ["Engineering"], name: "Engineering" },
      { id: "fe", path: ["Engineering", "Frontend"], name: "Frontend" },
    ];
    const host = makeHost(rows, {
      getDataPath: (row) => /** @type {{ path: string[] }} */ (row).path,
    });
    const controller = new TreeController(host);
    controller.build();

    const eng = controller.getNode("eng");
    expect(eng?.isDataRow).to.be.true;
    expect(eng?.name).to.equal("Engineering");
    expect(eng?.children.size).to.equal(1);
  });

  it("warns and excludes a row whose getDataPath() returns an empty path", () => {
    const rows = [{ id: 1, path: [] }];
    const host = makeHost(rows, {
      getDataPath: (row) => /** @type {{ path: string[] }} */ (row).path,
    });
    const controller = new TreeController(host);
    const root = controller.build();

    expect(root.children.size).to.equal(0);
    expect(controller.getNode(1)).to.equal(undefined);
  });

  it("warns and skips a later row that resolves to an already-real path", () => {
    const rows = [
      { id: "first", path: ["Fruit"] },
      { id: "second", path: ["Fruit"] },
    ];
    const host = makeHost(rows, {
      getDataPath: (row) => /** @type {{ path: string[] }} */ (row).path,
    });
    const controller = new TreeController(host);
    controller.build();

    expect(controller.getNode("first")).to.not.equal(undefined);
    expect(controller.getNode("second")).to.equal(undefined);
  });

  it("synthetic group ids are deterministic across rebuilds regardless of row order", () => {
    const getDataPath = (row) => /** @type {{ path: string[] }} */ (row).path;
    const host = makeHost(
      [
        { id: "apple", path: ["Fruit", "Apple"] },
        { id: "orange", path: ["Fruit", "Orange"] },
      ],
      { getDataPath },
    );
    const controller = new TreeController(host);
    controller.build();
    const firstFruitId = controller.getNode("apple")?.parent?.key;

    host.rows = [
      { id: "orange", path: ["Fruit", "Orange"] },
      { id: "apple", path: ["Fruit", "Apple"] },
    ];
    controller.build();
    const secondFruitId = controller.getNode("apple")?.parent?.key;

    expect(firstFruitId).to.equal(secondFruitId);
  });
});

describe("TreeController.visibleRows / sortedVisibleRows", () => {
  /** @returns {{ host: import("../controllers/data-grid-tree-controller.js").TreeControllerHost, controller: TreeController }} */
  function buildFruitTree() {
    const rows = [
      { id: "apple", path: ["Fruit", "Apple"], qty: 2 },
      { id: "orange", path: ["Fruit", "Orange"], qty: 1 },
      { id: "broccoli", path: ["Vegetable", "Broccoli"], qty: 3 },
    ];
    const host = makeHost(rows, {
      getDataPath: (row) => /** @type {{ path: string[] }} */ (row).path,
    });
    const controller = new TreeController(host);
    controller.build();
    return { host, controller };
  }

  it("includes only top-level groups when nothing is expanded", () => {
    const { controller } = buildFruitTree();
    const visible = controller.visibleRows(new Set());

    expect(visible.map((node) => node.groupingKey)).to.deep.equal([
      "Fruit",
      "Vegetable",
    ]);
  });

  it("descends into an expanded group's children only", () => {
    const { controller } = buildFruitTree();
    const fruitId = controller.getNode("apple")?.parent?.key;
    const visible = controller.visibleRows(new Set([fruitId]));

    expect(visible.map((node) => node.key)).to.deep.equal([
      fruitId,
      "apple",
      "orange",
      controller.getNode("broccoli")?.parent?.key,
    ]);
  });

  it("sortedVisibleRows() sorts each group's children independently, hierarchy preserved", () => {
    const { controller } = buildFruitTree();
    const fruitId = controller.getNode("apple")?.parent?.key;
    const vegId = controller.getNode("broccoli")?.parent?.key;
    const compareByQty = (a, b) =>
      /** @type {number} */ (a.qty ?? 0) - /** @type {number} */ (b.qty ?? 0);

    const visible = controller.sortedVisibleRows(
      compareByQty,
      new Set([fruitId, vegId]),
    );

    // Orange (qty 1) sorts before Apple (qty 2) within Fruit; group order
    // itself (Fruit before Vegetable) is untouched since both groups are
    // synthetic (no qty), comparing equal and falling back to insertion order.
    expect(visible.map((node) => node.key)).to.deep.equal([
      fruitId,
      "orange",
      "apple",
      vegId,
      "broccoli",
    ]);
  });

  it("sortedVisibleRows() with a null comparator behaves like visibleRows()", () => {
    const { controller } = buildFruitTree();
    const fruitId = controller.getNode("apple")?.parent?.key;

    const sorted = controller.sortedVisibleRows(null, new Set([fruitId]));
    const plain = controller.visibleRows(new Set([fruitId]));

    expect(sorted).to.deep.equal(plain);
  });
});

describe("TreeController cascade selection", () => {
  function buildFruitTree() {
    const rows = [
      { id: "apple", path: ["Fruit", "Apple"] },
      { id: "orange", path: ["Fruit", "Orange"] },
    ];
    const host = makeHost(rows, {
      getDataPath: (row) => /** @type {{ path: string[] }} */ (row).path,
    });
    const controller = new TreeController(host);
    controller.build();
    return controller;
  }

  it("getDescendantIds() includes self plus every descendant, pre-order", () => {
    const controller = buildFruitTree();
    const fruitId = controller.getNode("apple")?.parent?.key;

    expect(controller.getDescendantIds(fruitId)).to.deep.equal([
      fruitId,
      "apple",
      "orange",
    ]);
  });

  it("getDescendantIds() can exclude self", () => {
    const controller = buildFruitTree();
    const fruitId = controller.getNode("apple")?.parent?.key;

    expect(
      controller.getDescendantIds(fruitId, { includeSelf: false }),
    ).to.deep.equal(["apple", "orange"]);
  });

  it("getDescendantIds() returns an empty array for an unknown key", () => {
    const controller = buildFruitTree();
    expect(controller.getDescendantIds("nope")).to.deep.equal([]);
  });

  it("getCheckboxState() is unchecked when nothing in the subtree is selected", () => {
    const controller = buildFruitTree();
    const fruitId = controller.getNode("apple")?.parent?.key;

    expect(controller.getCheckboxState(fruitId, new Set())).to.deep.equal({
      checked: false,
      indeterminate: false,
    });
  });

  it("getCheckboxState() is indeterminate when only some descendants are selected", () => {
    const controller = buildFruitTree();
    const fruitId = controller.getNode("apple")?.parent?.key;

    expect(
      controller.getCheckboxState(fruitId, new Set(["apple"])),
    ).to.deep.equal({ checked: false, indeterminate: true });
  });

  it("getCheckboxState() is checked when the group and every descendant are selected", () => {
    const controller = buildFruitTree();
    const fruitId = controller.getNode("apple")?.parent?.key;

    expect(
      controller.getCheckboxState(
        fruitId,
        new Set([fruitId, "apple", "orange"]),
      ),
    ).to.deep.equal({ checked: true, indeterminate: false });
  });

  describe("computeCascadingSelection() — upward propagation", () => {
    /**
     * Three levels: Engineering -> Frontend/Backend -> individual members.
     * Frontend/Backend are real rows (also ancestors); Engineering is too.
     */
    function buildOrgTree() {
      const rows = [
        { id: "eng", path: ["Engineering"] },
        { id: "fe", path: ["Engineering", "Frontend"] },
        { id: "ada", path: ["Engineering", "Frontend", "Ada"] },
        { id: "grace", path: ["Engineering", "Frontend", "Grace"] },
        { id: "be", path: ["Engineering", "Backend"] },
        { id: "alan", path: ["Engineering", "Backend", "Alan"] },
      ];
      const host = makeHost(rows, {
        getDataPath: (row) => /** @type {{ path: string[] }} */ (row).path,
      });
      const controller = new TreeController(host);
      controller.build();
      return controller;
    }

    it("selecting a lone child leaves its parent unselected (still partial)", () => {
      const controller = buildOrgTree();

      const next = controller.computeCascadingSelection("ada", new Set());

      expect(next.has("ada")).to.be.true;
      expect(next.has("fe")).to.be.false;
      expect(next.has("eng")).to.be.false;
    });

    it("reproduces the reported bug's fix: selecting every child one at a time adds the parent", () => {
      const controller = buildOrgTree();

      // Simulate two separate clicks, each on one child's own checkbox —
      // never the parent's checkbox — same as the UI reported the bug
      // against.
      let selection = controller.computeCascadingSelection("ada", new Set());
      selection = controller.computeCascadingSelection("grace", selection);

      // Both of Frontend's children are now selected -> Frontend itself
      // should be selected too, not stuck indeterminate.
      expect(selection.has("ada")).to.be.true;
      expect(selection.has("grace")).to.be.true;
      expect(selection.has("fe")).to.be.true;

      const state = controller.getCheckboxState("fe", selection);
      expect(state).to.deep.equal({ checked: true, indeterminate: false });
    });

    it("propagates through multiple levels once every leaf under the root group is selected", () => {
      const controller = buildOrgTree();

      let selection = new Set();
      for (const id of ["ada", "grace", "alan"]) {
        selection = controller.computeCascadingSelection(id, selection);
      }

      // Frontend (ada+grace) and Backend (alan) are both fully selected ->
      // Engineering itself should be selected too.
      expect(selection.has("fe")).to.be.true;
      expect(selection.has("be")).to.be.true;
      expect(selection.has("eng")).to.be.true;
      expect(controller.getCheckboxState("eng", selection)).to.deep.equal({
        checked: true,
        indeterminate: false,
      });
    });

    it("deselecting one child removes the parent (and propagates further up) again", () => {
      const controller = buildOrgTree();

      let selection = new Set();
      for (const id of ["ada", "grace", "alan"]) {
        selection = controller.computeCascadingSelection(id, selection);
      }
      expect(selection.has("eng")).to.be.true; // fully selected, per above

      // Deselect just "ada" — Frontend can no longer be fully selected.
      selection = controller.computeCascadingSelection("ada", selection);

      expect(selection.has("ada")).to.be.false;
      expect(selection.has("fe")).to.be.false;
      expect(selection.has("eng")).to.be.false; // Backend alone isn't everything
      expect(selection.has("be")).to.be.true; // untouched, still fully selected
      expect(controller.getCheckboxState("eng", selection)).to.deep.equal({
        checked: false,
        indeterminate: true,
      });
    });

    it("clicking an indeterminate group's own checkbox selects its whole subtree", () => {
      const controller = buildOrgTree();
      const partial = new Set(["ada"]); // Frontend indeterminate

      const next = controller.computeCascadingSelection("fe", partial);

      expect(next.has("fe")).to.be.true;
      expect(next.has("ada")).to.be.true;
      expect(next.has("grace")).to.be.true;
    });

    it("is pure — never mutates the rowSelectionModel argument", () => {
      const controller = buildOrgTree();
      const original = new Set(["ada"]);
      const originalCopy = new Set(original);

      controller.computeCascadingSelection("grace", original);

      expect(original).to.deep.equal(originalCopy);
    });
  });
});

describe("TreeController expand state", () => {
  it("isExpanded()/toggleExpanded() mutate host.treeDataExpandedGroupIds and dispatch an event", () => {
    const host = makeHost([]);
    const controller = new TreeController(host);
    let eventDetail;
    host.addEventListener(
      "md-data-grid-tree-data-expanded-group-ids-change",
      (e) => {
        eventDetail = /** @type {CustomEvent} */ (e).detail;
      },
    );

    expect(controller.isExpanded("a")).to.be.false;
    controller.toggleExpanded("a");
    expect(controller.isExpanded("a")).to.be.true;
    expect(host.treeDataExpandedGroupIds.has("a")).to.be.true;
    expect(eventDetail.has("a")).to.be.true;

    controller.toggleExpanded("a");
    expect(controller.isExpanded("a")).to.be.false;
  });

  it("setExpanded() replaces the expanded set wholesale", () => {
    const host = makeHost([], { treeDataExpandedGroupIds: new Set(["a"]) });
    const controller = new TreeController(host);

    controller.setExpanded(new Set(["b", "c"]));

    expect(host.treeDataExpandedGroupIds).to.deep.equal(new Set(["b", "c"]));
  });
});
