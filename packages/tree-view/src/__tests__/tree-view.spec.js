import { expect, fixture, html, aTimeout } from "@open-wc/testing";

import "../index.js";

/** @import { TvxTreeView } from "../base/tree-view.js" */
/** @import { TvxTreeItem } from "../components/tree-item/tree-item.js" */

/** Builds a fresh `<tvx-tree-item>` subtree from a plain description; each fixture needs its own instances.
 * @param {{ id: string, label: string, children?: object[], hasChildren?: boolean, childCount?: number }} data
 * @returns {TvxTreeItem} */
function buildItem({ id, label, children = [], hasChildren, childCount }) {
  const item = /** @type {TvxTreeItem} */ (document.createElement("tvx-tree-item"));
  item.key = id;
  item.label = label;
  if (hasChildren) item.hasChildren = true;
  if (typeof childCount === "number") item.childCount = childCount;
  // A branch's children live in their own `<tvx-item-sub-tree>` sibling, not straight in the
  // item's own default slot (see the spec's "Data model") — no `slot="..."` needed, it auto-slots.
  if (children.length > 0) {
    const subTree = document.createElement("tvx-item-sub-tree");
    subTree.append(...children.map(buildItem));
    item.append(subTree);
  }
  return item;
}

function buildSampleItems() {
  return [
    buildItem({
      id: "src",
      label: "src/",
      children: [{ id: "index", label: "index.js" }],
    }),
    buildItem({ id: "readme", label: "README.md" }),
  ];
}

function buildTwoChildItems() {
  return [
    buildItem({
      id: "src",
      label: "src/",
      children: [
        { id: "index", label: "index.js" },
        { id: "utils", label: "utils.js" },
      ],
    }),
  ];
}

function buildTwoParentsWithChildren() {
  return [
    buildItem({
      id: "a",
      label: "a/",
      children: [
        { id: "a1", label: "a1.js" },
        { id: "a2", label: "a2.js" },
      ],
    }),
    buildItem({
      id: "b",
      label: "b/",
      children: [{ id: "b1", label: "b1.js" }],
    }),
  ];
}

/**
 * `ReorderController` defers the actual DOM move from a drag-triggered drop to the next animation
 * frame (see its own comment on `handleDrop()` for why) — tests asserting on the post-move DOM
 * need to wait one frame past the internal `tvx-tree-item-reorder-drop` dispatch before checking.
 */
function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

/**
 * @param {TvxTreeItem[]} items
 * @returns {Promise<TvxTreeView>}
 */
async function treeFixture(items) {
  const el = /** @type {TvxTreeView} */ (await fixture(html`<tvx-tree-view></tvx-tree-view>`));
  el.items = items;
  await el.updateComplete;
  return el;
}

describe("tvx-tree-view — .items rendering", () => {
  it("sets role=tree and renders a tvx-tree-item per item, recursively nested", async () => {
    const el = await treeFixture(buildSampleItems());
    expect(el.getAttribute("role")).to.equal("tree");
    // pre-order DFS: "src" is visited, then its own subtree, before "readme"
    expect([...el.allItems()].map((item) => item.key)).to.deep.equal(["src", "index", "readme"]);
    const src = el.getItemByKey("src");
    const index = el.getItemByKey("index");
    // `index`'s direct parent is `src`'s `<tvx-item-sub-tree>`, not `src` itself — see the spec's
    // "Data model".
    expect(index.parentElement.parentElement).to.equal(src);
  });

  it("collapsed children are excluded from visibleItems() until expanded", async () => {
    const el = await treeFixture(buildSampleItems());
    expect([...el.visibleItems()].map((item) => item.key)).to.deep.equal(["src", "readme"]);
    el.setItemExpansion({ id: "src", expand: true });
    await el.updateComplete;
    expect([...el.visibleItems()].map((item) => item.key)).to.deep.equal([
      "src",
      "index",
      "readme",
    ]);
  });

  it("is equivalent to declaring the same elements as markup", async () => {
    const el = /** @type {TvxTreeView} */ (
      await fixture(html`
        <tvx-tree-view>
          <tvx-tree-item key="src" label="src/">
            <tvx-item-sub-tree>
              <tvx-tree-item key="index" label="index.js"></tvx-tree-item>
            </tvx-item-sub-tree>
          </tvx-tree-item>
          <tvx-tree-item key="readme" label="README.md"></tvx-tree-item>
        </tvx-tree-view>
      `)
    );
    await el.updateComplete;
    expect([...el.allItems()].map((item) => item.key)).to.deep.equal(["src", "index", "readme"]);
  });
});

describe("tvx-tree-view — expansion", () => {
  it("toggling the chevron fires tvx-expand-change with the new state", async () => {
    const el = await treeFixture(buildSampleItems());
    const src = el.getItemByKey("src");
    await src.updateComplete;
    let detail;
    el.addEventListener("tvx-expand-change", (event) => (detail = event.detail));
    src.shadowRoot.querySelector(".tree-item__chevron").click();
    await el.updateComplete;
    expect(src.expanded).to.equal(true);
    expect(detail).to.deep.equal({ key: "src", expanded: true });
  });

  it("expandAll/collapseAll toggle every branch", async () => {
    const el = await treeFixture(buildSampleItems());
    el.expandAll();
    await el.updateComplete;
    expect(el.getItemByKey("src").expanded).to.equal(true);
    el.collapseAll();
    await el.updateComplete;
    expect(el.getItemByKey("src").expanded).to.equal(false);
  });
});

describe("tvx-tree-view — defaultExpandedItems/defaultSelectedItems", () => {
  it("applies both once the root items exist, when items are assigned before connecting", async () => {
    const el = /** @type {TvxTreeView} */ (document.createElement("tvx-tree-view"));
    el.defaultExpandedItems = new Set(["src"]);
    el.defaultSelectedItems = new Set(["readme"]);
    el.items = buildSampleItems();
    document.body.append(el);
    await el.updateComplete;
    expect(el.getItemByKey("src").expanded).to.equal(true);
    expect(el.getItemByKey("readme").selected).to.equal(true);
    el.remove();
  });

  it("applies both once the root items exist, when items are assigned after connecting", async () => {
    // Matches `treeFixture()`'s own sequencing — connect first, assign `.items` after — the
    // ordering that motivated deferring rather than consuming the one shot in `firstUpdated()`.
    const el = await treeFixture([]);
    el.defaultExpandedItems = new Set(["src"]);
    el.defaultSelectedItems = new Set(["readme"]);
    el.items = buildSampleItems();
    await el.updateComplete;
    expect(el.getItemByKey("src").expanded).to.equal(true);
    expect(el.getItemByKey("readme").selected).to.equal(true);
  });

  it("only applies once — setting defaultExpandedItems after the tree already has items is too late", async () => {
    // treeFixture()'s own `.items` assignment already trips the one-shot (with no defaults set at
    // that point), so this later assignment — and the items replacement after it — has no effect.
    const el = await treeFixture(buildSampleItems());
    el.defaultExpandedItems = new Set(["src"]);
    el.items = buildTwoChildItems();
    await el.updateComplete;
    expect(el.getItemByKey("src").expanded).to.equal(false);
  });
});

