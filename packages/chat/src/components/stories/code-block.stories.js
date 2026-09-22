import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import "@symblight/wc-material/icon-button";
import "@symblight/wc-material/icon";
import "@symblight/wc-material/tooltip";
import "@symblight/wc-material/button";

import contentCopyIcon from "@material-design-icons/svg/outlined/content_copy.svg?raw";
import checkIcon from "@material-design-icons/svg/outlined/check.svg?raw";

import { marked } from "marked";

import "../../index.js";
import "../code-block/code-block.js";
import "../paste-long-text/paste-long-text.js";
import { createSplitOnSendHandler } from "../../utils/split-message-parts.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Code Block API",
  component: "chx-code-block",
  tags: ["autodocs"],
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

const COPIED_RESET_MS = 1500;

/**
 * Example `slot="actions"` content — chx-code-block itself has no copy button; this is a plain
 * consumer-level component built against its public `code` property and `md-icon-button`'s own
 * toggle/selected pattern, same as chx-code-block's language menu uses `md-menu`/`md-button`.
 * @tag code-block-copy-action
 */
@customElement("code-block-copy-action")
export class CodeBlockCopyAction extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    code: { type: String },
    copied: { state: true },
  };

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #copiedResetTimer;

  #id = `code-block-copy-${crypto.randomUUID()}`;

  constructor() {
    super();
    /** @type {string} */
    this.code = "";
    /** @type {boolean} */
    this.copied = false;
  }

  handleClick = async () => {
    await navigator.clipboard.writeText(this.code);
    this.copied = true;
    this.dispatchEvent(
      new CustomEvent("chx-code-block-copy", {
        detail: { code: this.code },
        bubbles: true,
        composed: true,
      }),
    );
    clearTimeout(this.#copiedResetTimer);
    this.#copiedResetTimer = setTimeout(() => {
      this.copied = false;
    }, COPIED_RESET_MS);
  };

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this.#copiedResetTimer);
  }

  render() {
    // aria-label swaps with the copy, not just the tooltip text — screen readers reliably pick up
    // a changed accessible name on the element they just activated, unlike a passive tooltip swap.
    const label = this.copied ? "Copied!" : "Copy code";
    return html`
      <md-icon-button
        variant="tonal"
        selected
        id=${this.#id}
        aria-label=${label}
        ?toggle=${this.copied}
        @click=${this.handleClick}
      >
        <md-icon>${unsafeSVG(contentCopyIcon)}</md-icon>
        <md-icon slot="selected">${unsafeSVG(checkIcon)}</md-icon>
      </md-icon-button>
      <md-tooltip show-delay="100" hide-delay="50" for=${this.#id}>${label}</md-tooltip>
    `;
  }
}

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
    <chx-code-block lang="cobol" .code=${"IDENTIFICATION DIVISION.\nPROGRAM-ID. HELLO."}>
      <code-block-copy-action
        slot="actions"
        .code=${"IDENTIFICATION DIVISION.\nPROGRAM-ID. HELLO."}
      ></code-block-copy-action>
    </chx-code-block>
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
 * @param {import("../../types/message.js").ChxMessagePart} part
 * @param {HTMLElement} [previous]
 * @returns {HTMLElement}
 */
function renderCodePart(part, previous) {
  const block = /** @type {HTMLElement & {code: string, lang: string}} */ (
    previous ?? document.createElement("chx-code-block")
  );
  block.code = part.text ?? "";
  block.lang = /** @type {any} */ (part).lang ?? "";

  const copyAction = /** @type {HTMLElement & {code: string}} */ (
    block.querySelector("code-block-copy-action") ??
      document.createElement("code-block-copy-action")
  );
  copyAction.slot = "actions";
  copyAction.code = block.code;
  block.append(copyAction);

  return block;
}

/**
 * Rule for `paste` nodes (`schema.js`) — matches the `<span data-paste-lines>` chip
 * `paste-plugin.js` serializes into `getHTML()`, feeding `splitMessageParts` (see
 * `createSplitOnSendHandler` below) the same way `chipPartRule` does for command-picker chips.
 * @type {import("../../types/inline-part-rule.js").InlinePartRule}
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
  render: () => html`
    <chx-chat
      .partElements=${{ code: renderCodePart }}
      @chx-messages-change=${handleMessagesChange}
      .messages=${[
        {
          id: "msg-1",
          authorId: "user-1",
          own: true,
          createdAt: Date.now(),
          status: "sent",
          parts: [
            {
              id: "msg-1-t1",
              type: "text",
              text: "Can you show me the scroll-restore snapshot shape?",
            },
          ],
        },
        {
          id: "msg-2",
          authorId: "assistant",
          own: false,
          createdAt: Date.now(),
          status: "sent",
          parts: [
            {
              id: "msg-2-t1",
              type: "text",
              text: "Sure — here's the object infinity-scroll captures:",
            },
            { id: "msg-2-c1", type: "code", text: JS_SNIPPET, lang: "javascript" },
          ],
        },
        {
          id: "msg-3",
          authorId: "user-1",
          own: true,
          createdAt: Date.now(),
          status: "sent",
          parts: [{ id: "msg-3-t1", type: "text", text: "And a quick Python example?" }],
        },
        {
          id: "msg-4",
          authorId: "assistant",
          own: false,
          createdAt: Date.now(),
          status: "sent",
          parts: [
            { id: "msg-4-t1", type: "text", text: "Here you go:" },
            { id: "msg-4-c1", type: "code", text: PYTHON_SNIPPET, lang: "python" },
          ],
        },
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
 * markdown parser (see `commands.md`'s "Same mechanism, for markdown/HTML text rendering") —
 * `marked` here is an ordinary consumer-level choice, not something this library depends on or
 * knows about. Real apps should sanitize (DOMPurify or similar) before trusting `innerHTML` with
 * model/user-authored markdown; skipped here since this story's input is the developer's own.
 * @param {import("../../types/message.js").ChxMessagePart} part
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
  render: () => html`
    <chx-chat
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
