import { expect, fixture, html, aTimeout } from "@open-wc/testing";

import "../index.js";

/** @import { TvxTreeView } from "../base/tree-view.js" */

// ─── helpers ───

/** @typedef {{ id: string, label: string, children?: TestItem[], disabled?: boolean }} TestItem */

/** @returns {TestItem[]} */
function sampleItems() {
  return [
    { id: "src", label: "src/", children: [{ id: "index", label: "index.js" }] },
    { id: "readme", label: "README.md" },
  ];
}

/** @returns {TestItem[]} */
function twoParents() {
  return [
    {
      id: "a",
      label: "a/",
      children: [
        { id: "a1", label: "a1.js" },
        { id: "a2", label: "a2.js" },
      ],
    },
    { id: "b", label: "b/", children: [{ id: "b1", label: "b1.js" }] },
  ];
}

/** @param {number} count */
function flatItems(count) {
  return Array.from({ length: count }, (_, i) => ({ id: `i${i}`, label: `item-${i}` }));
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

/** Waits for a render, the frame after it (virtualizer measurement / rAF work), and a re-render.
 * @param {TvxTreeView} el */
async function settle(el) {
  await el.updateComplete;
  await nextFrame();
  await el.updateComplete;
}

/**
 * @param {object[]} items
 * @param {Partial<TvxTreeView>} [props]
 * @returns {Promise<TvxTreeView>}
 */
async function treeFixture(items, props = {}) {
  const el = /** @type {TvxTreeView} */ (
    await fixture(html`<tvx-tree-view style="height: 400px"></tvx-tree-view>`)
  );
  Object.assign(el, props);
  el.items = items;
  await settle(el);
  return el;
}

/** Rendered item rows (placeholders excluded). @param {TvxTreeView} el */
function rows(el) {
  return /** @type {HTMLElement[]} */ ([
    ...(el.shadowRoot?.querySelectorAll(".tree-view__item") ?? []),
  ]);
}

/** @param {Element} rowEl */
function labelOf(rowEl) {
  return rowEl.querySelector(".tree-view__label")?.textContent?.trim();
}

/** @param {TvxTreeView} el */
function labels(el) {
  return rows(el).map(labelOf);
}

/** @param {TvxTreeView} el
 * @param {string} label */
function row(el, label) {
  const found = rows(el).find((r) => labelOf(r) === label);
  if (!found) throw new Error(`no rendered row "${label}"`);
  return found;
}

/** @param {TvxTreeView} el */
function focusedLabel(el) {
  const active = el.shadowRoot?.activeElement;
  return active ? labelOf(active) : undefined;
}

/** @param {TvxTreeView} el
 * @param {string} label */
async function focusRow(el, label) {
  row(el, label).focus();
  await settle(el);
}

/** Keydown on the focused row (or the first row).
 * @param {TvxTreeView} el
 * @param {string} key
 * @param {KeyboardEventInit} [init] */
async function press(el, key, init = {}) {
  const target = el.shadowRoot?.activeElement ?? rows(el)[0];
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, composed: true, cancelable: true, ...init }),
  );
  await settle(el);
}

/** @param {TvxTreeView} el
 * @param {string} label
 * @param {MouseEventInit} [init] */
async function click(el, label, init = {}) {
  row(el, label)
    .querySelector(".tree-view__row")
    ?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, ...init }));
  await settle(el);
}

/** @param {TvxTreeView} el
 * @param {string} label
 * @param {".tree-view__chevron" | ".tree-view__checkbox"} part */
async function clickPart(el, label, part) {
  /** @type {HTMLElement} */ (row(el, label).querySelector(part)).click();
  await settle(el);
}

/** @param {HTMLElement} target
 * @param {string} type */
function onceEvent(target, type) {
  /** @type {any[]} */
  const details = [];
  target.addEventListener(type, (event) => details.push(/** @type {CustomEvent} */ (event).detail));
  return details;
}

// ─── rendering ───

