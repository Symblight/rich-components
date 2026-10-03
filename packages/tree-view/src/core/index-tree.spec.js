import { expect } from "@open-wc/testing";
import {
  createEmptyIndexTree,
  insertIndexTree,
  removeIndexTree,
  findIndexTree,
  walkIndexTree,
  isAncestorIndexTree,
  positionIndexTree,
  moveIndexTree,
  setIndexTreeChildren,
  buildIndexTree,
} from "./index-tree.js";

/** @typedef {{ id: string, children?: Item[] }} Item */

const options = { getKey: (/** @type {Item} */ item) => item.id };

/** @param {import("./index-tree.js").IndexTree<any> | null | undefined} node */
const childKeys = (node) => node?.children?.map((child) => child.key) ?? null;

/** @param {import("./index-tree.js").IndexTree<any>} node */
const walkKeys = (node) => [...walkIndexTree(node)].map((n) => n.key);

/** @param {import("./index-tree.js").IndexTree<any>} tree @param {PropertyKey} key */
const find = (tree, key) => {
  const node = findIndexTree(tree, key);
  if (!node) throw new Error(`expected a '${String(key)}' node`);
  return node;
};

/** src/{components/{button}, index}, readme */
const sample = () =>
  buildIndexTree(
    /** @type {Item[]} */ ([
      {
        id: "src",
        children: [{ id: "components", children: [{ id: "button" }] }, { id: "index" }],
      },
      { id: "readme" },
    ]),
    options,
  );

describe("createEmptyIndexTree", () => {
  it("is a synthetic root with no children and an empty index", () => {
    const root = createEmptyIndexTree();
    expect(root.key).to.equal(null);
    expect(root.parent).to.equal(null);
    expect(root.children).to.deep.equal([]);
    expect(root.byKey.size).to.equal(0);
  });
});

describe("insertIndexTree", () => {
  it("sets parent/key/value, appends, and indexes the node", () => {
    const root = createEmptyIndexTree();
    const node = insertIndexTree(root, "x", { label: "X" });
    expect(node.parent).to.equal(root);
    expect(node.key).to.equal("x");
    expect(node.value).to.deep.equal({ label: "X" });
    expect(node.children).to.equal(null);
    expect(node.byKey).to.equal(root.byKey);
    expect(findIndexTree(root, "x")).to.equal(node);
  });

  it("inserts at an index", () => {
    const root = createEmptyIndexTree();
    insertIndexTree(root, "a", "A");
    insertIndexTree(root, "c", "C");
    insertIndexTree(root, "b", "B", 1);
    expect(childKeys(root)).to.deep.equal(["a", "b", "c"]);
  });

  it("turns an unloaded parent into a loaded one", () => {
    const root = createEmptyIndexTree();
    const parent = insertIndexTree(root, "p", "P");
    insertIndexTree(parent, "c", "C");
    expect(childKeys(parent)).to.deep.equal(["c"]);
  });

  it("replaces an existing node with the same key, wherever it is", () => {
    const root = sample();
    const replacement = insertIndexTree(root, "button", { id: "button" });
    expect(childKeys(find(root, "components"))).to.deep.equal([]);
    expect(childKeys(root)).to.deep.equal(["src", "readme", "button"]);
    expect(findIndexTree(root, "button")).to.equal(replacement);
  });
});

describe("removeIndexTree", () => {
  it("detaches the node and drops its whole subtree from the index", () => {
    const root = sample();
    const components = find(root, "components");
    removeIndexTree(components);
    expect(childKeys(find(root, "src"))).to.deep.equal(["index"]);
    expect(components.parent).to.equal(null);
    expect(findIndexTree(root, "components")).to.equal(null);
    expect(findIndexTree(root, "button")).to.equal(null);
    expect(findIndexTree(root, "index")).to.not.equal(null);
  });
});

describe("findIndexTree", () => {
  it("finds a node anywhere in the tree, from any node", () => {
    const root = sample();
    const button = find(root, "button");
    expect(findIndexTree(find(root, "readme"), "button")).to.equal(button);
  });

  it("returns null when the key isn't present", () => {
    expect(findIndexTree(sample(), "missing")).to.equal(null);
  });
});

describe("walkIndexTree", () => {
  it("yields the node, then every loaded descendant, pre-order", () => {
    expect(walkKeys(sample())).to.deep.equal([
      null,
      "src",
      "components",
      "button",
      "index",
      "readme",
    ]);
  });

  it("skips unloaded children", () => {
    const root = sample();
    setIndexTreeChildren(find(root, "components"), null, options);
    expect(walkKeys(find(root, "src"))).to.deep.equal(["src", "components", "index"]);
  });
});

