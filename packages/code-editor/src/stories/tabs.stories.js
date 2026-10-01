import { html } from "lit";

import "@symblight/wc-material/tabs";

import "../index.js";
import { allPreset } from "../presets/index.js";

/** @typedef {import("../components/code-editor/code-editor.js").CdxCodeEditor} CdxCodeEditor */

const FILES = /** @type {Record<string, string>} */ ({
  "main.rs": `// Generated header — locked by cdx-before-change.
// Edits on these two lines are refused.

struct Point {
    x: f64,
    y: f64,
}

impl Point {
    fn norm(&self) -> f64 {
        (self.x * self.x + self.y * self.y).sqrt()
    }
}
`,
  "app.tsx": `interface Props {
  name: string;
}

export function Greeting({ name }: Props) {
  const upper = name.toUpperCase();
  return <p className="greeting">Hello, {upper}!</p>;
}
`,
  "README.md": `# Tabs

Each tab keeps its own text, undo history and caret.

\`\`\`py
def hello():
    return "hi"
\`\`\`
`,
});

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Code Editor/Tabs",
  component: "cdx-code-editor",
};
export default meta;

/** One editor, one `EditorState` per tab from `createState()`: switching keeps each file's text,
 *  undo history, caret and grammar — the footer's crumbs, position and language follow the tab.
 *  The first two lines of main.rs are protected with a cancelable `cdx-before-change`.
 *  @type {import("@storybook/web-components").StoryObj} */
export const Tabs = {
  render: () => {
    /** @type {Map<string, import("@codemirror/state").EditorState>} */
    const states = new Map();
    /** @type {string | null} */
    let active = null;

    const editor = () => /** @type {CdxCodeEditor} */ (document.getElementById("tabs-editor"));
    /** @param {string} id @param {string} text */
    const setText = (id, text) => {
      const node = document.getElementById(id);
      if (node) node.textContent = text;
    };

    /** @param {string} file */
    const open = async (file) => {
      const el = editor();
      if (!states.has(file))
        states.set(file, await el.createState(FILES[file], { filename: file }));
      // the editor's own first state is a blank placeholder, not a tab
      if (active && el.state) states.set(active, el.state);
      active = file;
      el.filename = file;
      el.state = states.get(file);
      el.focus();
    };

    /** Refuses any edit touching the first two lines of main.rs.
     * @param {CustomEvent<import("../index.js").CdxBeforeChangeDetail>} event */
    const handleBeforeChange = (event) => {
      if (active !== "main.rs") return;
      const state = editor().state;
      if (!state) return;
      const lockedEnd = state.doc.line(2).to;
      let touches = false;
      event.detail.changes.iterChangedRanges((from) => {
        if (from <= lockedEnd) touches = true;
      });
      if (!touches) return;
      event.preventDefault();
      setText("tabs-note", "Line 1–2 are locked");
      setTimeout(() => setText("tabs-note", ""), 1500);
    };

    queueMicrotask(async () => {
      await customElements.whenDefined("cdx-code-editor");
      await editor().updateComplete;
      open("main.rs");
    });

    /** @param {CustomEvent<{ value: string, index: number }>} event */
    const handleTabChange = (event) => open(event.detail.value);

    return html`
      <div style="display: grid; gap: 8px">
        <md-tabs variant="secondary" value="main.rs" @change=${handleTabChange}>
          ${Object.keys(FILES).map((file) => html`<md-tab value=${file}>${file}</md-tab>`)}
        </md-tabs>
        <cdx-code-editor
          id="tabs-editor"
          style="block-size: 20rem"
          label="Source"
          .plugins=${allPreset}
          @cdx-before-change=${handleBeforeChange}
        >
          <cdx-footer slot="footer" encoding="UTF-8"></cdx-footer>
          <span
            id="tabs-note"
            slot="status"
            style="padding: 0 6px; color: var(--md-sys-color-error)"
          ></span>
        </cdx-code-editor>
      </div>
    `;
  },
};