describe("tvx-tree-view — rendering", () => {
  it("sets role=tree and renders one treeitem row per visible item", async () => {
    const el = await treeFixture(sampleItems());
    expect(el.getAttribute("role")).to.equal("tree");
    expect(labels(el)).to.deep.equal(["src/", "README.md"]);
    expect(rows(el).every((r) => r.getAttribute("role") === "treeitem")).to.equal(true);
  });

  it("renders a collapsed branch's children only once it's expanded", async () => {
    const el = await treeFixture(sampleItems());
    el.expansion.expand("src");
    await settle(el);
    expect(labels(el)).to.deep.equal(["src/", "index.js", "README.md"]);
  });

  it("sets aria-level/setsize/posinset/expanded on every row", async () => {
    const el = await treeFixture(sampleItems(), { defaultExpandedItems: ["src"] });
    const src = row(el, "src/");
    const index = row(el, "index.js");
    expect(src.getAttribute("aria-level")).to.equal("1");
    expect(src.getAttribute("aria-setsize")).to.equal("2");
    expect(src.getAttribute("aria-posinset")).to.equal("1");
    expect(src.getAttribute("aria-expanded")).to.equal("true");
    expect(index.getAttribute("aria-level")).to.equal("2");
    expect(index.hasAttribute("aria-expanded")).to.equal(false);
    expect(row(el, "README.md").getAttribute("aria-posinset")).to.equal("2");
  });

  it("labels each row through aria-labelledby", async () => {
    const el = await treeFixture(sampleItems());
    const src = row(el, "src/");
    const label = el.shadowRoot?.getElementById(
      /** @type {string} */ (src.getAttribute("aria-labelledby")),
    );
    expect(label?.textContent?.trim()).to.equal("src/");
  });

  it("reads any data shape through the getItem* accessors", async () => {
    const el = await treeFixture(
      [{ uuid: "1", name: "Inbox", entries: [{ uuid: "2", name: "Invoices" }], locked: true }],
      {
        getItemId: (item) => item.uuid,
        getItemLabel: (item) => item.name,
        getItemChildren: (item) => item.entries,
        isItemDisabled: (item) => !!item.locked,
        defaultExpandedItems: ["1"],
      },
    );
    expect(labels(el)).to.deep.equal(["Inbox", "Invoices"]);
    expect(row(el, "Inbox").getAttribute("aria-disabled")).to.equal("true");
    expect(el.nodes.getItem("2")).to.deep.equal({ uuid: "2", name: "Invoices" });
  });

  it("passes the item and its state to renderItemLeading/Label/Trailing", async () => {
    /** @type {any[]} */
    const states = [];
    const el = await treeFixture(sampleItems(), {
      renderItemLeading: (item, state) => {
        states.push(state);
        return html`<i class="lead">${item.id}</i>`;
      },
      renderItemLabel: (item) => html`<b>${item.label}!</b>`,
      renderItemTrailing: (_item, { expanded }) => (expanded ? "open" : "closed"),
    });
    const src = row(el, "src/!");
    expect(src.querySelector(".lead")?.textContent).to.equal("src");
    expect(src.querySelector(".tree-view__trailing")?.textContent?.trim()).to.equal("closed");
    expect(states.find((s) => s.id === "src")).to.include({
      level: 1,
      expanded: false,
      hasChildren: true,
      selected: false,
    });
  });

  it("keeps expansion and selection by id when .items is reassigned", async () => {
    const el = await treeFixture(sampleItems(), { defaultExpandedItems: ["src"] });
    await click(el, "README.md");
    el.items = sampleItems();
    await settle(el);
    expect(labels(el)).to.deep.equal(["src/", "index.js", "README.md"]);
    expect(row(el, "README.md").getAttribute("aria-selected")).to.equal("true");
  });

  it("tvx-tree-directory-icon swaps its glyph with `expanded`", async () => {
    const icon = /** @type {any} */ (
      await fixture(html`<tvx-tree-directory-icon></tvx-tree-directory-icon>`)
    );
    const closed = icon.shadowRoot.querySelector("path").getAttribute("d");
    icon.expanded = true;
    await icon.updateComplete;
    expect(icon.shadowRoot.querySelector("path").getAttribute("d")).not.to.equal(closed);
  });
});

// ─── virtualization ───

describe("tvx-tree-view — virtualization", () => {
  it("renders only the visible window of a long list", async () => {
    const el = await treeFixture(flatItems(1000));
    const count = rows(el).length;
    expect(count).to.be.greaterThan(5);
    expect(count).to.be.lessThan(100);
  });

  it("renders every row with no-virtualization", async () => {
    const el = await treeFixture(flatItems(300), { noVirtualization: true });
    expect(rows(el).length).to.equal(300);
    expect(el.hasAttribute("no-virtualization")).to.equal(true);
  });

  it("navigation.focusItem() scrolls a far-away row into view and focuses it", async () => {
    const el = await treeFixture(flatItems(1000));
    await el.navigation.focusItem("i700");
    await settle(el);
    expect(focusedLabel(el)).to.equal("item-700");
    expect(el.navigation.getFocused()).to.equal("i700");
    expect(el.scrollTop).to.be.greaterThan(0);
  });

  it("keeps the focused row mounted while it's scrolled out of view", async () => {
    const el = await treeFixture(flatItems(1000));
    await focusRow(el, "item-0");
    el.scrollTop = 20000;
    await settle(el);
    await settle(el);
    expect(labels(el)).to.include("item-0");
    expect(focusedLabel(el)).to.equal("item-0");
  });
});

