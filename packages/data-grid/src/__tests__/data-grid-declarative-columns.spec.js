import { expect, fixture, html } from "@open-wc/testing";

import "../index.js";
/** @import { MdDataGrid } from "../base/data-grid.js" */

async function settle() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("md-data-grid: declarative <md-data-grid-column> children", () => {
  it("builds columns from static <md-data-grid-column> markup, in DOM order", async () => {
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`
        <md-data-grid>
          <md-data-grid-column
            field="email"
            header-name="Email"
          ></md-data-grid-column>
          <md-data-grid-column
            field="name"
            header-name="Name"
            width="140"
          ></md-data-grid-column>
        </md-data-grid>
      `)
    );
    await settle();
    await el.updateComplete;

    expect(el.columns).to.deep.equal([
      { field: "email", headerName: "Email" },
      { field: "name", headerName: "Name", width: 140 },
    ]);
  });

  it("renders header text and cell values sourced from declarative columns", async () => {
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`
        <md-data-grid>
          <md-data-grid-column
            field="name"
            header-name="Full Name"
          ></md-data-grid-column>
        </md-data-grid>
      `)
    );
    el.rows = [{ id: 1, name: "Ada Lovelace" }];
    await el.updateComplete;
    await settle();
    await el.updateComplete;

    const header = el.shadowRoot.querySelector("md-data-grid-header-cell");
    expect(header.shadowRoot.textContent).to.contain("Full Name");

    const cell = el.shadowRoot.querySelector("md-data-grid-cell");
    await cell.updateComplete;
    expect(cell.shadowRoot.textContent).to.contain("Ada Lovelace");
  });

  it("leaves imperative el.columns untouched when there are no <md-data-grid-column> children", async () => {
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`<md-data-grid></md-data-grid>`)
    );
    el.columns = [{ field: "a" }, { field: "b" }];
    await el.updateComplete;
    await settle();

    expect(el.columns).to.deep.equal([{ field: "a" }, { field: "b" }]);
  });

  it("picks up a column added after initial connect", async () => {
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`
        <md-data-grid>
          <md-data-grid-column field="a"></md-data-grid-column>
        </md-data-grid>
      `)
    );
    await settle();
    await el.updateComplete;
    expect(el.columns).to.deep.equal([{ field: "a" }]);

    const col = document.createElement("md-data-grid-column");
    col.setAttribute("field", "b");
    el.appendChild(col);
    await settle();
    await el.updateComplete;

    expect(el.columns).to.deep.equal([{ field: "a" }, { field: "b" }]);
  });

  it("picks up a column removed after initial connect", async () => {
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`
        <md-data-grid>
          <md-data-grid-column field="a"></md-data-grid-column>
          <md-data-grid-column field="b"></md-data-grid-column>
        </md-data-grid>
      `)
    );
    await settle();
    await el.updateComplete;

    el.querySelector('md-data-grid-column[field="a"]').remove();
    await settle();
    await el.updateComplete;

    expect(el.columns).to.deep.equal([{ field: "b" }]);
  });

  it("picks up an attribute changed on an already-connected column", async () => {
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`
        <md-data-grid>
          <md-data-grid-column field="a" header-name="A"></md-data-grid-column>
        </md-data-grid>
      `)
    );
    await settle();
    await el.updateComplete;

    const col = /** @type {any} */ (el.querySelector("md-data-grid-column"));
    col.setAttribute("header-name", "A renamed");
    await col.updateComplete;
    await settle();
    await el.updateComplete;

    expect(el.columns).to.deep.equal([{ field: "a", headerName: "A renamed" }]);
  });

  it("picks up a function-valued property (renderCell) assigned imperatively", async () => {
    const el = /** @type {MdDataGrid} */ (
      await fixture(html`
        <md-data-grid>
          <md-data-grid-column field="name"></md-data-grid-column>
        </md-data-grid>
      `)
    );
    el.rows = [{ id: 1, name: "Ada" }];
    await el.updateComplete;
    await settle();
    await el.updateComplete;

    const col = /** @type {any} */ (el.querySelector("md-data-grid-column"));
    col.renderCell = ({ value }) => html`<b>${value}!</b>`;
    await col.updateComplete;
    await settle();
    await el.updateComplete;

    const cell = /** @type {any} */ (
      el.shadowRoot.querySelector("md-data-grid-cell")
    );
    await cell.updateComplete;
    expect(cell.shadowRoot.querySelector("b")?.textContent).to.equal("Ada!");
  });

  describe("live mutations", () => {
    it("picks up columns reordered via insertBefore", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`
          <md-data-grid>
            <md-data-grid-column field="a"></md-data-grid-column>
            <md-data-grid-column field="b"></md-data-grid-column>
          </md-data-grid>
        `)
      );
      await settle();
      await el.updateComplete;
      expect(el.columns).to.deep.equal([{ field: "a" }, { field: "b" }]);

      const [colA, colB] = Array.from(
        el.querySelectorAll("md-data-grid-column"),
      );
      el.insertBefore(colB, colA);
      await settle();
      await el.updateComplete;

      expect(el.columns).to.deep.equal([{ field: "b" }, { field: "a" }]);
    });

    it("picks up a plain JS property assignment (not just an attribute)", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`
          <md-data-grid>
            <md-data-grid-column field="a"></md-data-grid-column>
          </md-data-grid>
        `)
      );
      await settle();
      await el.updateComplete;

      const col = /** @type {any} */ (el.querySelector("md-data-grid-column"));
      col.width = 200;
      await col.updateComplete;
      await settle();
      await el.updateComplete;

      expect(el.columns).to.deep.equal([{ field: "a", width: 200 }]);
    });

    it("resyncs to an empty array (not frozen stale data) when the last declarative column is removed", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`
          <md-data-grid>
            <md-data-grid-column field="a"></md-data-grid-column>
          </md-data-grid>
        `)
      );
      await settle();
      await el.updateComplete;
      expect(el.columns).to.deep.equal([{ field: "a" }]);

      el.querySelector("md-data-grid-column").remove();
      await settle();
      await el.updateComplete;

      expect(el.columns).to.deep.equal([]);
    });

    it("switches from imperative to declarative once the first <md-data-grid-column> is appended", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );
      el.columns = [{ field: "imperative" }];
      await el.updateComplete;
      await settle();
      expect(el.columns).to.deep.equal([{ field: "imperative" }]);

      const col = document.createElement("md-data-grid-column");
      col.setAttribute("field", "declarative");
      el.appendChild(col);
      await settle();
      await el.updateComplete;

      expect(el.columns).to.deep.equal([{ field: "declarative" }]);
    });

    it("batches several synchronous mutations into a consistent final state", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`
          <md-data-grid>
            <md-data-grid-column field="a"></md-data-grid-column>
          </md-data-grid>
        `)
      );
      await settle();
      await el.updateComplete;

      const colB = document.createElement("md-data-grid-column");
      colB.setAttribute("field", "b");
      const colC = document.createElement("md-data-grid-column");
      colC.setAttribute("field", "c");
      el.appendChild(colB);
      el.appendChild(colC);
      el.querySelector('md-data-grid-column[field="a"]').remove();
      await settle();
      await el.updateComplete;

      expect(el.columns).to.deep.equal([{ field: "b" }, { field: "c" }]);
    });
  });

  describe("conflict with an imperative `columns` assignment", () => {
    it("warns once and keeps the declarative children authoritative", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`
          <md-data-grid>
            <md-data-grid-column field="a"></md-data-grid-column>
          </md-data-grid>
        `)
      );
      await settle();
      await el.updateComplete;

      const originalWarn = console.warn;
      let warnCount = 0;
      console.warn = () => {
        warnCount += 1;
      };
      try {
        el.columns = [{ field: "imperative" }];
        expect(warnCount).to.equal(1);

        // The direct assignment above is immediately overridden by the very
        // next resync — trigger one to observe the declarative value win.
        el.querySelector("md-data-grid-column").setAttribute(
          "header-name",
          "A",
        );
        await el.querySelector("md-data-grid-column").updateComplete;
        await settle();
        await el.updateComplete;

        // Warns only once even across further conflicting assignments.
        el.columns = [{ field: "imperative-again" }];
        expect(warnCount).to.equal(1);
      } finally {
        console.warn = originalWarn;
      }

      expect(el.columns).to.deep.equal([{ field: "a", headerName: "A" }]);
    });

    it("doesn't warn for a plain imperative grid with no declarative children", async () => {
      const el = /** @type {MdDataGrid} */ (
        await fixture(html`<md-data-grid></md-data-grid>`)
      );

      const originalWarn = console.warn;
      let warnCount = 0;
      console.warn = () => {
        warnCount += 1;
      };
      try {
        el.columns = [{ field: "a" }];
        await el.updateComplete;
      } finally {
        console.warn = originalWarn;
      }

      expect(warnCount).to.equal(0);
      expect(el.columns).to.deep.equal([{ field: "a" }]);
    });
  });
});