describe("tvx-tree-view — single selection (default)", () => {
  it("clicking a row selects it, sets aria-current, and fires tvx-selection-change", async () => {
    const el = await treeFixture(buildSampleItems());
    const readme = el.getItemByKey("readme");
    await readme.updateComplete;
    let detail;
    el.addEventListener("tvx-selection-change", (event) => (detail = event.detail));
    readme.shadowRoot.querySelector(".tree-item__row").click();
    await el.updateComplete;
    expect(readme.selected).to.equal(true);
    expect(readme.getAttribute("aria-current")).to.equal("true");
    expect(detail.selectedItems).to.deep.equal(new Set(["readme"]));
  });

  it("selecting a nested node does not select its ancestors in single-select mode", async () => {
    const el = await treeFixture(buildSampleItems());
    el.setItemExpansion({ id: "src", expand: true });
    await el.updateComplete;
    const src = el.getItemByKey("src");
    const index = el.getItemByKey("index");
    await index.updateComplete;
    index.shadowRoot.querySelector(".tree-item__row").click();
    await el.updateComplete;
    expect(index.selected).to.equal(true);
    expect(src.selected).to.equal(false);
  });

  it("selecting a second row replaces the first selection", async () => {
    const el = await treeFixture(buildSampleItems());
    const src = el.getItemByKey("src");
    const readme = el.getItemByKey("readme");
    await src.updateComplete;
    await readme.updateComplete;
    src.shadowRoot.querySelector(".tree-item__row").click();
    await el.updateComplete;
    readme.shadowRoot.querySelector(".tree-item__row").click();
    await el.updateComplete;
    expect(src.selected).to.equal(false);
    expect(readme.selected).to.equal(true);
    expect(el.selectedItems).to.deep.equal(new Set(["readme"]));
  });
});

describe("tvx-tree-view — multi-select (ctrl/cmd+click, shift+click)", () => {
  /** @param {Element} row @param {Partial<MouseEventInit>} init */
  function clickRow(row, init = {}) {
    row.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, ...init }));
  }

  it("a plain click replaces the whole selection with just that item, same as single-select", async () => {
    const el = await treeFixture(buildTwoChildItems());
    el.multiSelect = true;
    el.setItemExpansion({ id: "src", expand: true });
    await el.updateComplete;
    const index = el.getItemByKey("index");
    const utils = el.getItemByKey("utils");
    await index.updateComplete;
    await utils.updateComplete;

    clickRow(index.shadowRoot.querySelector(".tree-item__row"));
    await el.updateComplete;
    clickRow(utils.shadowRoot.querySelector(".tree-item__row"));
    await el.updateComplete;

    expect(index.selected).to.equal(false);
    expect(utils.selected).to.equal(true);
    expect(el.selectedItems).to.deep.equal(new Set(["utils"]));
  });

  it("ctrl/cmd+click toggles one item without touching the rest of the selection", async () => {
    const el = await treeFixture(buildTwoChildItems());
    el.multiSelect = true;
    el.setItemExpansion({ id: "src", expand: true });
    await el.updateComplete;
    const index = el.getItemByKey("index");
    const utils = el.getItemByKey("utils");
    await index.updateComplete;
    await utils.updateComplete;

    clickRow(index.shadowRoot.querySelector(".tree-item__row"));
    await el.updateComplete;
    clickRow(utils.shadowRoot.querySelector(".tree-item__row"), { ctrlKey: true });
    await el.updateComplete;

    expect(index.selected).to.equal(true);
    expect(utils.selected).to.equal(true);
    expect(el.selectedItems).to.deep.equal(new Set(["index", "utils"]));

    clickRow(index.shadowRoot.querySelector(".tree-item__row"), { metaKey: true });
    await el.updateComplete;

    expect(index.selected).to.equal(false);
    expect(utils.selected).to.equal(true);
  });

  it("shift+click selects the contiguous visible range from the last selection anchor", async () => {
    const el = await treeFixture([
      buildItem({ id: "a", label: "Alpha" }),
      buildItem({ id: "b", label: "Beta" }),
      buildItem({ id: "c", label: "Cherry" }),
      buildItem({ id: "d", label: "Delta" }),
    ]);
    el.multiSelect = true;
    await el.updateComplete;
    const a = el.getItemByKey("a");
    const c = el.getItemByKey("c");
    const d = el.getItemByKey("d");
    await a.updateComplete;
    await d.updateComplete;

    clickRow(a.shadowRoot.querySelector(".tree-item__row"));
    await el.updateComplete;
    clickRow(c.shadowRoot.querySelector(".tree-item__row"), { shiftKey: true });
    await el.updateComplete;

    expect(el.selectedItems).to.deep.equal(new Set(["a", "b", "c"]));

    // The anchor advances to "c" after that shift+click, so this one extends from "c" to "d" — it
    // just happens to produce the same total here since both ranges only ever grow.
    clickRow(d.shadowRoot.querySelector(".tree-item__row"), { shiftKey: true });
    await el.updateComplete;
    expect(el.selectedItems).to.deep.equal(new Set(["a", "b", "c", "d"]));
  });

  it("a shift+click merges into the existing selection instead of replacing it", async () => {
    const el = await treeFixture([
      buildItem({ id: "a", label: "Alpha" }),
      buildItem({ id: "b", label: "Beta" }),
      buildItem({ id: "c", label: "Cherry" }),
      buildItem({ id: "d", label: "Delta" }),
    ]);
    el.multiSelect = true;
    await el.updateComplete;
    const a = el.getItemByKey("a");
    const c = el.getItemByKey("c");
    const d = el.getItemByKey("d");

    // A ctrl+click far from the eventual range must survive the shift+click below — a plain click
    // would have replaced the whole selection instead, so both of these use ctrl+click.
    clickRow(a.shadowRoot.querySelector(".tree-item__row"), { ctrlKey: true });
    await el.updateComplete;
    clickRow(d.shadowRoot.querySelector(".tree-item__row"), { ctrlKey: true });
    await el.updateComplete;
    clickRow(c.shadowRoot.querySelector(".tree-item__row"), { shiftKey: true });
    await el.updateComplete;

    expect(el.selectedItems).to.deep.equal(new Set(["a", "c", "d"]));
  });

  it("shift+click shrinks an already-selected range from the far end, without deselecting the clicked item", async () => {
    const el = await treeFixture([
      buildItem({ id: "a", label: "Alpha" }),
      buildItem({ id: "b", label: "Beta" }),
      buildItem({ id: "c", label: "Cherry" }),
      buildItem({ id: "d", label: "Delta" }),
    ]);
    el.multiSelect = true;
    await el.updateComplete;
    const a = el.getItemByKey("a");
    const b = el.getItemByKey("b");
    const d = el.getItemByKey("d");

    clickRow(a.shadowRoot.querySelector(".tree-item__row"));
    await el.updateComplete;
    clickRow(d.shadowRoot.querySelector(".tree-item__row"), { shiftKey: true });
    await el.updateComplete;
    expect(el.selectedItems).to.deep.equal(new Set(["a", "b", "c", "d"]));

    // "b" is already selected, so this shift+click shrinks — it removes everything strictly
    // between "b" and the anchor ("d"), i.e. "c" and "d" itself, and moves the anchor to "b".
    clickRow(b.shadowRoot.querySelector(".tree-item__row"), { shiftKey: true });
    await el.updateComplete;
    expect(el.selectedItems).to.deep.equal(new Set(["a", "b"]));

    // Shift+clicking "b" again is now shift+clicking the anchor itself — nothing left to back
    // off, so it's a no-op.
    clickRow(b.shadowRoot.querySelector(".tree-item__row"), { shiftKey: true });
    await el.updateComplete;
    expect(el.selectedItems).to.deep.equal(new Set(["a", "b"]));
  });

  it("disabled items are excluded from a shift+click range", async () => {
    const el = await treeFixture([
      buildItem({ id: "a", label: "Alpha" }),
      buildItem({ id: "b", label: "Beta" }),
      buildItem({ id: "c", label: "Cherry" }),
    ]);
    el.multiSelect = true;
    await el.updateComplete;
    const a = el.getItemByKey("a");
    const b = el.getItemByKey("b");
    const c = el.getItemByKey("c");
    b.disabled = true;
    await el.updateComplete;

    clickRow(a.shadowRoot.querySelector(".tree-item__row"));
    await el.updateComplete;
    clickRow(c.shadowRoot.querySelector(".tree-item__row"), { shiftKey: true });
    await el.updateComplete;

    expect(el.selectedItems).to.deep.equal(new Set(["a", "c"]));
  });
});