// ─── expansion ───

describe("tvx-tree-view — expansion", () => {
  it("clicking the chevron toggles and fires tvx-expand-change + tvx-expansion-change", async () => {
    const el = await treeFixture(sampleItems());
    const one = onceEvent(el, "tvx-expand-change");
    const all = onceEvent(el, "tvx-expansion-change");
    await clickPart(el, "src/", ".tree-view__chevron");
    expect(one).to.deep.equal([{ id: "src", expanded: true }]);
    expect([...all[0].expandedItems]).to.deep.equal(["src"]);
    expect(el.expansion.isExpanded("src")).to.equal(true);
  });

  it("clicking the chevron doesn't select the row", async () => {
    const el = await treeFixture(sampleItems());
    await clickPart(el, "src/", ".tree-view__chevron");
    expect(el.selectedItems.size).to.equal(0);
  });

  it("expandAll/collapseAll toggle every branch", async () => {
    const el = await treeFixture(twoParents());
    el.expansion.expandAll();
    await settle(el);
    expect(labels(el)).to.deep.equal(["a/", "a1.js", "a2.js", "b/", "b1.js"]);
    el.expansion.collapseAll();
    await settle(el);
    expect(labels(el)).to.deep.equal(["a/", "b/"]);
  });

  it("expansion.expand/collapse; isExpanded is false for unknown ids and leaves", async () => {
    const el = await treeFixture(sampleItems());
    el.expansion.expand("src");
    expect(el.expansion.isExpanded("src")).to.equal(true);
    el.expansion.collapse("src");
    expect(el.expansion.isExpanded("src")).to.equal(false);
    expect(el.expansion.isExpanded("nope")).to.equal(false);
    el.expansion.expand("readme");
    expect(el.expansion.isExpanded("readme")).to.equal(false);
  });

  it("assigning expandedItems replaces the expansion", async () => {
    const el = await treeFixture(twoParents());
    el.expandedItems = new Set(["a"]);
    await settle(el);
    expect([...el.expandedItems]).to.deep.equal(["a"]);
    el.expandedItems = new Set(["b"]);
    await settle(el);
    expect(labels(el)).to.deep.equal(["a/", "b/", "b1.js"]);
  });
});

describe("tvx-tree-view — defaultExpandedItems/defaultSelectedItems", () => {
  it("apply once the first items exist", async () => {
    const el = await treeFixture(sampleItems(), {
      defaultExpandedItems: ["src"],
      defaultSelectedItems: ["readme"],
    });
    expect(el.expansion.isExpanded("src")).to.equal(true);
    expect([...el.selectedItems]).to.deep.equal(["readme"]);
  });

  it("apply when items are assigned after connecting", async () => {
    const el = await treeFixture([], { defaultExpandedItems: ["src"] });
    el.items = sampleItems();
    await settle(el);
    expect(el.expansion.isExpanded("src")).to.equal(true);
  });

  it("only apply once — later writes have no effect", async () => {
    const el = await treeFixture(sampleItems());
    el.defaultExpandedItems = ["src"];
    el.items = sampleItems();
    await settle(el);
    expect(el.expansion.isExpanded("src")).to.equal(false);
  });
});

// ─── selection ───

describe("tvx-tree-view — single selection (default)", () => {
  it("clicking a row selects it, sets aria-current, and fires tvx-selection-change", async () => {
    const el = await treeFixture(sampleItems());
    const events = onceEvent(el, "tvx-selection-change");
    await click(el, "README.md");
    expect([...events[0].selectedItems]).to.deep.equal(["readme"]);
    expect(row(el, "README.md").getAttribute("aria-selected")).to.equal("true");
    expect(row(el, "README.md").getAttribute("aria-current")).to.equal("true");
  });

  it("selecting a second row replaces the first", async () => {
    const el = await treeFixture(sampleItems());
    await click(el, "README.md");
    await click(el, "src/");
    expect([...el.selectedItems]).to.deep.equal(["src"]);
    expect(row(el, "README.md").getAttribute("aria-selected")).to.equal("false");
  });

  it("selecting a nested row doesn't select its ancestors", async () => {
    const el = await treeFixture(sampleItems(), { defaultExpandedItems: ["src"] });
    await click(el, "index.js");
    expect([...el.selectedItems]).to.deep.equal(["index"]);
  });

  it("modifier keys are ignored outside multi-select", async () => {
    const el = await treeFixture(sampleItems());
    await click(el, "README.md");
    await click(el, "src/", { ctrlKey: true });
    expect([...el.selectedItems]).to.deep.equal(["src"]);
  });

  it("selection.select/deselect; deselecting an unselected id is a no-op", async () => {
    const el = await treeFixture(sampleItems());
    el.selection.select("readme");
    const events = onceEvent(el, "tvx-selection-change");
    el.selection.deselect("src");
    expect(events).to.have.length(0);
    expect([...el.selectedItems]).to.deep.equal(["readme"]);
    el.selection.deselect("readme");
    expect(el.selectedItems.size).to.equal(0);
  });

  it("disableSelection: clicks still toggle branches but never select", async () => {
    const el = await treeFixture(sampleItems(), { disableSelection: true });
    const events = onceEvent(el, "tvx-selection-change");
    await click(el, "src/");
    expect(el.expansion.isExpanded("src")).to.equal(true);
    expect(events).to.have.length(0);
  });
});

