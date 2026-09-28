import { html } from "lit";

import "@symblight/wc-material/button";
import "@symblight/wc-material/icon-button";
import "@symblight/wc-material/icon";

import refreshIcon from "@material-design-icons/svg/outlined/refresh.svg?raw";
import openInNewIcon from "@material-design-icons/svg/outlined/open_in_new.svg?raw";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import { marked } from "marked";

import "../index.js";
import "../components/code-block/code-block.js";
import "../components/paste-long-text/paste-long-text.js";
import { createSplitOnSendHandler } from "../utils/split-message-parts.js";
import { sleep } from "./shared/adapters.js";
import { makeMessage, textPart } from "./shared/fixtures.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Code Block API",
  component: "chx-code-block",
  tags: ["autodocs"],
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

const JS_SNIPPET = `{
  scrollTop: scroller.scrollTop,
  virtualScrollOffset: virtualizer.scrollOffset,
  scrollAdjustments: virtualizer.scrollAdjustments,
  scrollHeight: scroller.scrollHeight,
  firstVisibleKey: virtualizer.getVirtualItems()[0]?.key,
}`;

const PYTHON_SNIPPET = `def greet(name: str) -> str:
    """Say hello."""
    return f"Hello, {name}!"
`;

/** @type {Story} */
export const Basic = {
  render: () => html`
    <chx-code-block lang="javascript" .code=${JS_SNIPPET}>
      <md-button slot="actions" variant="text" @click=${() => console.log("undo")}>Undo</md-button>
      <md-button slot="actions" variant="outlined" @click=${() => console.log("keep")}
        >Keep</md-button
      >
      <md-button slot="actions" variant="filled" @click=${() => console.log("review")}
        >Review</md-button
      >
    </chx-code-block>
  `,
};

/** @type {Story} */
export const UnknownLanguage = {
  render: () => html`
    <chx-code-block
      lang="cobol"
      copyable
      .code=${"IDENTIFICATION DIVISION.\nPROGRAM-ID. HELLO."}
    ></chx-code-block>
  `,
};

const TS_SNIPPET = `function applyUpdate(update: SessionUpdate) {
  const prev = toolCalls.get(update.toolCallId);
  // patch on top, don't replace the object
  toolCalls.set(update.toolCallId, { ...prev, ...update });
  render(toolCalls.get(update.toolCallId));
}`;

/** `filename` after the language label, a `meta` slot, built-in wrap + copy, highlighted lines. */
/** @type {Story} */
export const Header = {
  argTypes: {
    highlightLines: { control: "text" },
    errorLines: { control: "text" },
  },
  args: {
    highlightLines: "3-4",
    errorLines: "",
  },
  render: (args) => html`
    <chx-code-block
      lang="typescript"
      filename="src/acp/reconcile.ts"
      copyable
      wrappable
      line-numbers
      highlight-lines=${args.highlightLines}
      error-lines=${args.errorLines}
      .code=${TS_SNIPPET}
    >
      <span slot="meta">6 lines</span>
    </chx-code-block>
  `,
};

const STREAM_TARGET = TS_SNIPPET;

/** Caret after the last character; the copy button stays hidden until streaming ends. */
/** @type {Story} */
export const Streaming = {
  render: () => {
    /** @param {Event} event */
    const start = async (event) => {
      const block = /** @type {any} */ (
        /** @type {HTMLElement} */ (event.currentTarget).nextElementSibling
      );
      block.streaming = true;
      block.code = "";
      for (const char of STREAM_TARGET) {
        block.code += char;
        await sleep(20);
      }
      block.streaming = false;
    };
    return html`
      <md-button variant="outlined" @click=${start} style="margin-block-end: 1rem"
        >Stream</md-button
      >
      <chx-code-block
        lang="typescript"
        filename="reconcile.ts"
        copyable
        streaming
        .code=${"const prev = toolCalls.get(id);\n  toolCalls.set(id, { ..."}
      ></chx-code-block>
    `;
  },
};

const PACKAGE_JSON = JSON.stringify(
  {
    name: "chx-workbench",
    private: true,
    type: "module",
    scripts: {
      dev: "vite",
      build: "tsc && vite build",
      test: "vitest run",
      lint: "eslint .",
      format: "prettier --write .",
      typecheck: "tsc --noEmit",
    },
    dependencies: {
      lit: "^3.2.0",
      "@tanstack/lit-virtual": "^3.13.0",
      "@lezer/highlight": "^1.2.1",
      "prosemirror-view": "^1.42.0",
      "prosemirror-state": "^1.4.3",
    },
    devDependencies: {
      vite: "^6.0.0",
      typescript: "^5.6.0",
      vitest: "^2.1.0",
      eslint: "^9.15.0",
      prettier: "^3.4.0",
      "@web/test-runner": "^0.19.0",
      "@web/test-runner-playwright": "^0.11.0",
      storybook: "^8.4.0",
    },
    engines: { node: ">=20" },
    packageManager: "pnpm@9.15.0",
  },
  null,
  2,
);