describe("tvx-tree-view — checkboxSelection", () => {
  it("renders a checkbox per row when checkboxSelection is set, checked to match .selected", async () => {
    const el = await treeFixture(buildSampleItems());
    el.checkboxSelection = true;
    await el.updateComplete;
    const readme = el.getItemByKey("readme");
    await readme.updateComplete;

    const checkbox = readme.shadowRoot.querySelector("md-checkbox");
    expect(checkbox).to.exist;
    expect(checkbox.checked).to.equal(false);

    readme.selected = true;
    await readme.updateComplete;
    expect(checkbox.checked).to.equal(true);
  });

  it("clicking the checkbox in single-select mode selects that item", async () => {
    const el = await treeFixture(buildSampleItems());
    el.checkboxSelection = true;
    await el.updateComplete;
    const readme = el.getItemByKey("readme");
    await readme.updateComplete;

    readme.shadowRoot.querySelector("md-checkbox").click();
    await el.updateComplete;

    expect(readme.selected).to.equal(true);
    expect(el.selectedItems).to.deep.equal(new Set(["readme"]));
  });

  it("clicking a checkbox in multi-select mode toggles just that item, leaving unrelated selection untouched", async () => {
    // Two children per parent, only one checked in each — so neither parent's cascade fires,
    // isolating the "unrelated subtree untouched" behavior from cascade's own upward propagation
    // (covered separately below).
    const el = await treeFixture([
      buildItem({
        id: "a",
        label: "a/",
        children: [
          { id: "a1", label: "a1.js" },
          { id: "a2", label: "a2.js" },
        ],
      }),
      buildItem({
        id: "b",
        label: "b/",
        children: [
          { id: "b1", label: "b1.js" },
          { id: "b2", label: "b2.js" },
        ],
      }),
    ]);
    el.multiSelect = true;
    el.checkboxSelection = true;
    el.setItemExpansion({ id: "a", expand: true });
    el.setItemExpansion({ id: "b", expand: true });
    await el.updateComplete;
    const a1 = el.getItemByKey("a1");
    const b1 = el.getItemByKey("b1");
    await a1.updateComplete;
    await b1.updateComplete;

    a1.shadowRoot.querySelector("md-checkbox").click();
    await el.updateComplete;
    b1.shadowRoot.querySelector("md-checkbox").click();
    await el.updateComplete;

    expect(el.selectedItems).to.deep.equal(new Set(["a1", "b1"]));

    a1.shadowRoot.querySelector("md-checkbox").click();
    await el.updateComplete;
    expect(el.selectedItems).to.deep.equal(new Set(["b1"]));
  });

  it("no checkbox renders when disableSelection is set, even with checkboxSelection on", async () => {
    const el = await treeFixture(buildSampleItems());
    el.checkboxSelection = true;
    el.disableSelection = true;
    await el.updateComplete;
    const readme = el.getItemByKey("readme");
    await readme.updateComplete;

    expect(readme.shadowRoot.querySelector("md-checkbox")).to.equal(null);
  });

  it("clicking a row does not select when checkboxSelection is on — only the checkbox does", async () => {
    const el = await treeFixture(buildSampleItems());
    el.checkboxSelection = true;
    await el.updateComplete;
    const readme = el.getItemByKey("readme");
    await readme.updateComplete;

    readme.shadowRoot.querySelector(".tree-item__row").click();
    await el.updateComplete;
    expect(readme.selected).to.equal(false);
    expect(el.selectedItems).to.deep.equal(new Set());
  });

  it("clicking a branch row with checkboxSelection on still toggles expansion, just not selection", async () => {
    const el = await treeFixture(buildSampleItems());
    el.checkboxSelection = true;
    await el.updateComplete;
    const src = el.getItemByKey("src");
    await src.updateComplete;

    src.shadowRoot.querySelector(".tree-item__row").click();
    await el.updateComplete;
    expect(src.expanded).to.equal(true);
    expect(src.selected).to.equal(false);
  });

  it("checking every child individually (never the parent's own checkbox) selects the parent, not just indeterminate", async () => {
    const el = await treeFixture(buildTwoChildItems());
    el.multiSelect = true;
    el.checkboxSelection = true;
    el.setItemExpansion({ id: "src", expand: true });
    await el.updateComplete;
    const src = el.getItemByKey("src");
    const index = el.getItemByKey("index");
    const utils = el.getItemByKey("utils");
    await src.updateComplete;
    await index.updateComplete;
    await utils.updateComplete;

    index.shadowRoot.querySelector("md-checkbox").click();
    await el.updateComplete;
    expect(src.selected).to.equal(false);
    expect(src.indeterminate).to.equal(true);

    utils.shadowRoot.querySelector("md-checkbox").click();
    await el.updateComplete;
    expect(src.selected).to.equal(true);
    expect(src.indeterminate).to.equal(false);
  });

  it("clicking a branch's own checkbox cascades select/deselect to its whole subtree", async () => {
    const el = await treeFixture(buildTwoChildItems());
    el.multiSelect = true;
    el.checkboxSelection = true;
    el.setItemExpansion({ id: "src", expand: true });
    await el.updateComplete;
    const src = el.getItemByKey("src");
    const index = el.getItemByKey("index");
    const utils = el.getItemByKey("utils");
    await src.updateComplete;

    src.shadowRoot.querySelector("md-checkbox").click();
    await el.updateComplete;
    expect(el.selectedItems).to.deep.equal(new Set(["src", "index", "utils"]));
    expect(index.selected).to.equal(true);
    expect(utils.selected).to.equal(true);
    expect(src.indeterminate).to.equal(false);

    src.shadowRoot.querySelector("md-checkbox").click();
    await el.updateComplete;
    expect(el.selectedItems).to.deep.equal(new Set());
    expect(index.selected).to.equal(false);
    expect(utils.selected).to.equal(false);
  });

  it("Space cascades like a checkbox click when checkboxSelection is on, even focused on a branch", async () => {
    const el = await treeFixture(buildTwoChildItems());
    el.multiSelect = true;
    el.checkboxSelection = true;
    el.setItemExpansion({ id: "src", expand: true });
    await el.updateComplete;
    const src = el.getItemByKey("src");
    const index = el.getItemByKey("index");
    const utils = el.getItemByKey("utils");
    el.focusItem(src);

    src.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, composed: true }));
    await el.updateComplete;
    expect(el.selectedItems).to.deep.equal(new Set(["src", "index", "utils"]));
    expect(index.selected).to.equal(true);
    expect(utils.selected).to.equal(true);
    expect(src.selected).to.equal(true);
    expect(src.indeterminate).to.equal(false);

    src.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, composed: true }));
    await el.updateComplete;
    expect(el.selectedItems).to.deep.equal(new Set());
  });
});