describe("tvx-tree-view — multi-select", () => {
  /** A..E, flat. */
  /** @returns {TestItem[]} */
  const letters = () =>
    ["Alpha", "Beta", "Cherry", "Delta", "Echo"].map((label) => ({ id: label[0], label }));

  it("sets aria-multiselectable", async () => {
    const el = await treeFixture(letters(), { multiSelect: true });
    expect(el.getAttribute("aria-multiselectable")).to.not.equal(null);
  });

  it("a plain click replaces the whole selection", async () => {
    const el = await treeFixture(letters(), { multiSelect: true });
    await click(el, "Alpha");
    await click(el, "Beta", { ctrlKey: true });
    await click(el, "Cherry");
    expect([...el.selectedItems]).to.deep.equal(["C"]);
  });

  it("ctrl/cmd+click toggles one item without touching the rest", async () => {
    const el = await treeFixture(letters(), { multiSelect: true });
    await click(el, "Alpha");
    await click(el, "Cherry", { ctrlKey: true });
    await click(el, "Delta", { metaKey: true });
    expect([...el.selectedItems].sort()).to.deep.equal(["A", "C", "D"]);
    await click(el, "Cherry", { ctrlKey: true });
    expect([...el.selectedItems].sort()).to.deep.equal(["A", "D"]);
  });

  it("shift+click selects the visible range from the anchor", async () => {
    const el = await treeFixture(letters(), { multiSelect: true });
    await click(el, "Beta");
    await click(el, "Delta", { shiftKey: true });
    expect([...el.selectedItems].sort()).to.deep.equal(["B", "C", "D"]);
  });

  it("shift+click merges into the existing selection", async () => {
    const el = await treeFixture(letters(), { multiSelect: true });
    await click(el, "Alpha");
    await click(el, "Delta", { ctrlKey: true });
    await click(el, "Echo", { shiftKey: true });
    expect([...el.selectedItems].sort()).to.deep.equal(["A", "D", "E"]);
  });

  it("shift+click on a selected item shrinks the range but keeps that item", async () => {
    const el = await treeFixture(letters(), { multiSelect: true });
    await click(el, "Alpha");
    await click(el, "Echo", { shiftKey: true });
    await click(el, "Cherry", { shiftKey: true });
    expect([...el.selectedItems].sort()).to.deep.equal(["A", "B", "C"]);
  });

  it("disabled items are skipped by clicks and shift ranges", async () => {
    const items = letters();
    items[2] = { ...items[2], disabled: true };
    const el = await treeFixture(items, { multiSelect: true });
    await click(el, "Alpha");
    await click(el, "Echo", { shiftKey: true });
    expect([...el.selectedItems].sort()).to.deep.equal(["A", "B", "D", "E"]);
    el.selection.select("C");
    expect(el.selectedItems.has("C")).to.equal(false);
  });
});

