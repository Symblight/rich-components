import "../index.js";
import "@symblight/wc-material/icon";

import blockIcon from "@material-design-icons/svg/outlined/block.svg?raw";

import { buildFileTree, buildItem, file, folder, hintText, icon, logPanel, stack } from "./shared.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Tree View/Selection",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Single-select by default — clicking a row selects it and reflects `aria-current=\"true\"` " +
          "for deep-link support. Set `multiSelect` to opt into MUI-style multi-select (mirroring " +
          "`RowSelectionController` in `@symblight/data-grid`): a plain click still replaces the " +
          "whole selection with just that one item, Ctrl/Cmd+click toggles an individual item into/" +
          "out of the selection without touching the rest of it, and Shift+click (or Shift+ArrowUp/" +
          "Down) merges a contiguous range — measured from the last-clicked item, the \"anchor\" — " +
          "into the existing selection (it never rebuilds the selection from scratch, so an earlier " +
          "Ctrl+click survives). There's no parent/child cascade — selection is just a flat " +
          "`Set<PropertyKey>`. Set `disableSelection` " +
          "to turn off selection entirely (rows still focus, and a branch still toggles expand/" +
          "collapse on click). Set `checkboxSelection` to render a checkbox per row in either mode — " +
          "clicking it always toggles just that one item, independent of the row's ctrl/shift-click " +
          "semantics. `disabled` items are excluded from clicks, keyboard activation, and Shift+click/" +
          "Shift+arrow ranges.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** @param {Element} row @param {Partial<MouseEventInit>} [init] */
function clickWithModifiers(row, init = {}) {
  row.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, ...init }));
}

// ─── Single select (the default) — exactly one key, aria-current on it ──────

/** @type {Story} */
export const SingleSelect = {
  render: () => {
    const tree = document.createElement("tvx-tree-view");
    tree.items = buildFileTree();

    const log = logPanel();
    tree.addEventListener("tvx-selection-change", (event) => {
      const ids = [.../** @type {CustomEvent} */ (event).detail.selectedItems];
      log.textContent = ids.length === 0 ? "Nothing selected." : `Selected: ${ids}`;
    });

    return stack(
      hintText(
        "Default mode — clicking a row selects it and deselects whatever was selected before. " +
          "The selected row gets aria-current=\"true\", not just aria-selected, for deep-link support.",
      ),
      tree,
      log,
    );
  },
};

// ─── disableSelection — rows still focus/expand, nothing ever gets selected ─

/** @type {Story} */
export const DisableSelection = {
  render: () => {
    const tree = document.createElement("tvx-tree-view");
    tree.disableSelection = true;
    tree.items = buildFileTree();

    const log = logPanel();
    tree.addEventListener("tvx-selection-change", () => {
      // Never fires — SelectionController.activate()/setSelected() no-op before they'd notify.
      log.textContent = "tvx-selection-change fired (shouldn't happen with disableSelection).";
    });

    return stack(
      hintText(
        "Clicking a row still moves keyboard focus (and, on a branch, still toggles expand/collapse " +
          "— that becomes the row's whole job once selection can't happen) — it just never selects " +
          "anything, and tvx-selection-change never fires. Useful for a pure navigation/menu tree.",
      ),
      tree,
      log,
    );
  },
};

// ─── multiSelect — plain click, ctrl/cmd+click, shift+click; flat, no cascade

/** @type {Story} */
export const MultiSelect = {
  render: () => {
    const tree = document.createElement("tvx-tree-view");
    tree.multiSelect = true;
    tree.items = buildFileTree();

    const log = logPanel();
    tree.addEventListener("tvx-selection-change", (event) => {
      const ids = [.../** @type {CustomEvent} */ (event).detail.selectedItems];
      log.textContent = ids.length === 0 ? "Nothing selected." : `Selected: ${ids}`;
    });

    return stack(
      hintText(
        "A plain click still replaces the whole selection with just that one item. Hold Ctrl (⌘ on " +
          "macOS) and click to toggle individual items independently. Click one item, then Shift+click " +
          "another to select every visible item between them (Shift+ArrowUp/Down does the same from " +
          "the keyboard). Selection is a flat Set — selecting a folder never selects its children.",
      ),
      tree,
      log,
    );
  },
};

// ─── checkboxSelection — a checkbox per row, works alongside either mode ────

