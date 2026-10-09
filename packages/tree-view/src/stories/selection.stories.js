import { html } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import blockIcon from "@material-design-icons/svg/outlined/block.svg?raw";

import {
  buildFileTree,
  file,
  folder,
  renderFileIcon,
  renderTrailingIcon,
  storyStyles,
  writeLog,
} from "./shared.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Tree View/Selection",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'Single-select by default (the selected row gets `aria-current="true"`). `multiSelect` opts ' +
          "into MUI-style selection mirroring `@symblight/data-grid`: plain click replaces, " +
          "Ctrl/Cmd+click toggles, Shift+click (or Shift+↑/↓) merges a range from the anchor. " +
          "`checkboxSelection` adds a checkbox per row that cascades through a branch's subtree. " +
          "`disableSelection` turns selection off. `disabled` items are skipped everywhere.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */
/** @typedef {import("lit/directives/ref.js").Ref<HTMLElement>} LogRef */

/** A `tvx-selection-change` listener that prints the selection into `log`. @param {LogRef} log */
const logSelection = (log) => (/** @type {CustomEvent} */ event) => {
  const ids = [...event.detail.selectedItems];
  writeLog(log, ids.length === 0 ? "Nothing selected." : `Selected: ${ids}`);
};

/** @type {Story} */
export const SingleSelect = {
  render: () => {
    /** @type {LogRef} */
    const log = createRef();
    return html`
      ${storyStyles}
      <div class="story">
        <p class="story__hint">Clicking a row selects it and deselects the previous one.</p>
        <tvx-tree-view
          .items=${buildFileTree()}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
          @tvx-selection-change=${logSelection(log)}
        ></tvx-tree-view>
        <pre class="story__log" ${ref(log)}></pre>
      </div>
    `;
  },
};

/** @type {Story} */
export const DisableSelection = {
  render: () => {
    /** @type {LogRef} */
    const log = createRef();
    return html`
      ${storyStyles}
      <div class="story">
        <p class="story__hint">
          Rows still focus and branches still toggle — nothing is ever selected.
        </p>
        <tvx-tree-view
          disable-selection
          .items=${buildFileTree()}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
          @tvx-selection-change=${logSelection(log)}
        ></tvx-tree-view>
        <pre class="story__log" ${ref(log)}></pre>
      </div>
    `;
  },
};

/** @type {Story} */
export const MultiSelect = {
  render: () => {
    /** @type {LogRef} */
    const log = createRef();
    return html`
      ${storyStyles}
      <div class="story">
        <p class="story__hint">
          Ctrl/⌘+click toggles one item, Shift+click selects every visible row in between. Flat — a
          folder never selects its children.
        </p>
        <tvx-tree-view
          multi-select
          .items=${buildFileTree()}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
          @tvx-selection-change=${logSelection(log)}
        ></tvx-tree-view>
        <pre class="story__log" ${ref(log)}></pre>
      </div>
    `;
  },
};

/** @type {Story} */
export const CheckboxSelection = {
  render: () => {
    /** @type {LogRef} */
    const log = createRef();
    /** @type {import("lit/directives/ref.js").Ref<import("../base/tree-view.js").TvxTreeView>} */
    const tree = createRef();
    const items = buildFileTree();
    /** Leaf ids only — folders derive their checked state from their children.
     * @param {import("./shared.js").TreeNodeData[]} nodes
     * @returns {string[]} */
    const leafIds = (nodes) =>
      nodes.flatMap((n) => (n.children?.length ? leafIds(n.children) : [n.id]));
    return html`
      ${storyStyles}
      <div class="story">
        <p class="story__hint">
          Checking a folder checks its whole subtree; checking every child checks the folder. A row
          click only toggles expansion — selection is the checkbox's job.
        </p>
        <div class="story__controls">
          <button @click=${() => tree.value?.selection.set(leafIds(items))}>Select all</button>
          <button @click=${() => tree.value?.selection.clear()}>Clear</button>
        </div>
        <tvx-tree-view
          ${ref(tree)}
          multi-select
          checkbox-selection
          .items=${items}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
          @tvx-selection-change=${logSelection(log)}
        ></tvx-tree-view>
        <pre class="story__log" ${ref(log)}></pre>
      </div>
    `;
  },
};

/** @type {Story} */
export const DisabledItems = {
  render: () => {
    /** @type {LogRef} */
    const log = createRef();
    return html`
      ${storyStyles}
      <div class="story">
        <p class="story__hint">
          "package-lock.json" is disabled — clicks skip it and Shift ranges leave it out.
        </p>
        <tvx-tree-view
          multi-select
          .items=${[
            folder({
              id: "src",
              label: "src/",
              children: [file({ id: "index", label: "index.js" })],
            }),
            file({
              id: "package-lock",
              label: "package-lock.json",
              disabled: true,
              trailingIcon: blockIcon,
            }),
            file({ id: "readme", label: "README.md" }),
          ]}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
          @tvx-selection-change=${logSelection(log)}
        ></tvx-tree-view>
        <pre class="story__log" ${ref(log)}></pre>
      </div>
    `;
  },
};

/** @type {Story} */
export const RangeSelectionWalkthrough = {
  render: () => {
    /** @type {import("lit/directives/ref.js").Ref<HTMLElement>} */
    const tree = createRef();
    /** @type {LogRef} */
    const log = createRef();

    /** Dispatches a click on the row labelled `label`.
     * @param {string} label @param {MouseEventInit} init */
    const clickRow = (label, init) => () => {
      const row = [...(tree.value?.shadowRoot?.querySelectorAll(".tree-view__item") ?? [])].find(
        (el) => el.textContent?.trim() === label,
      );
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, ...init }));
    };

    return html`
      ${storyStyles}
      <div class="story">
        <p class="story__hint">
          Plain-click Beta, Ctrl+click Delta, then Shift+click Echo — the range merges into the
          selection: Beta, Delta, Echo.
        </p>
        <div class="story__controls">
          <button @click=${clickRow("Beta", {})}>Click Beta</button>
          <button @click=${clickRow("Delta", { ctrlKey: true })}>Ctrl+click Delta</button>
          <button @click=${clickRow("Echo", { shiftKey: true })}>Shift+click Echo</button>
        </div>
        <tvx-tree-view
          ${ref(tree)}
          multi-select
          .items=${["Alpha", "Beta", "Cherry", "Delta", "Echo"].map((label) =>
            file({ id: label[0].toLowerCase(), label }),
          )}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
          @tvx-selection-change=${logSelection(log)}
        ></tvx-tree-view>
        <pre class="story__log" ${ref(log)}></pre>
      </div>
    `;
  },
};