describe("tvx-tree-view — checkboxSelection", () => {
  it("renders a checkbox per row, checked to match the selection", async () => {
    const el = await treeFixture(sampleItems(), {
      checkboxSelection: true,
      defaultSelectedItems: ["readme"],
    });
    const checkbox = /** @type {any} */ (row(el, "README.md").querySelector("md-checkbox"));
    expect(rows(el).every((r) => r.querySelector("md-checkbox"))).to.equal(true);
    expect(checkbox.checked).to.equal(true);
  });

  it("renders no checkbox with disableSelection", async () => {
    const el = await treeFixture(sampleItems(), {
      checkboxSelection: true,
      disableSelection: true,
    });
    expect(el.shadowRoot?.querySelector("md-checkbox")).to.equal(null);
  });

  it("a row click only toggles expansion — the checkbox does the selecting", async () => {
    const el = await treeFixture(sampleItems(), { checkboxSelection: true });
    await click(el, "src/");
    expect(el.expansion.isExpanded("src")).to.equal(true);
    expect(el.selectedItems.size).to.equal(0);
    await clickPart(el, "README.md", ".tree-view__checkbox");
    expect([...el.selectedItems]).to.deep.equal(["readme"]);
  });

  it("checking a branch cascades to its whole subtree, and unchecking clears it", async () => {
    const el = await treeFixture(twoParents(), { checkboxSelection: true, multiSelect: true });
    await clickPart(el, "a/", ".tree-view__checkbox");
    expect([...el.selectedItems].sort()).to.deep.equal(["a", "a1", "a2"]);
    await clickPart(el, "a/", ".tree-view__checkbox");
    expect(el.selectedItems.size).to.equal(0);
  });

  it("checking every child checks the parent; checking some makes it indeterminate", async () => {
    const el = await treeFixture(twoParents(), {
      checkboxSelection: true,
      multiSelect: true,
      defaultExpandedItems: ["a"],
    });
    await clickPart(el, "a1.js", ".tree-view__checkbox");
    const parent = /** @type {any} */ (row(el, "a/").querySelector("md-checkbox"));
    expect(parent.indeterminate).to.equal(true);
    expect(parent.checked).to.equal(false);

    await clickPart(el, "a2.js", ".tree-view__checkbox");
    expect(el.selectedItems.has("a")).to.equal(true);
    const updated = /** @type {any} */ (row(el, "a/").querySelector("md-checkbox"));
    expect(updated.checked).to.equal(true);
    expect(updated.indeterminate).to.equal(false);
  });

  it("Space cascades like a checkbox click", async () => {
    const el = await treeFixture(twoParents(), { checkboxSelection: true, multiSelect: true });
    await focusRow(el, "b/");
    await press(el, " ");
    expect([...el.selectedItems].sort()).to.deep.equal(["b", "b1"]);
    expect(el.expansion.isExpanded("b")).to.equal(false);
  });
});

// ─── keyboard ───

describe("tvx-tree-view — keyboard navigation", () => {
  it("exactly one row is a Tab stop — the first one by default", async () => {
    const el = await treeFixture(sampleItems());
    const tabStops = rows(el).filter((r) => r.tabIndex === 0);
    expect(tabStops.map(labelOf)).to.deep.equal(["src/"]);
  });

  it("ArrowDown/ArrowUp move focus and the Tab stop between visible rows", async () => {
    const el = await treeFixture(sampleItems());
    await focusRow(el, "src/");
    await press(el, "ArrowDown");
    expect(focusedLabel(el)).to.equal("README.md");
    expect(
      rows(el)
        .filter((r) => r.tabIndex === 0)
        .map(labelOf),
    ).to.deep.equal(["README.md"]);
    await press(el, "ArrowUp");
    expect(focusedLabel(el)).to.equal("src/");
  });

  it("Home/End jump to the first/last visible row", async () => {
    const el = await treeFixture(twoParents(), { defaultExpandedItems: ["b"] });
    await focusRow(el, "a/");
    await press(el, "End");
    expect(focusedLabel(el)).to.equal("b1.js");
    await press(el, "Home");
    expect(focusedLabel(el)).to.equal("a/");
  });

  it("ArrowRight expands a collapsed branch, then moves into its first child", async () => {
    const el = await treeFixture(sampleItems());
    await focusRow(el, "src/");
    await press(el, "ArrowRight");
    expect(el.expansion.isExpanded("src")).to.equal(true);
    expect(focusedLabel(el)).to.equal("src/");
    await press(el, "ArrowRight");
    expect(focusedLabel(el)).to.equal("index.js");
  });

  it("ArrowLeft collapses an expanded branch, then moves to the parent", async () => {
    const el = await treeFixture(sampleItems(), { defaultExpandedItems: ["src"] });
    await focusRow(el, "index.js");
    await press(el, "ArrowLeft");
    expect(focusedLabel(el)).to.equal("src/");
    await press(el, "ArrowLeft");
    expect(el.expansion.isExpanded("src")).to.equal(false);
  });

  it("Backspace moves focus to the parent", async () => {
    const el = await treeFixture(sampleItems(), { defaultExpandedItems: ["src"] });
    await focusRow(el, "index.js");
    await press(el, "Backspace");
    expect(focusedLabel(el)).to.equal("src/");
  });

  it("typeahead focuses the next row whose label starts with the typed text", async () => {
    const el = await treeFixture(sampleItems());
    await focusRow(el, "src/");
    await press(el, "r");
    expect(focusedLabel(el)).to.equal("README.md");
  });

  it("Enter toggles a branch without selecting it, and is a no-op on a leaf", async () => {
    const el = await treeFixture(sampleItems());
    await focusRow(el, "src/");
    await press(el, "Enter");
    expect(el.expansion.isExpanded("src")).to.equal(true);
    expect(el.selectedItems.size).to.equal(0);
    await focusRow(el, "README.md");
    await press(el, "Enter");
    expect(el.selectedItems.size).to.equal(0);
  });

  it("Space selects without touching expansion", async () => {
    const el = await treeFixture(sampleItems());
    await focusRow(el, "src/");
    await press(el, " ");
    expect([...el.selectedItems]).to.deep.equal(["src"]);
    expect(el.expansion.isExpanded("src")).to.equal(false);
  });

  it("Space does nothing with disableSelection", async () => {
    const el = await treeFixture(sampleItems(), { disableSelection: true });
    await focusRow(el, "README.md");
    await press(el, " ");
    expect(el.selectedItems.size).to.equal(0);
  });

  it("focus can move past a disabled row, but Enter/Space there do nothing", async () => {
    const items = sampleItems();
    items[0] = { ...items[0], disabled: true };
    const el = await treeFixture(items);
    await el.navigation.focusItem("src");
    await settle(el);
    await press(el, " ");
    await press(el, "Enter");
    expect(el.selectedItems.size).to.equal(0);
    expect(el.expansion.isExpanded("src")).to.equal(false);
    await press(el, "ArrowDown");
    expect(focusedLabel(el)).to.equal("README.md");
  });

  it("PageDown/PageUp jump by about a viewport of rows", async () => {
    const el = await treeFixture(flatItems(200));
    await focusRow(el, "item-0");
    await press(el, "PageDown");
    const afterDown = Number(focusedLabel(el)?.split("-")[1]);
    expect(afterDown).to.be.greaterThan(3);
    await press(el, "PageUp");
    expect(focusedLabel(el)).to.equal("item-0");
  });

  it("Shift+ArrowDown extends the selection like shift+click; a plain ArrowDown doesn't select", async () => {
    const el = await treeFixture(flatItems(5), { multiSelect: true });
    await click(el, "item-0");
    await focusRow(el, "item-0");
    await press(el, "ArrowDown", { shiftKey: true });
    await press(el, "ArrowDown", { shiftKey: true });
    expect([...el.selectedItems].sort()).to.deep.equal(["i0", "i1", "i2"]);
    await press(el, "ArrowDown");
    expect([...el.selectedItems].sort()).to.deep.equal(["i0", "i1", "i2"]);
  });
});

