import { html } from "lit";

import "../index.js";
import { webPreset } from "../presets/index.js";

const HEAD = `/** @param {ReadableStream<Uint8Array>} stream */
async function* readChunks(stream) {
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
  }
}

export async function processStream(stream, { buffer, ingest }) {
  for await (const item of readChunks(stream)) {
    const chunk = ingest(item);
    buffer.push(chunk);
  }
  buffer.flushAll();
}
`;

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

export class StreamReader {
  constructor(buffer) {
    this.buffer = buffer;
  }

  async processStream(stream, { ingest }) {
    for await (const item of readChunks(stream)) {
      const chunk = ingest(item);
      if (!chunk) continue;
      this.buffer.push(chunk);
    }
    this.buffer.flushAll();
  }
}
`;

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Code Editor/Footer",
  component: "cdx-code-editor",
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** The status bar is opt-in: a `<cdx-footer slot="footer">`. Crumbs follow the caret — click a
 *  symbol for its siblings; the position opens "Go to line"; `+N −M` toggles the diff vs HEAD.
 *  Path, language, encoding and environment clicks reach the app as `cdx-status-click`. The
 *  narrow editor below shows the container-query steps (720dp, 560dp).
 *  @type {Story} */
export const Footer = {
  render: () => {
    /** @param {CustomEvent<{ item: string, index?: number }>} event */
    const handleStatusClick = (event) => {
      const log = document.getElementById("footer-log");
      if (log) log.textContent = `cdx-status-click → ${JSON.stringify(event.detail)}`;
    };
    const editor = (/** @type {string} */ width) => html`
      <cdx-code-editor
        style="block-size: 22rem; inline-size: ${width}"
        label="processStream.js"
        .plugins=${webPreset}
        filename="processStream.js"
        .defaultValue=${SOURCE}
        .baseline=${HEAD}
        @cdx-status-click=${handleStatusClick}
      >
        <cdx-footer
          slot="footer"
          path="chat/src/stream/processStream.js"
          encoding="UTF-8"
          environment="Node 22"
        ></cdx-footer>
        <span slot="status" style="padding: 0 6px; color: var(--md-sys-color-tertiary)"
          >● Live</span
        >
      </cdx-code-editor>
    `;
    return html`
      <div style="display: grid; gap: 16px; font: 12px system-ui">
        ${editor("100%")} ${editor("520px")}
        <span id="footer-log" style="opacity: 0.7"></span>
      </div>
    `;
  },
};
