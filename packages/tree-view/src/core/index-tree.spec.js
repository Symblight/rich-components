import { expect } from "@open-wc/testing";
import {
  createEmptyIndexTree,
  insertIndexTree,
  removeIndexTree,
  findIndexTree,
  buildIndexTree,
  visibleIndexNodes,
} from "./index-tree.js";

describe("createEmptyIndexTree", () => {
  it("starts with no children and size 1 (itself)", () => {
    const root = createEmptyIndexTree();
    expect(root.children.size).to.equal(0);
    expect(root.parent).to.equal(null);
    expect(root.key).to.equal(null);
    expect(root.size).to.equal(1);
  });

  it("iterates itself, then every descendant, pre-order", () => {
    const root = createEmptyIndexTree();
    const a = insertIndexTree(root, "a", "A");
    insertIndexTree(a, "a1", "A1");
    const b = insertIndexTree(root, "b", "B");
    insertIndexTree(b, "b1", "B1");

    const keys = [];
    for (const node of root) keys.push(node.key);
    expect(keys).to.deep.equal([null, "a", "a1", "b", "b1"]);
    expect(root.size).to.equal(5);
  });
});

describe("insertIndexTree / removeIndexTree", () => {
  it("sets parent/key/value and registers in parent.children", () => {
    const root = createEmptyIndexTree();
    const node = insertIndexTree(root, "x", { label: "X" });
    expect(node.parent).to.equal(root);
    expect(node.key).to.equal("x");
    expect(node.value).to.deep.equal({ label: "X" });
    expect(root.children.get("x")).to.equal(node);
  });

  it("detaches from its parent and clears its own parent reference", () => {
    const root = createEmptyIndexTree();
    const node = insertIndexTree(root, "x", "X");
    removeIndexTree(node);
    expect(root.children.has("x")).to.equal(false);
    expect(node.parent).to.equal(null);
  });
});

describe("findIndexTree", () => {
  it("finds a node anywhere in the subtree by key", () => {
    const root = createEmptyIndexTree();
    const a = insertIndexTree(root, "a", "A");
    const a1 = insertIndexTree(a, "a1", "A1");
    expect(findIndexTree(root, "a1")).to.equal(a1);
  });

  it("returns null when the key isn't present", () => {
    const root = createEmptyIndexTree();
    insertIndexTree(root, "a", "A");
    expect(findIndexTree(root, "missing")).to.equal(null);
  });
});

describe("buildIndexTree", () => {
  it("recursively converts a `.items`-shaped array, keyed by the given getKey", () => {
    const items = [
      { id: "src", label: "src/", children: [{ id: "index", label: "index.js" }] },
      { id: "readme", label: "README.md" },
    ];
    const root = buildIndexTree(items, { getKey: (item) => item.id });

    expect([...root.children.keys()]).to.deep.equal(["src", "readme"]);
    const src = root.children.get("src");
    if (!src) throw new Error("expected a 'src' node");
    expect(src.value).to.equal(items[0]);
    expect([...src.children.keys()]).to.deep.equal(["index"]);
  });

  it("tolerates items with no children at all", () => {
    const root = buildIndexTree([{ id: "leaf" }], { getKey: (item) => item.id });
    const leaf = root.children.get("leaf");
    if (!leaf) throw new Error("expected a 'leaf' node");
    expect(leaf.children.size).to.equal(0);
  });
});

describe("visibleIndexNodes", () => {
  it("stops descending into a collapsed node's children", () => {
    const root = buildIndexTree(
      [
        {
          id: "src",
          children: [{ id: "components", children: [{ id: "button" }] }, { id: "index" }],
        },
        { id: "readme" },
      ],
      { getKey: (item) => item.id },
    );

    /** @type {Set<PropertyKey>} */
    const expanded = new Set(["src"]); // "components" is not expanded
    const visible = [
      ...visibleIndexNodes(root, (node) => node.key !== null && expanded.has(node.key)),
    ];

    expect(visible.map((node) => node.key)).to.deep.equal(["src", "components", "index", "readme"]);
  });

  it("reveals a nested node's own children once it's expanded too", () => {
    const root = buildIndexTree(
      [{ id: "src", children: [{ id: "components", children: [{ id: "button" }] }] }],
      { getKey: (item) => item.id },
    );

    /** @type {Set<PropertyKey>} */
    const expanded = new Set(["src", "components"]);
    const visible = [
      ...visibleIndexNodes(root, (node) => node.key !== null && expanded.has(node.key)),
    ];

    expect(visible.map((node) => node.key)).to.deep.equal(["src", "components", "button"]);
  });
});