const PACKAGE_JSON_LINES = PACKAGE_JSON.split("\n").length;

/** Long file: clamped to `collapsed-lines` behind a fade and a "Show all N lines" toggle. */
/** @type {Story} */
export const LongFile = {
  argTypes: {
    collapsedLines: { control: { type: "number", min: 1 } },
  },
  args: {
    collapsedLines: 7,
  },
  render: (args) => html`
    <chx-code-block
      lang="json"
      filename="package.json"
      copyable
      line-numbers
      collapsible
      collapsed-lines=${args.collapsedLines}
      .code=${PACKAGE_JSON}
    >
      <span slot="meta">${PACKAGE_JSON_LINES} lines</span>
    </chx-code-block>
  `,
};

const LOCATION_EXCERPT = `  onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowUp') this.selectedIndex--;
  }`;

/** A line referenced from a tool call's `locations`: an excerpt numbered from `start-line`, with
 *  `highlight-lines` pointing at the displayed number, not the index inside the excerpt. */
/** @type {Story} */
export const HighlightedLine = {
  render: () => html`
    <chx-code-block
      lang="typescript"
      filename="mention-menu.ts:9"
      line-numbers
      start-line="8"
      highlight-lines="9"
      .code=${LOCATION_EXCERPT}
    >
      <md-icon-button slot="actions" aria-label="Open in editor">
        <md-icon>${unsafeSVG(openInNewIcon)}</md-icon>
      </md-icon-button>
    </chx-code-block>
  `,
};

const FAILED_RUN = `$ pnpm test -- mention-menu

FAIL  src/mention-menu.test.ts
  ✕ wraps to last item on ArrowUp (5 ms)
    expected 6 to be 0`;

/** `error` tints only the header — the output underneath stays readable. `prompt="$"` renders the
 *  prompt unselectable and leaves it out of the copied text. */
/** @type {Story} */
export const ErrorState = {
  render: () => html`
    <chx-code-block
      lang="bash"
      label="Shell"
      filename="exit code 1"
      prompt="$"
      error
      .code=${FAILED_RUN}
    >
      <md-icon-button slot="actions" aria-label="Retry">
        <md-icon>${unsafeSVG(refreshIcon)}</md-icon>
      </md-icon-button>
    </chx-code-block>
  `,
};

const TS_DIFF = `   onKeyDown(e) {
-    if (e.key === 'ArrowUp') this.selectedIndex--;
+    if (e.key === 'ArrowUp')
+      this.selectedIndex = (this.selectedIndex - 1 + len) % len;
   }`;

/** `diff` + `lang="typescript"`: full-row backgrounds with the `+`/`−` sign beside them, and the
 *  content still syntax-highlighted. Removed lines take old-side numbers, the rest new-side. */
/** @type {Story} */
export const Diff = {
  render: () => html`
    <chx-code-block
      lang="typescript"
      diff
      filename="mention-menu.ts"
      copyable
      line-numbers
      start-line="8"
      .code=${TS_DIFF}
    >
      <span slot="meta">+2 −1</span>
    </chx-code-block>
  `,
};

const UNIFIED_DIFF = `@@ -8,4 +8,5 @@
   onKeyDown(e) {
-    if (e.key === 'ArrowUp') this.selectedIndex--;
+    if (e.key === 'ArrowUp')
+      this.selectedIndex = (this.selectedIndex - 1 + len) % len;
   }`;

/** `lang="diff"`: a raw unified diff with no grammar, as `chx-tool-call-diff` renders it. `@@` hunk
 *  headers set the line numbers. */
/** @type {Story} */
export const UnifiedDiff = {
  render: () => html`
    <chx-code-block
      lang="diff"
      filename="mention-menu.ts"
      copyable
      line-numbers
      .code=${UNIFIED_DIFF}
    ></chx-code-block>
  `,
};

/** @type {Story} */
export const Editable = {
  argTypes: {
    editable: { control: "boolean" },
  },
  args: {
    editable: true,
  },
  render: (args) => html`
    <chx-code-block
      lang="javascript"
      .code=${JS_SNIPPET}
      ?editable=${args.editable}
    ></chx-code-block>
  `,
};

/**
 * Renders a `type: "code"` message part as a `<chx-code-block>` — a `chx-chat.partElements` entry,
 * the same generic extension point `messageElement`/other part types already use. `type: "code"`
 * isn't a part type this library defines or validates, it's just a shape this story picked.
 * Reuses `previous` across re-renders rather than always creating a new element, same contract
 * `messageElement`/other custom renderers follow.
 * @param {import("../types/message.js").ChxMessagePart} part
 * @param {HTMLElement} [previous]
 * @returns {HTMLElement}
 */
