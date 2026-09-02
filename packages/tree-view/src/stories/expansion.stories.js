import "../index.js";

import { buildFileTree, hintText, logPanel, stack } from "./shared.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Tree View/Expansion",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Three ways to drive expand/select state from outside the tree, in increasing order of " +
          "control: `defaultExpandedItems`/`defaultSelectedItems` apply once and are then hands-off; " +
          "the `expandedItems`/`selectedItems` properties re-sync on every write, for a fully " +
          "controlled binding; and `setItemExpansion()`/`setItemSelection()`/`isItemExpanded()`/" +
          "`expandAll()`/`collapseAll()` are one-off imperative calls for wiring up buttons or " +
          "external triggers. All three read/write against the live DOM — there's no separate " +
          "expansion/selection model to fall out of sync with what's actually rendered.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

// ─── Uncontrolled — applies once, then the tree owns the state itself ───────

/** @type {Story} */
export const UncontrolledDefaults = {
  render: () => {
    const tree = document.createElement("tvx-tree-view");
    tree.defaultExpandedItems = new Set(["src"]);
    tree.defaultSelectedItems = new Set(["readme"]);
    tree.items = buildFileTree();
    return stack(
      hintText(
        "defaultExpandedItems/defaultSelectedItems apply exactly once, the moment the root batch of " +
          "items actually exists — after that the tree manages its own state normally, and setting " +
          "either property again later has no further effect. Good for \"open to this node on first " +
          "render\" without wiring up a full controlled binding.",
      ),
      tree,
    );
  },
};

// ─── Controlled — expandedItems/selectedItems re-sync on every write ────────

/** @type {Story} */
export const ControlledState = {
  render: () => {
    const tree = document.createElement("tvx-tree-view");
    tree.multiSelect = true;
    tree.items = buildFileTree();

    const log = logPanel();
    const renderLog = () => {
      log.textContent =
        `expandedItems: ${JSON.stringify([...tree.expandedItems])}\n` +
        `selectedItems: ${JSON.stringify([...tree.selectedItems])}`;
    };
    tree.addEventListener("tvx-expansion-change", renderLog);
    tree.addEventListener("tvx-selection-change", renderLog);
    renderLog();

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "0.5rem";

    const expandSrcButton = document.createElement("button");
    expandSrcButton.type = "button";
    expandSrcButton.textContent = "Set expandedItems([src, components])";
    expandSrcButton.addEventListener("click", () => {
      // Assigning a new Set re-syncs the tree's live expansion state to match — same
      // uncontrolled-with-sync shape .items itself uses, just for expand/select state.
      tree.expandedItems = new Set(["src", "components"]);
      renderLog();
    });

    const selectReadmeButton = document.createElement("button");
    selectReadmeButton.type = "button";
    selectReadmeButton.textContent = "Set selectedItems([readme, gitignore])";
    selectReadmeButton.addEventListener("click", () => {
      tree.selectedItems = new Set(["readme", "gitignore"]);
      renderLog();
    });

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.textContent = "Clear both";
    clearButton.addEventListener("click", () => {
      tree.expandedItems = new Set();
      tree.selectedItems = new Set();
      renderLog();
    });

    controls.append(expandSrcButton, selectReadmeButton, clearButton);

    return stack(
      hintText(
        "Unlike defaultExpandedItems/defaultSelectedItems, expandedItems/selectedItems are live " +
          "getters/setters — reading either returns a fresh snapshot of what's actually expanded/" +
          "selected right now, and assigning a new Set re-syncs the tree to match it, at any time. " +
          "Interacting with the tree by hand (click a chevron, check a box) updates what these " +
          "getters return too, same as any other uncontrolled-with-sync property in this package.",
      ),
      controls,
      tree,
      log,
    );
  },
};

// ─── Programmatic controls — setItemExpansion/isItemExpanded/expandAll/etc ──

/** @type {Story} */
export const ProgrammaticControls = {
  render: () => {
    const tree = document.createElement("tvx-tree-view");
    tree.multiSelect = true;
    tree.items = buildFileTree();

    const status = logPanel();
    const renderStatus = () => {
      status.textContent = `"src" expanded: ${tree.isItemExpanded("src")}`;
    };
    renderStatus();

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.flexWrap = "wrap";
    controls.style.gap = "0.5rem";

    /** @param {string} label @param {() => void} onClick */
    function makeButton(label, onClick) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", onClick);
      return button;
    }

    controls.append(
      makeButton("expand({id: 'src', expand: true})", () => {
        tree.setItemExpansion({ id: "src", expand: true });
        renderStatus();
      }),
      makeButton("collapse({id: 'src', expand: false})", () => {
        tree.setItemExpansion({ id: "src", expand: false });
        renderStatus();
      }),
      makeButton("expandAll()", () => {
        tree.expandAll();
        renderStatus();
      }),
      makeButton("collapseAll()", () => {
        tree.collapseAll();
        renderStatus();
      }),
      makeButton("select({id: 'readme', selected: true})", () => {
        tree.setItemSelection({ id: "readme", selected: true });
      }),
    );

    return stack(
      hintText(
        "setItemExpansion()/setItemSelection() are one-off imperative calls (no-op for an id that " +
          "isn't currently a mounted item — e.g. a branch that hasn't been expanded/loaded yet), the " +
          "shape a single \"expand this node\" button reaches for instead of round-tripping through " +
          "expandedItems. isItemExpanded() reads the live DOM directly, same as the getter above.",
      ),
      controls,
      tree,
      status,
    );
  },
};