describe("isAncestorIndexTree / positionIndexTree", () => {
  it("tells ancestors apart from the node itself and from siblings", () => {
    const root = sample();
    const src = find(root, "src");
    const button = find(root, "button");
    expect(isAncestorIndexTree(src, button)).to.equal(true);
    expect(isAncestorIndexTree(root, button)).to.equal(true);
    expect(isAncestorIndexTree(button, button)).to.equal(false);
    expect(isAncestorIndexTree(find(root, "readme"), button)).to.equal(false);
  });

  it("returns the parent and the index among its siblings", () => {
    const root = sample();
    const { parent, index } = positionIndexTree(find(root, "index"));
    expect(parent).to.equal(find(root, "src"));
    expect(index).to.equal(1);
    expect(positionIndexTree(root)).to.deep.equal({ parent: null, index: -1 });
  });
});

describe("moveIndexTree", () => {
  it("moves within the same parent, index counted without the node", () => {
    const root = sample();
    expect(moveIndexTree(find(root, "src"), root, 1)).to.equal(true);
    expect(childKeys(root)).to.deep.equal(["readme", "src"]);
  });

  it("moves under another parent, keeping its subtree and the index", () => {
    const root = sample();
    const components = find(root, "components");
    expect(moveIndexTree(components, root, 0)).to.equal(true);
    expect(childKeys(root)).to.deep.equal(["components", "src", "readme"]);
    expect(childKeys(find(root, "src"))).to.deep.equal(["index"]);
    expect(components.parent).to.equal(root);
    expect(find(root, "button").parent).to.equal(components);
  });

  it("moves into an unloaded node", () => {
    const root = sample();
    const readme = find(root, "readme");
    expect(moveIndexTree(find(root, "index"), readme, 0)).to.equal(true);
    expect(childKeys(readme)).to.deep.equal(["index"]);
  });

  it("refuses to move a node into itself or its own subtree", () => {
    const root = sample();
    const src = find(root, "src");
    expect(moveIndexTree(src, src, 0)).to.equal(false);
    expect(moveIndexTree(src, find(root, "button"), 0)).to.equal(false);
    expect(childKeys(root)).to.deep.equal(["src", "readme"]);
  });
});

describe("setIndexTreeChildren", () => {
  it("replaces the children and re-indexes both old and new subtrees", () => {
    const root = sample();
    const src = find(root, "src");
    setIndexTreeChildren(src, [{ id: "lib", children: [{ id: "util" }] }], options);
    expect(childKeys(src)).to.deep.equal(["lib"]);
    expect(findIndexTree(root, "button")).to.equal(null);
    expect(findIndexTree(root, "index")).to.equal(null);
    expect(find(root, "util").parent).to.equal(find(root, "lib"));
  });

  it("marks the children unloaded with null, and loaded-but-empty with []", () => {
    const root = sample();
    const src = find(root, "src");
    setIndexTreeChildren(src, null, options);
    expect(src.children).to.equal(null);
    expect(findIndexTree(root, "components")).to.equal(null);
    setIndexTreeChildren(src, [], options);
    expect(src.children).to.deep.equal([]);
  });
});

describe("buildIndexTree", () => {
  it("recursively converts a `.items`-shaped array, keyed by getKey", () => {
    const items = [{ id: "src", children: [{ id: "index" }] }, { id: "readme" }];
    const root = buildIndexTree(items, options);
    expect(childKeys(root)).to.deep.equal(["src", "readme"]);
    expect(find(root, "src").value).to.equal(items[0]);
    expect(childKeys(find(root, "src"))).to.deep.equal(["index"]);
  });

  it("gives items without children, or with an empty array, children: null", () => {
    const root = buildIndexTree([{ id: "leaf" }, { id: "empty", children: [] }], options);
    expect(find(root, "leaf").children).to.equal(null);
    expect(find(root, "empty").children).to.equal(null);
  });

  it("reads children through getChildren when given", () => {
    const root = buildIndexTree([{ id: "a", nested: [{ id: "b" }] }], {
      getKey: (item) => item.id,
      getChildren: (item) => /** @type {any} */ (item).nested,
    });
    expect(find(root, "b").parent).to.equal(find(root, "a"));
  });
});