function renderCodePart(part, previous) {
  const block = /** @type {HTMLElement & {code: string, lang: string, copyable: boolean}} */ (
    previous ?? document.createElement("chx-code-block")
  );
  block.code = part.text ?? "";
  block.lang = /** @type {any} */ (part).lang ?? "";
  block.copyable = true;
  return block;
}

/**
 * Rule for `paste` nodes (`schema.js`) — matches the `<span data-paste-lines>` chip
 * `paste-plugin.js` serializes into `getHTML()`, feeding `splitMessageParts` (see
 * `createSplitOnSendHandler` below) the same way `chipPartRule` does for command-picker chips.
 * @type {import("../types/inline-part-rule.js").InlinePartRule}
 */
const codePartRule = {
  type: "code",
  selector: "span[data-paste-lines]",
  toPart: (element) => ({ text: element.textContent ?? "", lang: element.dataset.lang ?? "" }),
};

const handleMessagesChange = createSplitOnSendHandler([codePartRule]);

/**
 * A mocked historical conversation with code-block parts mixed into ordinary text parts, wired up
 * entirely through `partElements` — no new chat/composer API involved. Also slots in
 * `<chx-paste-long-text>` + `handleMessagesChange` so pasting/sending a new code snippet through the
 * composer below stays a `<chx-code-block>` after send too, not just in the pre-authored history
 * above.
 */
/** @type {Story} */
export const MockedMessages = {
  args: { compact: false },
  argTypes: {
    compact: { name: "Compact mode", control: "boolean" },
  },
  render: (args) => html`
    <chx-chat
      .compact=${args.compact}
      .partElements=${{ code: renderCodePart }}
      @chx-messages-change=${handleMessagesChange}
      .messages=${[
        makeMessage({
          id: "msg-1",
          own: true,
          text: "Can you show me the scroll-restore snapshot shape?",
        }),
        makeMessage({
          id: "msg-2",
          own: false,
          parts: [
            textPart("msg-2-t1", "Sure — here's the object infinity-scroll captures:"),
            { id: "msg-2-c1", type: "code", text: JS_SNIPPET, lang: "javascript" },
          ],
        }),
        makeMessage({ id: "msg-3", own: true, text: "And a quick Python example?" }),
        makeMessage({
          id: "msg-4",
          own: false,
          parts: [
            textPart("msg-4-t1", "Here you go:"),
            { id: "msg-4-c1", type: "code", text: PYTHON_SNIPPET, lang: "python" },
          ],
        }),
      ]}
    >
      <chx-message-list slot="message-list"></chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <chx-paste-long-text slot="paste-long-text"></chx-paste-long-text>
      </chx-message-composer>
    </chx-chat>
  `,
};

/**
 * `partElements.text` — the same generic extension point `partElements.code`/`.chip` use, checked
 * for *every* part type including `"text"` before any built-in fallback. This package ships no
 * markdown parser — `marked` here is an ordinary consumer-level choice, not something this library
 * depends on or knows about. Real apps should sanitize (DOMPurify or similar) before trusting
 * `innerHTML` with model/user-authored markdown; skipped here since this story's input is the
 * developer's own.
 * @param {import("../types/message.js").ChxMessagePart} part
 * @returns {HTMLElement}
 */
function renderMarkdownText(part) {
  const div = document.createElement("div");
  div.innerHTML = /** @type {string} */ (marked.parse(part.text ?? "", { async: false }));
  return div;
}

/**
 * `<chx-paste-long-text>` slotted into `chx-message-composer` — code detection is built in, no
 * consumer wiring needed. Paste a multi-line snippet (JS, TS, JSON, Python, or CSS — see
 * detect-language.js's default candidates) into the field below and it collapses to a
 * `<chx-code-block>` chip automatically; paste plain prose and it stays plain text (or, at 205+
 * lines, the generic "N lines" chip — same threshold precedence either way). Also wires
 * `partElements` for both `code` (survives send, via `handleMessagesChange` above) and `text`
 * (rendered as markdown via `renderMarkdownText`) — try typing "**bold**, _italic_, or a
 * [link](https://example.com)" alongside a pasted snippet in the same message.
 */
/** @type {Story} */
export const PasteRecognizesCode = {
  args: { compact: false },
  argTypes: {
    compact: { name: "Compact mode", control: "boolean" },
  },
  render: (args) => html`
    <chx-chat
      .compact=${args.compact}
      .partElements=${{ code: renderCodePart, text: renderMarkdownText }}
      @chx-messages-change=${handleMessagesChange}
    >
      <chx-message-list slot="message-list"></chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Paste some code...">
        <chx-paste-long-text slot="paste-long-text"></chx-paste-long-text>
      </chx-message-composer>
    </chx-chat>
  `,
};