// ─── async loading ───

describe("tvx-tree-view — dataSource", () => {
  it("fetches the root behind a loading row when no .items are set", async () => {
    /** @type {(items: object[]) => void} */
    let resolveRoot = () => {};
    const el = await treeFixture([], {
      dataSource: {
        getTreeItems: () => new Promise((resolve) => (resolveRoot = resolve)),
        getChildrenCount: (item) => (item.id === "src" ? 2 : 0),
      },
    });
    el.items = undefined;
    await settle(el);
    expect(el.shadowRoot?.querySelector(".tree-view__placeholder")).to.exist;
    await aTimeout(20);
    expect(el.shadowRoot?.querySelector(".tree-view__live-region")?.textContent).to.equal(
      "Loading…",
    );

    const loaded = onceEvent(el, "tvx-children-loaded");
    resolveRoot([
      { id: "src", label: "src/" },
      { id: "readme", label: "README.md" },
    ]);
    await aTimeout(0);
    await settle(el);
    expect(el.shadowRoot?.querySelector(".tree-view__placeholder")).to.equal(null);
    expect(labels(el)).to.deep.equal(["src/", "README.md"]);
    expect(row(el, "src/").getAttribute("aria-expanded")).to.equal("false");
    expect(row(el, "README.md").hasAttribute("aria-expanded")).to.equal(false);
    expect(loaded[0]).to.include({ id: null, item: null });
  });

  it("treats pre-set .items as the root batch — no root fetch", async () => {
    let rootCalls = 0;
    const el = await treeFixture([{ id: "src", label: "src/" }], {
      dataSource: {
        getTreeItems: (parent) => {
          if (!parent) rootCalls++;
          return Promise.resolve([]);
        },
        getChildrenCount: () => 2,
      },
    });
    await aTimeout(20);
    expect(rootCalls).to.equal(0);
    expect(row(el, "src/").getAttribute("aria-expanded")).to.equal("false");
  });

  it("a known child count shows capped skeleton rows, announces it, then renders the children", async () => {
    /** @type {(items: object[]) => void} */
    let resolveChildren = () => {};
    const el = await treeFixture([{ id: "src", label: "src/" }], {
      dataSource: {
        getTreeItems: () => new Promise((resolve) => (resolveChildren = resolve)),
        getChildrenCount: (item) => (item.id === "src" ? 50 : 0),
      },
    });
    const loaded = onceEvent(el, "tvx-children-loaded");
    el.expansion.expand("src");
    await settle(el);
    expect(el.shadowRoot?.querySelectorAll("md-skeleton").length).to.equal(8);
    await aTimeout(20);
    expect(el.shadowRoot?.querySelector(".tree-view__live-region")?.textContent).to.equal(
      "Loading 50 items.",
    );

    resolveChildren([{ id: "a", label: "a.js" }]);
    await aTimeout(0);
    await settle(el);
    expect(el.shadowRoot?.querySelector("md-skeleton")).to.equal(null);
    expect(labels(el)).to.deep.equal(["src/", "a.js"]);
    expect(loaded[0].id).to.equal("src");
    expect(loaded[0].items).to.deep.equal([{ id: "a", label: "a.js" }]);
  });

  it("an unknown child count shows a single spinner row", async () => {
    const el = await treeFixture([{ id: "src", label: "src/" }], {
      dataSource: {
        getTreeItems: () => new Promise(() => {}),
        getChildrenCount: () => undefined,
      },
    });
    el.expansion.expand("src");
    await settle(el);
    expect(el.shadowRoot?.querySelectorAll(".tree-view__placeholder").length).to.equal(1);
    expect(el.shadowRoot?.querySelector("md-progress-circular")).to.exist;
  });

  it("an empty result turns the branch into a leaf and announces it", async () => {
    const el = await treeFixture([{ id: "empty", label: "empty/" }], {
      dataSource: { getTreeItems: async () => [], getChildrenCount: () => undefined },
    });
    el.expansion.expand("empty");
    await aTimeout(20);
    await settle(el);
    expect(row(el, "empty/").hasAttribute("aria-expanded")).to.equal(false);
    expect(el.expandedItems.has("empty")).to.equal(false);
    expect(el.shadowRoot?.querySelector(".tree-view__live-region")?.textContent).to.equal(
      "empty/ is empty.",
    );
  });

  it("a leaf (child count 0) never fetches", async () => {
    let calls = 0;
    const el = await treeFixture([{ id: "leaf", label: "leaf" }], {
      dataSource: {
        getTreeItems: async () => {
          calls++;
          return [];
        },
        getChildrenCount: () => 0,
      },
    });
    el.expansion.expand("leaf");
    await aTimeout(20);
    expect(calls).to.equal(0);
  });

  it("a rejected fetch fires tvx-load-error and is retried on the next expand", async () => {
    let calls = 0;
    const el = await treeFixture([{ id: "src", label: "src/" }], {
      dataSource: {
        getTreeItems: async () => {
          calls++;
          if (calls === 1) throw new Error("offline");
          return [{ id: "a", label: "a.js" }];
        },
        getChildrenCount: () => 1,
      },
    });
    const errors = onceEvent(el, "tvx-load-error");
    el.expansion.expand("src");
    await aTimeout(20);
    expect(errors[0].id).to.equal("src");
    expect(errors[0].error.message).to.equal("offline");

    el.expansion.collapse("src");
    el.expansion.expand("src");
    await aTimeout(20);
    await settle(el);
    expect(calls).to.equal(2);
    expect(labels(el)).to.deep.equal(["src/", "a.js"]);
  });

  it("re-fetches expanded lazy branches after .items is reassigned", async () => {
    let calls = 0;
    const el = await treeFixture([{ id: "src", label: "src/" }], {
      dataSource: {
        getTreeItems: async () => {
          calls++;
          return [{ id: "a", label: "a.js" }];
        },
        getChildrenCount: () => 1,
      },
    });
    el.expansion.expand("src");
    await aTimeout(20);
    el.items = [{ id: "src", label: "src/" }];
    await aTimeout(20);
    await settle(el);
    expect(calls).to.equal(2);
    expect(labels(el)).to.deep.equal(["src/", "a.js"]);
  });
});