describe("tvx-tree-view — roving tabindex & keyboard nav", () => {
  it("ArrowDown/ArrowUp move the roving tab stop between visible items", async () => {
    const el = await treeFixture(buildSampleItems());
    const src = el.getItemByKey("src");
    const readme = el.getItemByKey("readme");
    el.focusItem(src);

    src.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, composed: true }),
    );
    expect(el.focusedKey).to.equal("readme");
    expect(readme.tabIndex).to.equal(0);
    expect(src.tabIndex).to.equal(-1);

    readme.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, composed: true }),
    );
    expect(el.focusedKey).to.equal("src");
  });

  it("Home/End jump to the first/last visible item", async () => {
    const el = await treeFixture(buildSampleItems());
    const src = el.getItemByKey("src");
    const readme = el.getItemByKey("readme");
    el.focusItem(src);

    src.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, composed: true }));
    expect(el.focusedKey).to.equal("readme");

    readme.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true, composed: true }),
    );
    expect(el.focusedKey).to.equal("src");
  });

  it("ArrowRight expands a collapsed branch without moving focus, then moves into its first child", async () => {
    const el = await treeFixture(buildSampleItems());
    const src = el.getItemByKey("src");
    el.focusItem(src);

    src.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, composed: true }),
    );
    await el.updateComplete;
    expect(src.expanded).to.equal(true);
    expect(el.focusedKey).to.equal("src");

    src.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, composed: true }),
    );
    expect(el.focusedKey).to.equal("index");
  });

  it("ArrowLeft collapses an expanded branch without moving focus, then moves focus to the parent", async () => {
    const el = await treeFixture(buildSampleItems());
    el.setItemExpansion({ id: "src", expand: true });
    await el.updateComplete;
    const src = el.getItemByKey("src");
    const index = el.getItemByKey("index");

    el.focusItem(src);
    src.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, composed: true }),
    );
    expect(src.expanded).to.equal(false);
    expect(el.focusedKey).to.equal("src");

    el.setItemExpansion({ id: "src", expand: true });
    await el.updateComplete;
    el.focusItem(index);
    index.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, composed: true }),
    );
    expect(el.focusedKey).to.equal("src");
  });

  it("typeahead jumps focus to the next visible item whose label starts with the typed text", async () => {
    const el = await treeFixture([
      buildItem({ id: "a", label: "Alpha" }),
      buildItem({ id: "b", label: "Beta" }),
      buildItem({ id: "c", label: "Cherry" }),
    ]);
    const alpha = el.getItemByKey("a");
    el.focusItem(alpha);

    alpha.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true, composed: true }));
    expect(el.focusedKey).to.equal("c");
  });

  it("Enter toggles a branch's expansion rather than selecting it", async () => {
    const el = await treeFixture(buildSampleItems());
    const src = el.getItemByKey("src");
    el.focusItem(src);

    src.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
    );
    expect(src.expanded).to.equal(true);
    expect(src.selected).to.equal(false);

    src.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
    );
    expect(src.expanded).to.equal(false);
  });

  it("Enter is a no-op on a leaf item (nothing to expand)", async () => {
    const el = await treeFixture(buildSampleItems());
    const readme = el.getItemByKey("readme");
    el.focusItem(readme);

    readme.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
    );
    expect(readme.selected).to.equal(false);
  });

  it("Space activates in single-select mode too (previously gated to multiSelect)", async () => {
    const el = await treeFixture(buildSampleItems());
    const readme = el.getItemByKey("readme");
    el.focusItem(readme);

    readme.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, composed: true }));
    expect(readme.selected).to.equal(true);
  });

  it("Space selects a branch without touching its expansion", async () => {
    const el = await treeFixture(buildSampleItems());
    const src = el.getItemByKey("src");
    el.focusItem(src);

    src.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, composed: true }));
    expect(src.selected).to.equal(true);
    expect(src.expanded).to.equal(false);
  });

  it("Enter/Space are no-ops for selection/expansion respectively when disableSelection is set", async () => {
    const el = await treeFixture(buildSampleItems());
    el.disableSelection = true;
    await el.updateComplete;
    const src = el.getItemByKey("src");
    el.focusItem(src);

    src.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
    );
    expect(src.expanded).to.equal(true);

    src.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, composed: true }));
    expect(src.expanded).to.equal(true);
    expect(src.selected).to.equal(false);
  });

  it("clicking a row toggles instead of selecting when disableSelection is set", async () => {
    const el = await treeFixture(buildSampleItems());
    el.disableSelection = true;
    await el.updateComplete;
    const src = el.getItemByKey("src");
    await src.updateComplete;

    src.shadowRoot.querySelector(".tree-item__row").click();
    await el.updateComplete;
    expect(src.expanded).to.equal(true);
  });

  it("Backspace moves focus to the parent item", async () => {
    const el = await treeFixture(buildSampleItems());
    el.setItemExpansion({ id: "src", expand: true });
    await el.updateComplete;
    const index = el.getItemByKey("index");
    el.focusItem(index);

    index.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, composed: true }),
    );
    expect(el.focusedKey).to.equal("src");
  });

  it("PageDown/PageUp jump by an estimated page within the nearest scroll container", async () => {
    const el = /** @type {TvxTreeView} */ (document.createElement("tvx-tree-view"));
    el.items = Array.from({ length: 20 }, (_, i) => buildItem({ id: `n${i}`, label: `Node ${i}` }));
    const container = /** @type {HTMLElement} */ (
      await fixture(html`<div style="height: 150px; overflow: auto;"></div>`)
    );
    container.append(el);
    await el.updateComplete;

    const first = el.getItemByKey("n0");
    el.focusItem(first);

    first.dispatchEvent(
      new KeyboardEvent("keydown", { key: "PageDown", bubbles: true, composed: true }),
    );
    const afterPageDown = el.focusedKey;
    // A 150px container can't fit all 20 rows — PageDown should land short of the end.
    expect(afterPageDown).to.not.equal("n0");
    expect(afterPageDown).to.not.equal("n19");

    const landed = /** @type {TvxTreeItem} */ (
      el.getItemByKey(/** @type {string} */ (afterPageDown))
    );
    landed.dispatchEvent(
      new KeyboardEvent("keydown", { key: "PageUp", bubbles: true, composed: true }),
    );
    expect(el.focusedKey).to.equal("n0");
  });

  it("focusNode coalesces scroll-into-view onto the most recently focused item", async () => {
    const el = await treeFixture(buildSampleItems());
    const src = el.getItemByKey("src");
    const readme = el.getItemByKey("readme");
    let srcCalls = 0;
    let readmeCalls = 0;
    src.scrollIntoView = () => {
      srcCalls++;
    };
    readme.scrollIntoView = () => {
      readmeCalls++;
    };

    el.focusItem(src);
    el.focusItem(readme);
    el.focusItem(readme);

    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(srcCalls).to.equal(0);
    expect(readmeCalls).to.equal(1);
  });
});