/** @type {Story} */
export const CheckboxSelection = {
  render: () => {
    const tree = document.createElement("tvx-tree-view");
    tree.multiSelect = true;
    tree.checkboxSelection = true;
    tree.items = buildFileTree();

    const log = logPanel();
    tree.addEventListener("tvx-selection-change", (event) => {
      const ids = [.../** @type {CustomEvent} */ (event).detail.selectedItems];
      log.textContent = ids.length === 0 ? "Nothing selected." : `Selected: ${ids}`;
    });

    return stack(
      hintText(
        "checkboxSelection renders a checkbox on every row, in single- or multi-select mode. " +
          "Clicking the checkbox always toggles exactly that one item — it never needs Ctrl/Cmd, and " +
          "it doesn't touch the rest of the selection. Clicking elsewhere on the row still follows " +
          "the usual plain/ctrl/shift-click rules for whichever mode is active.",
      ),
      tree,
      log,
    );
  },
};

// ─── Disabled items — excluded from click, keyboard activation, and ranges ──

/** @type {Story} */
export const DisabledItems = {
  render: () => {
    const tree = document.createElement("tvx-tree-view");
    tree.multiSelect = true;

    const lockedFile = buildItem(file({ id: "package-lock", label: "package-lock.json", disabled: true }));
    lockedFile.append(Object.assign(icon(blockIcon), { slot: "trailing" }));

    tree.items = [
      buildItem(
        folder({
          id: "src",
          label: "src/",
          children: [file({ id: "index", label: "index.js" })],
        }),
      ),
      lockedFile,
      buildItem(file({ id: "readme", label: "README.md" })),
    ];

    const log = logPanel();
    tree.addEventListener("tvx-selection-change", (event) => {
      const ids = [.../** @type {CustomEvent} */ (event).detail.selectedItems];
      log.textContent = ids.length === 0 ? "Nothing selected." : `Selected: ${ids}`;
    });

    return stack(
      hintText(
        "\"package-lock.json\" is disabled — clicking it, Ctrl/Cmd+clicking it, and Shift+clicking " +
          "past it all skip it (a Shift+click range spanning over it selects everything else in the " +
          "range but leaves it out). Focus still lands on it via arrow-key navigation, but Enter/" +
          "Space/click there is a no-op — see the \"Keyboard & Navigation\" category for the full " +
          "disabled-item keyboard story.",
      ),
      tree,
      log,
    );
  },
};

// ─── Range selection walkthrough — plain / ctrl / shift click side by side ──

/** @type {Story} */
export const RangeSelectionWalkthrough = {
  render: () => {
    const tree = document.createElement("tvx-tree-view");
    tree.multiSelect = true;
    tree.items = [
      buildItem(file({ id: "a", label: "Alpha" })),
      buildItem(file({ id: "b", label: "Beta" })),
      buildItem(file({ id: "c", label: "Cherry" })),
      buildItem(file({ id: "d", label: "Delta" })),
      buildItem(file({ id: "e", label: "Echo" })),
    ];

    const log = logPanel();
    const renderLog = () => {
      log.textContent = `Selected: ${[...tree.selectedItems].join(", ") || "(none)"}`;
    };
    tree.addEventListener("tvx-selection-change", renderLog);
    renderLog();

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "0.5rem";
    controls.style.flexWrap = "wrap";

    /** @param {string} text @param {Partial<MouseEventInit>} init @param {string} id */
    const button = (text, id, init) => {
      const el = document.createElement("button");
      el.type = "button";
      el.textContent = text;
      el.addEventListener("click", () => {
        const row = /** @type {HTMLElement} */ (
          tree.getItemByKey(id)?.shadowRoot?.querySelector(".tree-item__row")
        );
        if (row) clickWithModifiers(row, init);
      });
      return el;
    };

    controls.append(
      button("Click Beta", "b", {}),
      button("Ctrl+click Delta", "d", { ctrlKey: true }),
      button("Shift+click Echo", "e", { shiftKey: true }),
    );

    return stack(
      hintText(
        "Buttons simulate the three click types on specific rows so you can see the anchor logic " +
          "without needing to hold a modifier key yourself: plain-click Beta selects just it and " +
          "sets the anchor there; Ctrl+click Delta adds it independently and moves the anchor to " +
          "Delta; Shift+click Echo then merges the Delta-to-Echo range into the existing selection " +
          "rather than replacing it — final selection is Beta, Delta, Echo. A Shift+click always " +
          "merges against the current selection (never rebuilds it from scratch), and the anchor " +
          "always advances to wherever you just clicked, including a Shift+click itself.",
      ),
      controls,
      tree,
      log,
    );
  },
};