// ─── open in new tab ───

describe("tvx-tree-view — open in new tab", () => {
  it("Ctrl+Enter fires cancelable tvx-open when getHref returns nothing", async () => {
    const el = await treeFixture(sampleItems());
    const opened = onceEvent(el, "tvx-open");
    await focusRow(el, "README.md");
    await press(el, "Enter", { ctrlKey: true });
    expect(opened).to.have.length(1);
    expect(opened[0]).to.include({ id: "readme", newTab: true });
    expect(opened[0].item).to.deep.equal({ id: "readme", label: "README.md" });
  });

  it("opens getHref's URL directly, and never a javascript: URL", async () => {
    const original = window.open;
    /** @type {string[]} */
    const urls = [];
    window.open = /** @type {any} */ ((/** @type {string} */ url) => urls.push(url));
    try {
      const el = await treeFixture(sampleItems(), {
        getHref: (item) =>
          item.id === "readme" ? "https://example.com/readme" : "javascript:alert(1)",
      });
      const opened = onceEvent(el, "tvx-open");
      await focusRow(el, "README.md");
      await press(el, "Enter", { metaKey: true });
      await focusRow(el, "src/");
      await press(el, "Enter", { ctrlKey: true });
      expect(urls).to.deep.equal(["https://example.com/readme"]);
      expect(opened.map((d) => d.id)).to.deep.equal(["src"]);
    } finally {
      window.open = original;
    }
  });

  it("middle-click opens too", async () => {
    const el = await treeFixture(sampleItems());
    const opened = onceEvent(el, "tvx-open");
    row(el, "README.md").dispatchEvent(
      new MouseEvent("auxclick", { button: 1, bubbles: true, composed: true, cancelable: true }),
    );
    expect(opened.map((d) => d.id)).to.deep.equal(["readme"]);
  });
});

