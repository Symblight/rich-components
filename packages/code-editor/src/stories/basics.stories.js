import { html } from "lit";

import "@symblight/wc-material/menu";
import "../index.js";
import { webPreset } from "../presets/index.js";

const SAMPLES = /** @type {Record<string, string>} */ ({
  javascript: `/** @param {ReadableStream<Uint8Array>} stream */
async function* readChunks(stream) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

export const MAX_CHUNKS = 1024;
`,
  css: `.code-editor {
  display: flex;
  border: 1px solid var(--cdx-content-border-color);
  border-radius: 12px;
}
`,
  json: `{
  "name": "@symblight/code-editor",
  "version": "0.1.0",
  "private": false
}
`,
});

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Code Editor/Basics",
  component: "cdx-code-editor",
  tags: ["autodocs"],
  argTypes: {
    language: { control: "select", options: ["", "javascript", "typescript", "css", "json"] },
    readOnly: { control: "boolean" },
    placeholder: { control: "text" },
  },
  args: {
    language: "javascript",
    readOnly: false,
    placeholder: "",
  },
  render: (args) => html`
    <cdx-code-editor
      style="block-size: 20rem"
      label="Source"
      .plugins=${webPreset}
      language=${args.language}
      ?read-only=${args.readOnly}
      placeholder=${args.placeholder}
      .defaultValue=${SAMPLES[args.language] ?? SAMPLES.javascript}
      ><cdx-footer slot="footer" encoding="UTF-8"></cdx-footer>
    </cdx-code-editor>
  `,
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** @type {Story} */
export const Uncontrolled = {};

/** @type {Story} */
export const ReadOnly = {
  args: { readOnly: true },
};

/** @type {Story} */
export const Placeholder = {
  args: { placeholder: "// Start typing…" },
  render: (args) => html`
    <cdx-code-editor
      label="Source"
      .plugins=${webPreset}
      language=${args.language}
      placeholder=${args.placeholder}
      ><cdx-footer slot="footer" encoding="UTF-8"></cdx-footer>
    </cdx-code-editor>
  `,
};

/** The consumer owns the text: every edit round-trips through `value`, and the button replaces it
 *  from outside without losing undo history or the caret.
 *  @type {Story} */
export const Controlled = {
  render: () => {
    let value = SAMPLES.json;
    /** @param {CustomEvent<import("../components/code-editor/code-editor.js").CdxChangeDetail>} event */
    const handleChange = (event) => {
      value = event.detail.value;
      const output = /** @type {HTMLElement} */ (document.getElementById("controlled-length"));
      output.textContent = `${value.length} chars`;
    };
    /** @param {CustomEvent<import("../components/code-editor/code-editor.js").CdxSelectionChangeDetail>} event */
    const handleSelectionChange = (event) => {
      const output = /** @type {HTMLElement} */ (document.getElementById("controlled-position"));
      output.textContent = `Ln ${event.detail.line}, Col ${event.detail.column}`;
    };
    const handleBump = () => {
      const editor =
        /** @type {import("../components/code-editor/code-editor.js").CdxCodeEditor} */ (
          document.getElementById("controlled-editor")
        );
      value = value.replace(/"version": "(\d+)\.(\d+)\.(\d+)"/, (_, major, minor, patch) => {
        return `"version": "${major}.${minor}.${Number(patch) + 1}"`;
      });
      editor.value = value;
    };
    return html`
      <div style="display: flex; flex-direction: column; gap: 8px; font: 13px sans-serif">
        <cdx-code-editor
          id="controlled-editor"
          label="package.json"
          .plugins=${webPreset}
          language="json"
          .value=${value}
          @cdx-change=${handleChange}
          @cdx-selection-change=${handleSelectionChange}
          ><cdx-footer slot="footer" encoding="UTF-8"></cdx-footer>
        </cdx-code-editor>
        <div style="display: flex; gap: 16px; align-items: center">
          <button type="button" @click=${handleBump}>Bump patch version</button>
          <span id="controlled-position">Ln 1, Col 1</span>
          <span id="controlled-length">${value.length} chars</span>
        </div>
      </div>
    `;
  },
};

/** @type {Story} */
export const ThemeOverride = {
  render: () => html`
    <cdx-code-editor
      .plugins=${webPreset}
      language="css"
      .defaultValue=${SAMPLES.css}
      style="
        --cdx-code-editor-color-surface-container-lowest: #fff8e1;
        --cdx-code-editor-color-outline-variant: #b26a00;
        --cdx-code-editor-shape-corner-medium: 0;
        --cdx-syntax-keyword-color: #b26a00;
        --cdx-content-min-height: 10rem;
      "
      ><cdx-footer slot="footer" encoding="UTF-8"></cdx-footer>
    </cdx-code-editor>
  `,
};

/** Right-click, or press the ContextMenu key / Shift+F10, to open the consumer's own `md-menu`:
 *  the event is cancelled to suppress the native menu and `detail` says what was hit and where.
 *  @type {Story} */
export const ContextMenu = {
  render: () => {
    /** @type {(() => void)[]} */
    let actions = [];
    /** @param {CustomEvent<import("../controllers/ContextMenuController.js").CdxContextMenuDetail>} event */
    const handleContextMenu = (event) => {
      event.preventDefault();
      const { selection, region, line, clientX, clientY } = event.detail;
      const editor =
        /** @type {import("../components/code-editor/code-editor.js").CdxCodeEditor} */ (
          event.currentTarget
        );
      const menu = /** @type {import("@symblight/wc-material/menu").MdMenu} */ (
        document.getElementById("context-menu")
      );
      /** @type {[string, boolean, () => void][]} */
      const items = [
        [
          "Copy",
          !selection.main.empty,
          () =>
            navigator.clipboard.writeText(
              editor.state.sliceDoc(selection.main.from, selection.main.to),
            ),
        ],
        [
          "Select line",
          true,
          () => {
            const { from, to } = editor.state.doc.line(line);
            editor.setSelection(from, to);
          },
        ],
        [`Region: ${region}, line ${line}`, false, () => {}],
      ];
      actions = items.map(([, , run]) => run);
      menu.replaceChildren(
        ...items.map(([label, enabled], index) => {
          const item = document.createElement("md-menu-item");
          item.setAttribute("value", String(index));
          item.toggleAttribute("disabled", !enabled);
          item.textContent = label;
          return item;
        }),
      );
      menu.openAtPoint(clientX, clientY);
    };
    /** @param {CustomEvent<{ value: string }>} event */
    const handleSelect = (event) => {
      actions[Number(event.detail.value)]?.();
      /** @type {import("../components/code-editor/code-editor.js").CdxCodeEditor | null} */ (
        document.getElementById("context-menu-editor")
      )?.focus();
    };
    return html`
      <cdx-code-editor
        id="context-menu-editor"
        label="main.js"
        .plugins=${webPreset}
        language="javascript"
        .defaultValue=${SAMPLES.javascript}
        @cdx-contextmenu=${handleContextMenu}
        ><cdx-footer slot="footer" encoding="UTF-8"></cdx-footer>
      </cdx-code-editor>
      <md-menu id="context-menu" @select=${handleSelect}></md-menu>
    `;
  },
};