describe("tvx-tree-view — Shift+ArrowUp/Down range selection (multi-select)", () => {
  it("Shift+ArrowDown extends the range selection from the last focused item, same as shift+click", async () => {
    const el = await treeFixture([
      buildItem({ id: "a", label: "Alpha" }),
      buildItem({ id: "b", label: "Beta" }),
      buildItem({ id: "c", label: "Cherry" }),
    ]);
    el.multiSelect = true;
    await el.updateComplete;
    const a = el.getItemByKey("a");
    const b = el.getItemByKey("b");

    a.shadowRoot.querySelector(".tree-item__row").click();
    await el.updateComplete;
    el.focusItem(a);

    a.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true, bubbles: true, composed: true }),
    );
    await el.updateComplete;
    expect(el.focusedKey).to.equal("b");
    expect(el.selectedItems).to.deep.equal(new Set(["a", "b"]));

    b.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true, bubbles: true, composed: true }),
    );
    await el.updateComplete;
    expect(el.focusedKey).to.equal("c");
    expect(el.selectedItems).to.deep.equal(new Set(["a", "b", "c"]));
  });

  it("a plain ArrowDown (no Shift) only moves focus — it never changes the selection", async () => {
    const el = await treeFixture([
      buildItem({ id: "a", label: "Alpha" }),
      buildItem({ id: "b", label: "Beta" }),
    ]);
    el.multiSelect = true;
    await el.updateComplete;
    const a = el.getItemByKey("a");

    a.shadowRoot.querySelector(".tree-item__row").click();
    await el.updateComplete;
    el.focusItem(a);

    a.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, composed: true }),
    );
    await el.updateComplete;
    expect(el.focusedKey).to.equal("b");
    expect(el.selectedItems).to.deep.equal(new Set(["a"]));
  });
});

