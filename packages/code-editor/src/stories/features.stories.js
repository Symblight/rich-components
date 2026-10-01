import { html } from "lit";
import { linter } from "@codemirror/lint";

import "../index.js";
import { defineCdxPlugin } from "../index.js";
import { webPreset } from "../presets/index.js";

const SOURCE = `/** @param {ReadableStream<Uint8Array>} stream */
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

/**
 * Reads a stream to completion, feeding every chunk into \`buffer\`.
 * Throws if the stream closes without an explicit finish chunk.
 */
export async function processStream(stream, { getMessages, getUserId, buffer, ingest }) {
  let sawTerminalChunk = false;
  try {
    for await (const item of readChunks(stream)) {
      const chunk = ingest(item);
      if (!chunk) continue;
      if (chunk.kind === "finish" || chunk.kind === "abort") sawTerminalChunk = true;
      buffer.push(chunk, getMessages(), getUserId());
    }
  } finally {
    buffer.flushAll();
  }
  if (!sawTerminalChunk) {
    throw new Error("Stream ended without a finish chunk");
  }
}
`;

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Code Editor/Features",
  component: "cdx-code-editor",
  argTypes: {
    noLineNumbers: { control: "boolean" },
    noFolding: { control: "boolean" },
    noActiveLine: { control: "boolean" },
    noBracketMatching: { control: "boolean" },
    noIndentGuides: { control: "boolean" },
    wrap: { control: "boolean" },
    tabSize: { control: { type: "number", min: 1, max: 8 } },
    density: { control: "inline-radio", options: ["default", "compact"] },
  },
  args: {
    noLineNumbers: false,
    noFolding: false,
    noActiveLine: false,
    noBracketMatching: false,
    noIndentGuides: false,
    wrap: false,
    tabSize: 4,
    density: "default",
  },
  render: (args) => html`
    <cdx-code-editor
      style="block-size: 26rem"
      label="processStream.js"
      .plugins=${webPreset}
      filename="processStream.js"
      .defaultValue=${SOURCE}
      ?no-line-numbers=${args.noLineNumbers}
      ?no-folding=${args.noFolding}
      ?no-active-line=${args.noActiveLine}
      ?no-bracket-matching=${args.noBracketMatching}
      ?no-indent-guides=${args.noIndentGuides}
      ?wrap=${args.wrap}
      tab-size=${args.tabSize}
      density=${args.density}
      ><cdx-footer slot="footer" encoding="UTF-8"></cdx-footer>
    </cdx-code-editor>
  `,
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** Gutter, folding (hover the gutter; Ctrl/⌘-Shift-[ and ]), active line, bracket matching and
 *  indent guides — all on by default, each switched off by a `no-*` attribute.
 *  @type {Story} */
export const Default = {};

/** @type {Story} */
export const Compact = {
  args: { density: "compact" },
};

/** @type {Story} */
export const Minimal = {
  args: {
    noLineNumbers: true,
    noFolding: true,
    noActiveLine: true,
    noIndentGuides: true,
  },
};

/** Diagnostics pushed through the `diagnostics` property, the way an LSP bridge would. The pill in
 *  the corner counts them and jumps to the first; hover an underline for its message.
 *  @type {Story} */
export const Diagnostics = {
  render: () => {
    const at = (/** @type {string} */ text) => SOURCE.indexOf(text);
    /** @type {import("@codemirror/lint").Diagnostic[]} */
    const diagnostics = [
      {
        from: at("getUserId()"),
        to: at("getUserId()") + "getUserId()".length,
        severity: "warning",
        message: "getUserId() may return undefined — buffer.push expects a string userId",
      },
      {
        from: at("sawTerminalChunk = true"),
        to: at("sawTerminalChunk = true") + "sawTerminalChunk".length,
        severity: "info",
        message: "Consider breaking out of the loop once a terminal chunk arrives",
      },
    ];
    return html`
      <div style="display: grid; gap: 16px">
        <cdx-code-editor
          style="block-size: 20rem"
          label="processStream.js"
          .plugins=${webPreset}
          filename="processStream.js"
          .defaultValue=${SOURCE}
          .diagnostics=${diagnostics}
          ><cdx-footer slot="footer" encoding="UTF-8"></cdx-footer>
        </cdx-code-editor>
        <cdx-code-editor
          style="block-size: 8rem"
          label="clean.js"
          .plugins=${webPreset}
          filename="clean.js"
          .defaultValue=${"export const answer = 42;\n"}
          .diagnostics=${[]}
          ><cdx-footer slot="footer" encoding="UTF-8"></cdx-footer>
        </cdx-code-editor>
      </div>
    `;
  },
};

/** A plugin can bring its own linter, scoped to one language through `forLanguage`. This one flags
 *  `var` and `debugger` and offers fixes: put the caret on a flagged line and click the lightbulb or
 *  press Mod-. to apply one.
 *  @type {Story} */
export const PluginLinter = {
  render: () => {
    const toyLint = defineCdxPlugin({
      id: "toy-lint",
      forLanguage: {
        javascript: () =>
          linter((view) => {
            const text = view.state.doc.toString();
            /** @type {import("@codemirror/lint").Diagnostic[]} */
            const found = [];
            for (const match of text.matchAll(/\bvar\b|\bdebugger\b/g)) {
              const index = match.index ?? 0;
              const isVar = match[0] === "var";
              found.push({
                from: index,
                to: index + match[0].length,
                severity: isVar ? "warning" : "error",
                message: isVar ? "Use let or const instead of var" : "Remove debugger statement",
                actions: [
                  isVar
                    ? {
                        name: "Change to let",
                        apply: (view, from, to) =>
                          view.dispatch({ changes: { from, to, insert: "let" } }),
                      }
                    : {
                        name: "Remove statement",
                        apply: (view, from) => {
                          const line = view.state.doc.lineAt(from);
                          view.dispatch({
                            changes: {
                              from: line.from,
                              to: Math.min(line.to + 1, view.state.doc.length),
                            },
                          });
                        },
                      },
                ],
              });
            }
            return found;
          }),
      },
    });
    return html`
      <cdx-code-editor
        style="block-size: 12rem"
        label="legacy.js"
        .plugins=${[...webPreset, toyLint]}
        filename="legacy.js"
        .defaultValue=${"var total = 0;\nfor (var i = 0; i < 10; i++) {\n  total += i;\n}\ndebugger;\n"}
        ><cdx-footer slot="footer" encoding="UTF-8"></cdx-footer>
      </cdx-code-editor>
    `;
  },
};
