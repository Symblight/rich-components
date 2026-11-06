import { expect, fixture, html } from "@open-wc/testing";

import "../../index.js";

/** @typedef {import("../../components/code-editor/code-editor.js").CdxCodeEditor} CdxCodeEditor */

const lines = (/** @type {number} */ count, /** @type {string} */ prefix = "line") =>
  Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`);

const BASE = [
  "first",
  "second",
  "removed one",
  "removed two",
  "third",
  "old word here",
  "fourth",
  "fifth",
].join("\n");

const CURRENT = [
  "first",
  "second",
  "third",
  "new word here",
  "fourth",
  "added one",
  "added two",
  "fifth",
].join("\n");

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/** Spacers are measured a frame after a change, and adding them is one more view update. */
async function settled(/** @type {CdxCodeEditor} */ el) {
  await el.updateComplete;
  for (let i = 0; i < 4; i++) await frame();
}

const panes = (/** @type {CdxCodeEditor} */ el) => [
  .../** @type {ShadowRoot} */ (el.shadowRoot).querySelectorAll(".cm-editor"),
];

const textLines = (/** @type {Element} */ pane) =>
  [...pane.querySelectorAll(".cm-line")].map((line) => line.textContent);

const lineTop = (/** @type {Element} */ pane, /** @type {string} */ text) => {
  const line = [...pane.querySelectorAll(".cm-line")].find((el) => el.textContent === text);
  if (!line) throw new Error(`no line "${text}"`);
  return line.getBoundingClientRect().top;
};

const expectAligned = (/** @type {CdxCodeEditor} */ el, /** @type {string[]} */ texts) => {
  const [left, right] = panes(el);
  for (const text of texts) {
    expect(lineTop(left, text), `"${text}" on both sides`).to.be.closeTo(lineTop(right, text), 1);
  }
};

const UNCHANGED = ["first", "second", "third", "fourth", "fifth"];

/** @param {import("lit").TemplateResult} template */
const mount = async (template) => {
  const el = /** @type {CdxCodeEditor} */ (await fixture(template));
  await settled(el);
  return el;
};

describe("diff-layout", () => {
  it("is unified by default: one pane, removed lines inline", async () => {
    const el = await mount(
      html`<cdx-code-editor .value=${CURRENT} .reviewBase=${BASE}></cdx-code-editor>`,
    );

    expect(panes(el)).to.have.length(1);
    expect(panes(el)[0].querySelector(".cm-deletedChunk")).to.exist;
  });

  for (const [name, data] of /** @type {const} */ ([
    ["reviewBase", "reviewBase"],
    ["baseline", "baseline"],
  ])) {
    it(`split shows the ${name} text left, the current text right, with lines aligned`, async () => {
      const el = await mount(html`
        <cdx-code-editor
          diff-layout="split"
          .value=${CURRENT}
          .reviewBase=${data === "reviewBase" ? BASE : null}
          .baseline=${data === "baseline" ? BASE : null}
        ></cdx-code-editor>
      `);

      const [left, right] = panes(el);
      expect(panes(el)).to.have.length(2);
      expect(textLines(left)).to.deep.equal(BASE.split("\n"));
      expect(textLines(right)).to.deep.equal(CURRENT.split("\n"));
      expect(left.getBoundingClientRect().right).to.be.at.most(
        right.getBoundingClientRect().left + 1,
      );
      expectAligned(el, UNCHANGED);
    });
  }

  it("split without anything to compare is the plain editor", async () => {
    const el = await mount(
      html`<cdx-code-editor diff-layout="split" .value=${CURRENT}></cdx-code-editor>`,
    );

    expect(panes(el)).to.have.length(1);
  });

  it("does not show removed lines inline on the right", async () => {
    const el = await mount(
      html`<cdx-code-editor
        diff-layout="split"
        .value=${CURRENT}
        .reviewBase=${BASE}
      ></cdx-code-editor>`,
    );

    const deleted = panes(el)[1].querySelector(".cm-deletedChunk");
    expect(deleted?.getBoundingClientRect().height ?? 0).to.equal(0);
  });

  it("marks what changed on each side: lines and the words inside them", async () => {
    const el = await mount(
      html`<cdx-code-editor
        diff-layout="split"
        .value=${CURRENT}
        .baseline=${BASE}
      ></cdx-code-editor>`,
    );

    const [left, right] = panes(el);
    const removed = [...left.querySelectorAll(".cdx-line-removed")].map((line) => line.textContent);
    expect(removed).to.deep.equal(["removed one", "removed two", "old word here"]);
    const added = [...right.querySelectorAll(".cdx-line-added")].map((line) => line.textContent);
    expect(added).to.deep.equal(["new word here", "added one", "added two"]);
    expect(left.querySelector(".cdx-text-removed")?.textContent).to.equal("old");
    expect(right.querySelector(".cdx-text-added")?.textContent).to.equal("new");
  });

  it("marks words only where part of a line changed, not lines changed whole", async () => {
    const base = ["first", "old word here", "  gone one", "  gone two", "last"].join("\n");
    const current = ["first", "new word here", "last"].join("\n");
    const el = await mount(
      html`<cdx-code-editor
        diff-layout="split"
        .value=${current}
        .baseline=${base}
      ></cdx-code-editor>`,
    );
    const texts = (/** @type {Element} */ pane, /** @type {string} */ name) =>
      [...pane.querySelectorAll(name)].map((mark) => mark.textContent);

    const [left, right] = panes(el);

    expect(texts(left, ".cdx-text-removed")).to.deep.equal(["old"]);
    expect(texts(left, ".cdx-line-removed")).to.include("  gone one");
    expect(texts(right, ".cdx-text-added")).to.deep.equal(["new"]);
  });

  it("marks no words in a chunk whose lines changed whole", async () => {
    const base = ["first", "  aaaa bbbb", "  cccc dddd", "last"].join("\n");
    const current = ["first", "  xxxx yyyy", "  zzzz wwww", "last"].join("\n");
    const el = await mount(
      html`<cdx-code-editor
        diff-layout="split"
        .value=${current}
        .baseline=${base}
      ></cdx-code-editor>`,
    );

    const [left, right] = panes(el);

    expect(left.querySelectorAll(".cdx-line-removed")).to.have.length(2);
    expect(right.querySelectorAll(".cdx-line-added")).to.have.length(2);
    expect(left.querySelectorAll(".cdx-text-removed").length).to.equal(0);
    expect(right.querySelectorAll(".cdx-text-added").length).to.equal(0);
  });

  it("stays aligned around comment widgets and wrapped lines", async () => {
    const long = `${"wrapped ".repeat(60)}end`;
    const base = ["first", long, "second", "gone", "third", "tail"].join("\n");
    const current = ["first", long, "second", "third", "tail"].join("\n");
    const el = await mount(html`
      <cdx-code-editor
        style="inline-size: 40rem"
        wrap
        diff-layout="split"
        .value=${current}
        .baseline=${base}
      >
        <cdx-comments slot="comments" mode="single"></cdx-comments>
      </cdx-code-editor>
    `);

    el.comments.open(1);
    await settled(el);

    expectAligned(el, ["first", long, "second", "third"]);
  });

  it("switches both ways on the same view, keeping undo and the caret", async () => {
    const el = await mount(
      html`<cdx-code-editor .value=${CURRENT} .reviewBase=${BASE}></cdx-code-editor>`,
    );
    const view = el.view;
    el.doc.replace(0, 5, "FIRST");
    el.selection.set(3);

    el.setAttribute("diff-layout", "split");
    await settled(el);
    expect(panes(el)).to.have.length(2);
    expect(el.view).to.equal(view);
    expect(el.selection.get()?.main.head).to.equal(3);

    el.removeAttribute("diff-layout");
    await settled(el);
    expect(panes(el)).to.have.length(1);
    expect(el.view).to.equal(view);
    expect(el.doc.canUndo()).to.equal(true);
  });

  it("left follows the data: an accepted proposal moves into it, a new base replaces it", async () => {
    const el = await mount(
      html`<cdx-code-editor
        diff-layout="split"
        .value=${CURRENT}
        .reviewBase=${BASE}
      ></cdx-code-editor>`,
    );

    el.diff.acceptAll();
    await settled(el);
    expect(textLines(panes(el)[0])).to.deep.equal(CURRENT.split("\n"));

    el.reviewBase = "something else";
    await settled(el);
    expect(textLines(panes(el)[0])).to.deep.equal(["something else"]);
  });

  it("realigns when the text is edited", async () => {
    const el = await mount(
      html`<cdx-code-editor
        diff-layout="split"
        .value=${CURRENT}
        .baseline=${BASE}
      ></cdx-code-editor>`,
    );

    el.doc.replace(0, 0, "brand\nnew\nlines\n");
    await settled(el);

    // the new lines merge with the chunk below them, so "first" and "second" are changed text now
    expectAligned(el, ["third", "fourth", "fifth"]);
  });

  it("left is read-only", async () => {
    const el = await mount(
      html`<cdx-code-editor
        diff-layout="split"
        .value=${CURRENT}
        .baseline=${BASE}
      ></cdx-code-editor>`,
    );

    const content = /** @type {Element} */ (panes(el)[0].querySelector(".cm-content"));
    expect(content.getAttribute("contenteditable")).to.equal("false");
  });

  it("collapsed stretches line up, and expanding from either side opens both", async () => {
    const base = lines(40).join("\n");
    const current = base.replace("line 20", "line twenty");
    const el = await mount(html`
      <cdx-code-editor diff-layout="split" .value=${current} .reviewBase=${base}>
        <cdx-diff slot="diff" kind="review" no-review-bar collapse-unchanged></cdx-diff>
      </cdx-code-editor>
    `);

    const [left, right] = panes(el);
    expect(left.querySelectorAll(".cdx-collapsed")).to.have.length(2);
    expect(right.querySelectorAll(".cdx-collapsed")).to.have.length(2);
    expectAligned(el, ["line 19", "line 21"]);

    /** @type {HTMLElement} */ (left.querySelector(".cdx-collapsed")).click();
    await settled(el);

    expect(left.querySelectorAll(".cdx-collapsed")).to.have.length(1);
    expect(right.querySelectorAll(".cdx-collapsed")).to.have.length(1);
    expectAligned(el, ["line 1", "line 19", "line 21"]);
  });

  it("scrolls together in a fixed height, whichever side is scrolled", async () => {
    const base = lines(300).join("\n");
    const current = base.replace("line 150", "line one-fifty");
    const el = await mount(html`
      <cdx-code-editor
        style="block-size: 12rem"
        diff-layout="split"
        .value=${current}
        .baseline=${base}
      >
      </cdx-code-editor>
    `);
    const [left, right] = panes(el).map(
      (pane) => /** @type {HTMLElement} */ (pane.querySelector(".cm-scroller")),
    );

    right.scrollTop = 800;
    await settled(el);
    expect(left.scrollTop).to.be.closeTo(800, 1);

    left.scrollTop = 200;
    await settled(el);
    expect(right.scrollTop).to.be.closeTo(200, 1);
  });

  it("highlights the left side with the file's language, and takes its settings", async () => {
    const plugin = await import("../../presets/index.js");
    const el = await mount(html`
      <cdx-code-editor
        no-line-numbers
        diff-layout="split"
        filename="a.js"
        .plugins=${plugin.webPreset}
        .value=${"const a = 2;"}
        .baseline=${"const a = 1;"}
      ></cdx-code-editor>
    `);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await settled(el);

    const [left] = panes(el);
    expect(left.querySelector(".tok-keyword")?.textContent).to.equal("const");
    expect(left.querySelector(".cm-lineNumbers")).to.equal(null);

    el.noLineNumbers = false;
    await settled(el);
    expect(left.querySelector(".cm-lineNumbers")).to.exist;
  });

  it("survives a tab switch and a reconnect", async () => {
    const el = await mount(
      html`<cdx-code-editor
        diff-layout="split"
        .value=${CURRENT}
        .baseline=${BASE}
      ></cdx-code-editor>`,
    );

    el.state = await el.createState("tab two\nchanged", { baseline: "tab two\nbefore" });
    await settled(el);
    expect(panes(el)).to.have.length(2);
    expect(textLines(panes(el)[0])).to.deep.equal(["tab two", "before"]);

    const parent = /** @type {HTMLElement} */ (el.parentElement);
    el.remove();
    await frame();
    parent.append(el);
    await settled(el);
    expect(panes(el)).to.have.length(2);
    expect(textLines(panes(el)[0])).to.deep.equal(["tab two", "before"]);
    expect(textLines(panes(el)[1])).to.deep.equal(["tab two", "changed"]);
  });

  it("removes the left pane when the data goes away", async () => {
    const el = await mount(
      html`<cdx-code-editor
        diff-layout="split"
        .value=${CURRENT}
        .baseline=${BASE}
      ></cdx-code-editor>`,
    );

    el.baseline = null;
    await settled(el);

    expect(panes(el)).to.have.length(1);
  });
});