describe("tvx-tree-view — async loading (dataSource)", () => {
  // dataSource: { getTreeItems: async (parent?) => TvxTreeItem[], getChildrenCount: (item) => number }.
  // getTreeItems(undefined) fetches the root; getTreeItems(item) fetches a branch's children on
  // expand. getChildrenCount runs once per item, eagerly, on whatever batch it just arrived in —
  // a count > 0 makes that item a group (chevron), 0 leaves it a leaf. .items is ignored once
  // dataSource is set, except as `initialItems` (see below).

  it("with no .items set, fetches the root via getTreeItems(undefined) behind a whole-tree placeholder, then applies getChildrenCount to mark which root items are groups", async () => {
    const el = /** @type {TvxTreeView} */ (await fixture(html`<tvx-tree-view></tvx-tree-view>`));
    /** @type {(value: unknown) => void} */
    let resolveRoot = () => {};
    el.dataSource = {
      getTreeItems: () => new Promise((resolve) => (resolveRoot = resolve)),
      getChildrenCount: (item) => (item.key === "src" ? 2 : 0),
    };
    await el.updateComplete;

    const placeholder = /** @type {TvxTreeItem} */ (el.querySelector("[loading]"));
    expect(placeholder).to.exist;
    const region = el.shadowRoot.querySelector(".tree-view__live-region");
    await aTimeout(20);
    expect(region.textContent).to.equal("Loading…");

    resolveRoot([
      buildItem({ id: "src", label: "src/" }),
      buildItem({ id: "readme", label: "README.md" }),
    ]);
    await aTimeout(20);
    await el.updateComplete;

    expect(el.querySelector("[loading]")).to.equal(null);
    expect(el.getItemByKey("src").hasChildren).to.equal(true);
    expect(el.getItemByKey("src").childCount).to.equal(2);
    expect(el.getItemByKey("readme").hasChildren).to.equal(false);
  });

  it("with .items set, treats it as initialItems: skips the root getTreeItems() call entirely but still runs getChildrenCount on it", async () => {
    const el = /** @type {TvxTreeView} */ (await fixture(html`<tvx-tree-view></tvx-tree-view>`));
    let rootCalled = false;
    el.items = [
      buildItem({ id: "src", label: "src/" }),
      buildItem({ id: "readme", label: "README.md" }),
    ];
    el.dataSource = {
      getTreeItems: (parent) => {
        if (!parent) rootCalled = true;
        return Promise.resolve([]);
      },
      getChildrenCount: (item) => (item.key === "src" ? 2 : 0),
    };
    await el.updateComplete;
    await aTimeout(20);

    expect(rootCalled).to.equal(false);
    expect(el.getItemByKey("src").hasChildren).to.equal(true);
    expect(el.getItemByKey("src").childCount).to.equal(2);
  });

  it("fires tvx-children-loaded with key/node: null once the root batch lands", async () => {
    const el = /** @type {TvxTreeView} */ (await fixture(html`<tvx-tree-view></tvx-tree-view>`));
    /** @type {any} */
    let detail;
    el.addEventListener("tvx-children-loaded", (event) => (detail = event.detail));
    el.dataSource = {
      getTreeItems: async () => [buildItem({ id: "readme", label: "README.md" })],
      getChildrenCount: () => 0,
    };
    await el.updateComplete;
    await aTimeout(20);
    await el.updateComplete;

    expect(detail.key).to.equal(null);
    expect(detail.node).to.equal(null);
    expect(detail.items.map((item) => item.key)).to.deep.equal(["readme"]);
  });

  it("expanding a group with a known childCount shows tvx-tree-skeleton (not the generic placeholder), announces the count, then appends real children", async () => {
    const el = /** @type {TvxTreeView} */ (await fixture(html`<tvx-tree-view></tvx-tree-view>`));
    /** @type {(value: unknown) => void} */
    let resolveLoad = () => {};
    el.items = [buildItem({ id: "src", label: "src/" })];
    el.dataSource = {
      getTreeItems: (parent) =>
        parent ? new Promise((resolve) => (resolveLoad = resolve)) : Promise.resolve([]),
      getChildrenCount: (item) => (item.key === "src" ? 2 : 0),
    };
    await el.updateComplete;
    await aTimeout(20); // let the initialItems getChildrenCount pass land

    const src = el.getItemByKey("src");
    el.setItemExpansion({ id: "src", expand: true });
    await el.updateComplete;

    const skeleton = src.querySelector("tvx-tree-skeleton");
    expect(skeleton).to.exist;
    expect(skeleton.count).to.equal(2);
    // A known count never renders the generic spinner+text placeholder row.
    expect(src.querySelector("[loading]")).to.equal(null);

    const region = el.shadowRoot.querySelector(".tree-view__live-region");
    await aTimeout(20);
    expect(region.textContent).to.equal("Loading 2 items.");

    // getTreeItems returns real elements, built the same way .items is (see the spec's "Data
    // model") — not plain data for the tree to convert.
    resolveLoad([buildItem({ id: "a", label: "a.js" }), buildItem({ id: "b", label: "b.js" })]);
    await aTimeout(20);
    await el.updateComplete;

    expect(src.querySelector("tvx-tree-skeleton")).to.equal(null);
    expect(el.getItemByKey("a")).to.exist;
    expect(el.getItemByKey("b")).to.exist;

    // Regression: lazily-appended children must land inside the branch's `<tvx-item-sub-tree>`,
    // not its unnamed (label) slot — an unslotted append here previously replaced the branch's own
    // visible label with the new item's row instead of adding it underneath.
    const a = el.getItemByKey("a");
    expect(a.parentElement).to.equal(src._subTreeEl);
    expect(src._subTreeEl.getAttribute("slot")).to.equal("sub-tree");
    await src.updateComplete;
    expect(src.label).to.equal("src/");
    expect(src.shadowRoot.querySelector(".tree-item__label").textContent.trim()).to.equal("src/");
  });

  it("caps tvx-tree-skeleton at 8 rows even when childCount reports a much larger number", async () => {
    const el = /** @type {TvxTreeView} */ (await fixture(html`<tvx-tree-view></tvx-tree-view>`));
    el.items = [buildItem({ id: "src", label: "src/" })];
    el.dataSource = {
      getTreeItems: () => new Promise(() => {}), // never resolves — only the placeholder matters here
      getChildrenCount: (item) => (item.key === "src" ? 500 : 0),
    };
    await el.updateComplete;
    await aTimeout(20);

    el.setItemExpansion({ id: "src", expand: true });
    await el.updateComplete;

    const skeleton = /** @type {any} */ (el.getItemByKey("src").querySelector("tvx-tree-skeleton"));
    expect(skeleton.count).to.equal(500);
    await skeleton.updateComplete;
    expect(skeleton.shadowRoot.querySelectorAll(".tree-skeleton__row").length).to.equal(8);
  });

  it("with an unknown count, the generic placeholder stays focusable — focus moves to it, then hands off to the first real child once loaded", async () => {
    const el = /** @type {TvxTreeView} */ (await fixture(html`<tvx-tree-view></tvx-tree-view>`));
    /** @type {(value: unknown) => void} */
    let resolveLoad = () => {};
    el.items = [buildItem({ id: "src", label: "src/" })];
    el.dataSource = {
      getTreeItems: (parent) =>
        parent ? new Promise((resolve) => (resolveLoad = resolve)) : Promise.resolve([]),
      // undefined, not a number — the branch is still a group, but with no known count.
      getChildrenCount: (item) => (item.key === "src" ? undefined : 0),
    };
    await el.updateComplete;
    await aTimeout(20);

    const src = el.getItemByKey("src");
    el.setItemExpansion({ id: "src", expand: true });
    await el.updateComplete;

    const placeholder = /** @type {TvxTreeItem} */ (src.querySelector("[loading]"));
    expect(placeholder).to.exist;
    expect(src.querySelector("tvx-tree-skeleton")).to.equal(null);
    el.focusItem(placeholder);

    resolveLoad([buildItem({ id: "a", label: "a.js" })]);
    await aTimeout(20);
    await el.updateComplete;

    expect(src.querySelector("[loading]")).to.equal(null);
    expect(el.focusedKey).to.equal("a");
  });

  it("applies getChildrenCount to a branch's newly-loaded children too, so a nested group gets its chevron before it's ever expanded", async () => {
    const el = /** @type {TvxTreeView} */ (await fixture(html`<tvx-tree-view></tvx-tree-view>`));
    el.items = [buildItem({ id: "src", label: "src/" })];
    el.dataSource = {
      getTreeItems: async (parent) => (parent ? [buildItem({ id: "utils", label: "utils/" })] : []),
      getChildrenCount: (item) => (item.key === "src" || item.key === "utils" ? 1 : 0),
    };
    await el.updateComplete;
    await aTimeout(20);

    el.setItemExpansion({ id: "src", expand: true });
    await el.updateComplete;
    await aTimeout(20);
    await el.updateComplete;

    const utils = el.getItemByKey("utils");
    expect(utils.hasChildren).to.equal(true);
    expect(utils.childCount).to.equal(1);
  });

  it("fires tvx-children-loaded once a branch's new items are actually in the DOM, for consumers that decorate items post-load", async () => {
    const el = /** @type {TvxTreeView} */ (await fixture(html`<tvx-tree-view></tvx-tree-view>`));
    /** @type {(value: unknown) => void} */
    let resolveLoad = () => {};
    el.items = [buildItem({ id: "src", label: "src/" })];
    el.dataSource = {
      getTreeItems: (parent) =>
        parent ? new Promise((resolve) => (resolveLoad = resolve)) : Promise.resolve([]),
      getChildrenCount: (item) => (item.key === "src" ? 1 : 0),
    };
    await el.updateComplete;
    await aTimeout(20);

    /** @type {any} */
    let detail;
    el.addEventListener("tvx-children-loaded", (event) => (detail = event.detail));
    el.setItemExpansion({ id: "src", expand: true });
    await el.updateComplete;

    // Not yet — the fetch hasn't resolved, nothing has actually landed in the DOM yet.
    expect(detail).to.equal(undefined);

    resolveLoad([buildItem({ id: "a", label: "a.js" })]);
    await aTimeout(20);
    await el.updateComplete;

    expect(detail.key).to.equal("src");
    expect(detail.node).to.equal(el.getItemByKey("src"));
    expect(detail.items.map((item) => item.key)).to.deep.equal(["a"]);
    // The event only fires once the item is actually appended, so a listener can safely decorate
    // it immediately without waiting another tick.
    expect(detail.items[0].isConnected).to.equal(true);
  });

  it("announces '{label} is empty.' and returns focus to the branch, removing aria-expanded, when getTreeItems resolves empty despite getChildrenCount having said otherwise", async () => {
    const el = /** @type {TvxTreeView} */ (await fixture(html`<tvx-tree-view></tvx-tree-view>`));
    el.items = [buildItem({ id: "empty", label: "empty/" })];
    el.dataSource = {
      getTreeItems: async (parent) => (parent ? [] : []),
      getChildrenCount: (item) => (item.key === "empty" ? 3 : 0),
    };
    await el.updateComplete;
    await aTimeout(20);

    const branch = el.getItemByKey("empty");
    el.setItemExpansion({ id: "empty", expand: true });
    await el.updateComplete;
    const placeholder = /** @type {TvxTreeItem} */ (branch.querySelector("[loading]"));
    el.focusItem(placeholder);

    await aTimeout(20);
    await el.updateComplete;

    const region = el.shadowRoot.querySelector(".tree-view__live-region");
    expect(region.textContent).to.equal("empty/ is empty.");
    expect(branch.hasChildren).to.equal(false);
    expect(branch.hasAttribute("aria-expanded")).to.equal(false);
    expect(el.focusedKey).to.equal("empty");
  });

  it("a leaf item (getChildrenCount returned 0) never calls getTreeItems on expand", async () => {
    const el = /** @type {TvxTreeView} */ (await fixture(html`<tvx-tree-view></tvx-tree-view>`));
    let branchCalled = false;
    el.items = [buildItem({ id: "leaf", label: "leaf" })];
    el.dataSource = {
      getTreeItems: async (parent) => {
        if (parent) branchCalled = true;
        return [];
      },
      getChildrenCount: () => 0,
    };
    await el.updateComplete;
    await aTimeout(20);

    el.setItemExpansion({ id: "leaf", expand: true });
    await el.updateComplete;
    expect(branchCalled).to.equal(false);
  });

  it("a rejected getTreeItems leaves the item stuck — no retry on a later expand attempt", async () => {
    const el = /** @type {TvxTreeView} */ (await fixture(html`<tvx-tree-view></tvx-tree-view>`));
    let callCount = 0;
    el.items = [buildItem({ id: "src", label: "src/" })];
    el.dataSource = {
      getTreeItems: async (parent) => {
        if (!parent) return [];
        callCount++;
        throw new Error("network error");
      },
      getChildrenCount: (item) => (item.key === "src" ? 1 : 0),
    };
    await el.updateComplete;
    await aTimeout(20);

    el.setItemExpansion({ id: "src", expand: true });
    await el.updateComplete;
    await aTimeout(20);
    expect(callCount).to.equal(1);
    expect(el.getItemByKey("src").querySelector("[loading]")).to.equal(null);

    el.setItemExpansion({ id: "src", expand: false });
    el.setItemExpansion({ id: "src", expand: true });
    await el.updateComplete;
    await aTimeout(20);
    expect(callCount).to.equal(1);
  });

  it("getChildrenCount returning undefined marks a group with an unknown count — a generic 'Loading…' placeholder on expand, and an empty getTreeItems result still runs the 'is empty' flow instead of being treated as never-a-group", async () => {
    const el = /** @type {TvxTreeView} */ (await fixture(html`<tvx-tree-view></tvx-tree-view>`));
    /** @type {(value: unknown) => void} */
    let resolveLoad = () => {};
    el.items = [buildItem({ id: "node_modules", label: "node_modules/" })];
    el.dataSource = {
      getTreeItems: (parent) =>
        parent ? new Promise((resolve) => (resolveLoad = resolve)) : Promise.resolve([]),
      // undefined, not 0 — a known-empty directory is still a group, unlike an actual leaf.
      getChildrenCount: () => undefined,
    };
    await el.updateComplete;
    await aTimeout(20);

    const branch = el.getItemByKey("node_modules");
    expect(branch.hasChildren).to.equal(true);
    expect(branch.childCount).to.equal(undefined);

    el.setItemExpansion({ id: "node_modules", expand: true });
    await el.updateComplete;
    const placeholder = /** @type {TvxTreeItem} */ (branch.querySelector("[loading]"));
    expect(placeholder).to.exist;
    el.focusItem(placeholder);

    const region = el.shadowRoot.querySelector(".tree-view__live-region");
    await aTimeout(20);
    expect(region.textContent).to.equal("Loading…");

    resolveLoad([]);
    await aTimeout(20);
    await el.updateComplete;
    expect(region.textContent).to.equal("node_modules/ is empty.");
    expect(branch.hasChildren).to.equal(false);
  });
});