// ─── reordering ───

describe("tvx-tree-view — reordering", () => {
  it("makes the tree a drag source only while reordering is on", async () => {
    const el = await treeFixture(sampleItems());
    expect(el.getAttribute("draggable")).to.equal(null);
    el.reordering = true;
    await settle(el);
    expect(el.getAttribute("draggable")).to.equal("true");
    el.reordering = false;
    await settle(el);
    expect(el.getAttribute("draggable")).to.equal(null);
  });

  it("Alt+ArrowDown/Up move the focused item among its siblings, keep focus, and fire the event", async () => {
    const el = await treeFixture(sampleItems(), { reordering: true });
    const moves = onceEvent(el, "tvx-item-position-change");
    await focusRow(el, "src/");
    await press(el, "ArrowDown", { altKey: true });
    expect(labels(el)).to.deep.equal(["README.md", "src/"]);
    expect(focusedLabel(el)).to.equal("src/");
    expect(moves[0]).to.deep.equal({
      id: "src",
      oldPosition: { parentId: null, index: 0 },
      newPosition: { parentId: null, index: 1 },
    });
    await press(el, "ArrowUp", { altKey: true });
    expect(labels(el)).to.deep.equal(["src/", "README.md"]);
  });

  it("moves inside a branch report the parent id", async () => {
    const el = await treeFixture(twoParents(), { reordering: true, defaultExpandedItems: ["a"] });
    const moves = onceEvent(el, "tvx-item-position-change");
    await focusRow(el, "a2.js");
    await press(el, "ArrowUp", { altKey: true });
    expect(labels(el)).to.deep.equal(["a/", "a2.js", "a1.js", "b/"]);
    expect(moves[0].newPosition).to.deep.equal({ parentId: "a", index: 0 });
  });

  it("preventDefault() on tvx-item-position-change vetoes the move", async () => {
    const el = await treeFixture(sampleItems(), { reordering: true });
    el.addEventListener("tvx-item-position-change", (event) => event.preventDefault());
    await focusRow(el, "src/");
    await press(el, "ArrowDown", { altKey: true });
    expect(labels(el)).to.deep.equal(["src/", "README.md"]);
  });

  it("Alt+Arrow does nothing when reordering is off, for non-reorderable items, or for disabled items", async () => {
    const items = [...sampleItems(), { id: "locked", label: "locked", disabled: true }];
    const el = await treeFixture(items);
    await focusRow(el, "src/");
    await press(el, "ArrowDown", { altKey: true });
    expect(labels(el)).to.deep.equal(["src/", "README.md", "locked"]);

    el.reordering = true;
    el.isItemReorderable = (item) => item.id !== "src";
    await settle(el);
    await focusRow(el, "src/");
    await press(el, "ArrowDown", { altKey: true });
    expect(labels(el)).to.deep.equal(["src/", "README.md", "locked"]);

    await el.navigation.focusItem("locked");
    await settle(el);
    await press(el, "ArrowUp", { altKey: true });
    expect(labels(el)).to.deep.equal(["src/", "README.md", "locked"]);
  });

  it("keeps the selection on a moved item", async () => {
    const el = await treeFixture(sampleItems(), { reordering: true });
    await click(el, "src/");
    await focusRow(el, "src/");
    await press(el, "ArrowDown", { altKey: true });
    expect([...el.selectedItems]).to.deep.equal(["src"]);
    expect(row(el, "src/").getAttribute("aria-selected")).to.equal("true");
  });
});
