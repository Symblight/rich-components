import { expect, fixture, html } from "@open-wc/testing";

import "../index.js";

describe("tvx-tree-item", () => {
  it("sets role=treeitem and aria-labelledby pointing at its own label element", async () => {
    const el = await fixture(html`<tvx-tree-item key="a" label="Alpha"></tvx-tree-item>`);
    expect(el.getAttribute("role")).to.equal("treeitem");
    const labelledBy = el.getAttribute("aria-labelledby");
    expect(labelledBy).to.be.a("string");
    const labelEl = el.shadowRoot.getElementById(labelledBy);
    expect(labelEl.textContent.trim()).to.equal("Alpha");
  });

  it("computes aria-level from tvx-tree-item nesting depth, through a tvx-item-sub-tree wrapper", async () => {
    const el = await fixture(html`
      <tvx-tree-item key="src" label="src/">
        <tvx-item-sub-tree>
          <tvx-tree-item key="child" label="child.js"></tvx-tree-item>
        </tvx-item-sub-tree>
      </tvx-tree-item>
    `);
    const child = el.querySelector("tvx-tree-item");
    expect(el.getAttribute("aria-level")).to.equal("1");
    expect(child.getAttribute("aria-level")).to.equal("2");
  });

  it("auto-slots a declarative tvx-item-sub-tree onto the internal sub-tree slot", async () => {
    const el = await fixture(html`
      <tvx-tree-item key="src" label="src/">
        <tvx-item-sub-tree>
          <tvx-tree-item key="child" label="child.js"></tvx-tree-item>
        </tvx-item-sub-tree>
      </tvx-tree-item>
    `);
    const subTree = el.querySelector("tvx-item-sub-tree");
    expect(subTree.getAttribute("slot")).to.equal("sub-tree");
    expect(subTree.getAttribute("role")).to.equal("group");
  });

  it("infers hasChildren from a real tvx-item-sub-tree child, with no has-children attribute needed", async () => {
    const el = await fixture(html`
      <tvx-tree-item key="src" label="src/">
        <tvx-item-sub-tree>
          <tvx-tree-item key="child" label="child.js"></tvx-tree-item>
        </tvx-item-sub-tree>
      </tvx-tree-item>
    `);
    expect(el.hasChildren).to.equal(true);
    expect(el.shadowRoot.querySelector(".tree-item__chevron svg")).to.exist;

    const subTree = el.querySelector("tvx-item-sub-tree");
    expect(subTree.hidden).to.equal(true);

    el.expanded = true;
    await el.updateComplete;
    expect(subTree.hidden).to.equal(false);
    const slotted = el.shadowRoot.querySelector("slot[name='sub-tree']").assignedElements();
    expect(slotted).to.deep.equal([subTree]);
  });

  it("a leaf with no nested tvx-tree-item children stays hasChildren=false, no chevron", async () => {
    const el = await fixture(html`<tvx-tree-item key="leaf" label="Leaf"></tvx-tree-item>`);
    expect(el.hasChildren).to.equal(false);
    expect(el.shadowRoot.querySelector(".tree-item__chevron svg")).to.equal(null);
  });

  it("aria-expanded exists only when hasChildren, and tracks expanded", async () => {
    const leaf = await fixture(html`<tvx-tree-item key="leaf" label="Leaf"></tvx-tree-item>`);
    expect(leaf.hasAttribute("aria-expanded")).to.equal(false);

    const branch = await fixture(
      html`<tvx-tree-item key="branch" label="Branch" has-children></tvx-tree-item>`,
    );
    expect(branch.getAttribute("aria-expanded")).to.equal("false");
    branch.expanded = true;
    await branch.updateComplete;
    expect(branch.getAttribute("aria-expanded")).to.equal("true");
  });

  it("aria-selected always reflects selected, true or false", async () => {
    const el = await fixture(html`<tvx-tree-item key="a" label="A"></tvx-tree-item>`);
    expect(el.getAttribute("aria-selected")).to.equal("false");
    el.selected = true;
    await el.updateComplete;
    expect(el.getAttribute("aria-selected")).to.equal("true");
  });

  it("renders a chevron only when it has children, aria-hidden", async () => {
    const leaf = await fixture(html`<tvx-tree-item key="leaf" label="Leaf"></tvx-tree-item>`);
    expect(leaf.shadowRoot.querySelector(".tree-item__chevron svg")).to.equal(null);

    const branch = await fixture(
      html`<tvx-tree-item key="branch" label="Branch" has-children></tvx-tree-item>`,
    );
    const chevron = branch.shadowRoot.querySelector(".tree-item__chevron");
    expect(chevron.getAttribute("aria-hidden")).to.equal("true");
    expect(chevron.querySelector("svg")).to.exist;
  });

  it("slotted chevron content replaces the default icon; leaves fall back to it untouched", async () => {
    const branch = await fixture(
      html`<tvx-tree-item key="branch" label="Branch" has-children>
        <span slot="chevron" class="my-icon"></span>
      </tvx-tree-item>`,
    );
    const slot = branch.shadowRoot.querySelector(".tree-item__chevron slot[name='chevron']");
    expect(slot.assignedElements()).to.have.length(1);
    expect(slot.assignedElements()[0]).to.have.class("my-icon");
  });

  it("dispatches tvx-tree-item-toggle from the chevron, not tvx-tree-item-activate", async () => {
    const el = await fixture(
      html`<tvx-tree-item key="branch" label="Branch" has-children></tvx-tree-item>`,
    );
    let toggled = false;
    let activated = false;
    el.addEventListener("tvx-tree-item-toggle", () => (toggled = true));
    el.addEventListener("tvx-tree-item-activate", () => (activated = true));
    el.shadowRoot.querySelector(".tree-item__chevron").click();
    expect(toggled).to.equal(true);
    expect(activated).to.equal(false);
  });

  it("dispatches tvx-tree-item-activate from a plain row click", async () => {
    const el = await fixture(html`<tvx-tree-item key="a" label="A"></tvx-tree-item>`);
    let detail;
    el.addEventListener("tvx-tree-item-activate", (event) => (detail = event.detail));
    el.shadowRoot.querySelector(".tree-item__row").click();
    expect(detail.item).to.equal(el);
  });

  it("a loading placeholder never activates", async () => {
    const el = await fixture(html`<tvx-tree-item key="a__loading" loading></tvx-tree-item>`);
    let activated = false;
    el.addEventListener("tvx-tree-item-activate", () => (activated = true));
    el.shadowRoot.querySelector(".tree-item__row").click();
    expect(activated).to.equal(false);
  });
});