describe("tvx-tree-view — open in new tab", () => {
  it("Ctrl+Enter dispatches tvx-open with newTab when getHref returns nothing", async () => {
    const el = await treeFixture(buildSampleItems());
    const readme = el.getItemByKey("readme");
    let detail;
    el.addEventListener("tvx-open", (event) => (detail = event.detail));
    readme.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        bubbles: true,
        composed: true,
      }),
    );
    expect(detail).to.deep.equal({ key: "readme", node: readme, newTab: true });
  });

  it("Ctrl+Enter opens getHref's URL directly instead of dispatching tvx-open", async () => {
    const el = await treeFixture(buildSampleItems());
    el.getHref = (item) => (item.key === "readme" ? "/files/readme" : undefined);
    const readme = el.getItemByKey("readme");
    let dispatched = false;
    let openedUrl;
    const originalOpen = window.open;
    window.open = (url) => (openedUrl = url);
    el.addEventListener("tvx-open", () => (dispatched = true));

    readme.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        bubbles: true,
        composed: true,
      }),
    );

    window.open = originalOpen;
    expect(openedUrl).to.equal("/files/readme");
    expect(dispatched).to.equal(false);
  });
});

describe("tvx-tree-view — setItemExpansion", () => {
  it("expands a collapsed branch and collapses an expanded one", async () => {
    const el = await treeFixture(buildSampleItems());
    el.setItemExpansion({ id: "src", expand: true });
    await el.updateComplete;
    expect(el.isItemExpanded("src")).to.equal(true);
    el.setItemExpansion({ id: "src", expand: false });
    await el.updateComplete;
    expect(el.isItemExpanded("src")).to.equal(false);
  });

  it("isItemExpanded returns false for an unknown id", async () => {
    const el = await treeFixture(buildSampleItems());
    expect(el.isItemExpanded("does-not-exist")).to.equal(false);
  });
});

describe("tvx-tree-view — reordering", () => {
  it("registers neither drag nor drop by default (reordering off)", async () => {
    const el = await treeFixture(buildSampleItems());
    const readme = el.getItemByKey("readme");
    await readme.updateComplete;
    expect(readme._dragCleanup).to.equal(null);
    expect(readme._dropCleanup).to.equal(null);
  });

  it("registers drag+drop once reordering is turned on, and tears down when turned off", async () => {
    const el = await treeFixture(buildSampleItems());
    el.reordering = true;
    await el.updateComplete;
    const readme = el.getItemByKey("readme");
    await readme.updateComplete;
    expect(readme._dragCleanup).to.not.equal(null);
    expect(readme._dropCleanup).to.not.equal(null);

    el.reordering = false;
    await el.updateComplete;
    await readme.updateComplete;
    expect(readme._dragCleanup).to.equal(null);
    expect(readme._dropCleanup).to.equal(null);
  });

  it("isItemReorderable vetoes only dragging that item — it stays a valid drop target", async () => {
    const el = await treeFixture(buildSampleItems());
    el.reordering = true;
    el.isItemReorderable = (item) => item.key !== "readme";
    await el.updateComplete;
    const readme = el.getItemByKey("readme");
    await readme.updateComplete;
    expect(readme._dragCleanup).to.equal(null); // can't be picked up
    expect(readme._dropCleanup).to.not.equal(null); // siblings can still land on/around it
  });

  it("disabled items get neither drag nor drop registration", async () => {
    const el = await treeFixture(buildSampleItems());
    el.reordering = true;
    await el.updateComplete;
    const readme = el.getItemByKey("readme");
    readme.disabled = true;
    await readme.updateComplete;
    expect(readme._dragCleanup).to.equal(null);
    expect(readme._dropCleanup).to.equal(null);
  });

  it("Alt+ArrowDown/Up moves the focused item among its siblings and keeps focus on it", async () => {
    const el = await treeFixture(buildSampleItems());
    el.reordering = true;
    await el.updateComplete;
    const src = el.getItemByKey("src");
    el.focusItem(src);

    src.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        altKey: true,
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    expect([...el.children].map((c) => c.key)).to.deep.equal(["readme", "src"]);
    expect(el.focusedKey).to.equal("src");

    // "src" is now second (index 1) in [readme, src] — Alt+ArrowUp on it swaps it back before
    // "readme". Alt+ArrowUp on "readme" itself would be a no-op: it's already first, nothing to
    // move up past.
    src.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        altKey: true,
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;
    expect([...el.children].map((c) => c.key)).to.deep.equal(["src", "readme"]);
  });

  it("Alt+Arrow does nothing when reordering is off", async () => {
    const el = await treeFixture(buildSampleItems());
    const src = el.getItemByKey("src");
    el.focusItem(src);
    src.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        altKey: true,
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;
    expect([...el.children].map((c) => c.key)).to.deep.equal(["src", "readme"]);
  });

  it("a before/after drop fires a cancelable tvx-item-position-change then moves the element", async () => {
    const el = await treeFixture(buildSampleItems());
    el.reordering = true;
    await el.updateComplete;
    const readme = el.getItemByKey("readme");

    let detail;
    el.addEventListener("tvx-item-position-change", (event) => (detail = event.detail));
    readme.dispatchEvent(
      new CustomEvent("tvx-tree-item-reorder-drop", {
        detail: { sourceKey: "readme", targetKey: "src", zone: "before" },
        bubbles: true,
        composed: true,
      }),
    );
    await nextFrame();
    await el.updateComplete;

    expect(detail).to.deep.equal({
      key: "readme",
      oldPosition: { parentId: null, index: 1 },
      newPosition: { parentId: null, index: 0 },
    });
    expect([...el.children].map((c) => c.key)).to.deep.equal(["readme", "src"]);
  });

  it("preventDefault() on tvx-item-position-change vetoes the move entirely", async () => {
    const el = await treeFixture(buildSampleItems());
    el.reordering = true;
    await el.updateComplete;
    const src = el.getItemByKey("src");

    el.addEventListener("tvx-item-position-change", (event) => event.preventDefault());
    src.dispatchEvent(
      new CustomEvent("tvx-tree-item-reorder-drop", {
        detail: { sourceKey: "readme", targetKey: "src", zone: "before" },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    expect([...el.children].map((c) => c.key)).to.deep.equal(["src", "readme"]);
  });

  it("an 'into' drop reparents the item into the target's tvx-item-sub-tree and recomputes level", async () => {
    const el = await treeFixture(buildSampleItems());
    el.reordering = true;
    await el.updateComplete;
    const src = el.getItemByKey("src");
    const readme = el.getItemByKey("readme");

    src.dispatchEvent(
      new CustomEvent("tvx-tree-item-reorder-drop", {
        detail: { sourceKey: "readme", targetKey: "src", zone: "into" },
        bubbles: true,
        composed: true,
      }),
    );
    await nextFrame();
    await el.updateComplete;

    expect(readme.parentElement).to.equal(src._subTreeEl);
    expect(readme.hasAttribute("slot")).to.equal(false);
    expect(readme.level).to.equal(2);
  });

  it("refuses an 'into' drop onto a leaf (no hasChildren)", async () => {
    const el = await treeFixture(buildSampleItems());
    el.reordering = true;
    await el.updateComplete;
    const src = el.getItemByKey("src");
    const readme = el.getItemByKey("readme"); // leaf, hasChildren === false

    let fired = false;
    el.addEventListener("tvx-item-position-change", () => (fired = true));
    readme.dispatchEvent(
      new CustomEvent("tvx-tree-item-reorder-drop", {
        detail: { sourceKey: "src", targetKey: "readme", zone: "into" },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    expect(fired).to.equal(false);
    expect(src.parentElement).to.equal(el);
  });

  it("refuses dropping an item onto its own descendant (would create a cycle)", async () => {
    const el = await treeFixture(buildSampleItems());
    el.reordering = true;
    el.setItemExpansion({ id: "src", expand: true });
    await el.updateComplete;
    const src = el.getItemByKey("src");
    const index = el.getItemByKey("index");

    let fired = false;
    el.addEventListener("tvx-item-position-change", () => (fired = true));
    index.dispatchEvent(
      new CustomEvent("tvx-tree-item-reorder-drop", {
        detail: { sourceKey: "src", targetKey: "index", zone: "before" },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    expect(fired).to.equal(false);
    expect(index.parentElement).to.equal(src._subTreeEl);
  });

  it("a selected item stays selected after a drag moves it to a new parent (selection doesn't cascade)", async () => {
    const el = await treeFixture(buildTwoParentsWithChildren());
    el.multiSelect = true;
    el.reordering = true;
    el.setItemExpansion({ id: "a", expand: true });
    el.setItemExpansion({ id: "b", expand: true });
    await el.updateComplete;
    const a = el.getItemByKey("a");
    const b = el.getItemByKey("b");
    const a1 = el.getItemByKey("a1");
    await a1.updateComplete;

    a1.shadowRoot.querySelector(".tree-item__row").click();
    await el.updateComplete;
    expect(a1.selected).to.equal(true);
    expect(a.selected).to.equal(false);
    expect(b.selected).to.equal(false);

    b.dispatchEvent(
      new CustomEvent("tvx-tree-item-reorder-drop", {
        detail: { sourceKey: "a1", targetKey: "b", zone: "into" },
        bubbles: true,
        composed: true,
      }),
    );
    await nextFrame();
    await el.updateComplete;

    expect(a1.parentElement).to.equal(b._subTreeEl);
    expect(a1.selected).to.equal(true);
    expect(a.selected).to.equal(false);
    expect(b.selected).to.equal(false);
  });
});
