import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { styleMap } from "lit/directives/style-map.js";
import { when } from "lit/directives/when.js";
import { repeat } from "lit/directives/repeat.js";

import "@symblight/wc-material/button";
import "@symblight/wc-material/icon";
import "@symblight/wc-material/icon-button";
import "@symblight/wc-material/menu";
import "@symblight/wc-material/tooltip";

import expandMoreIcon from "@material-design-icons/svg/outlined/expand_more.svg?raw";
import contentCopyIcon from "@material-design-icons/svg/outlined/content_copy.svg?raw";
import checkIcon from "@material-design-icons/svg/outlined/check.svg?raw";
import wrapTextIcon from "@material-design-icons/svg/outlined/wrap_text.svg?raw";

import { LANGUAGES, highlightToHTML, highlightToLines, renderLinePrefix } from "./highlight.js";
import { EditableBodyController } from "../../controllers/code-block/EditableBodyController.js";
import styles from "./code-block.css?inline";

const COPIED_RESET_MS = 1500;

/** Parses a `"3,5-7"` line spec into line numbers, clamped to `[min, max]` so a huge range can't
 *  stall the main thread.
 * @param {string} spec @param {number} min @param {number} max @returns {Set<number>} */
function parseLineRanges(spec, min, max) {
  const lines = new Set();
  for (const part of spec.split(",")) {
    const [start, end = start] = part.split("-").map((n) => Number.parseInt(n, 10));
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    for (let line = Math.max(start, min); line <= Math.min(end, max); line++) lines.add(line);
  }
  return lines;
}

/**
 * @tag chx-code-block
 * @summary Syntax-highlighted code block; read-only by default, editable via `editable`.
 */
@customElement("chx-code-block")
export class ChxCodeBlock extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    code: { type: String },
    lang: { type: String },
    label: { type: String },
    filename: { type: String },
    langMenu: { type: Boolean, attribute: "lang-menu" },
    editable: { type: Boolean },
    copyable: { type: Boolean },
    wrappable: { type: Boolean },
    wrap: { type: Boolean, reflect: true },
    highlightLines: { type: String, attribute: "highlight-lines" },
    errorLines: { type: String, attribute: "error-lines" },
    lineNumbers: { type: Boolean, attribute: "line-numbers" },
    startLine: { type: Number, attribute: "start-line" },
    diff: { type: Boolean },
    prompt: { type: String },
    streaming: { type: Boolean, reflect: true },
    error: { type: Boolean, reflect: true },
    collapsible: { type: Boolean },
    collapsedLines: { type: Number, attribute: "collapsed-lines" },
    expanded: { type: Boolean, reflect: true },
    highlightedHTML: { state: true },
    copied: { state: true },
  };

  /** Links the label button to its `md-menu`, one per instance. @type {string} */
  #labelId = `chx-code-block-label-${crypto.randomUUID()}`;
  #bodyId = `chx-code-block-body-${crypto.randomUUID()}`;
  #copyId = `chx-code-block-copy-${crypto.randomUUID()}`;
  #wrapId = `chx-code-block-wrap-${crypto.randomUUID()}`;

  /** @type {import("./highlight.js").HighlightedLine[]} */
  #lines = [];
  /** Displayed number per entry of `#lines`; `null` for a diff meta line. @type {(number | null)[]} */
  #numbers = [];
  /** Character width of the widest displayed number — sizes the gutter. */
  #gutterDigits = 2;
  /** Read-only body markup, rebuilt in `willUpdate` only when something it depends on changed. */
  #bodyHTML = "";

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #copiedResetTimer;

  /** @type {EditableBodyController} */
  #editableBody = new EditableBodyController(this, {
    getContainer: () => {
      const el = this.renderRoot.querySelector(".code-block__body[contenteditable]");
      return el instanceof HTMLElement ? el : null;
    },
    getCode: () => this.code,
    setCode: (code) => {
      this.code = code;
    },
    getHighlightedHTML: () => this.highlightedHTML,
    setHighlightedHTML: (highlightedHTML) => {
      this.highlightedHTML = highlightedHTML;
    },
    highlight: () => highlightToHTML(this.code, this.lang),
  });

  constructor() {
    super();

    /** @type {string} The block's plain-text source. */
    this.code = "";

    /** @type {string} See LANGUAGES in highlight.js. */
    this.lang = "";

    /** @type {string} Replaces the language label in the header, e.g. the command a terminal block
     *  ran. Empty falls back to `LANGUAGES[lang].label`. Also the editable body's aria-label. */
    this.label = "";

    /** @type {string} File path shown after the language label. */
    this.filename = "";

    /** @type {boolean} Header label becomes an md-menu trigger for picking `lang`. */
    this.langMenu = false;

    /** @type {boolean} Switches the body from a read-only `<pre>` to a `contenteditable` div. */
    this.editable = false;

    /** @type {boolean} Renders a copy button in the header (hidden while `streaming`). */
    this.copyable = false;

    /** @type {boolean} Renders a toggle button in the header that flips `wrap`. */
    this.wrappable = false;

    /** @type {boolean} Soft-wraps long lines instead of scrolling horizontally. */
    this.wrap = false;

    /** @type {string} 1-based lines to highlight, e.g. `"3,5-7"`. Read-only mode only. */
    this.highlightLines = "";

    /** @type {string} 1-based lines to mark as errors, same format. Read-only mode only. */
    this.errorLines = "";

    /** @type {boolean} Renders a line-number gutter. Read-only mode only. */
    this.lineNumbers = false;

    /** @type {number} Number of the first line, e.g. for an excerpt from the middle of a file.
     *  `highlight-lines`/`error-lines` refer to these displayed numbers. */
    this.startLine = 1;

    /** @type {boolean} `code` is a unified diff whose content is highlighted as `lang`, so a
     *  TypeScript diff keeps its syntax colors. `lang="diff"` implies this, without a grammar. */
    this.diff = false;

    /** @type {string} Shell prompt, e.g. `"$"`. A line starting with `"<prompt> "` renders it
     *  unselectable and the copy button leaves it out. */
    this.prompt = "";

    /** @type {boolean} Code is still arriving: shows a caret after the last character. */
    this.streaming = false;

    /** @type {boolean} Error state, e.g. a command that exited non-zero — tints the header only. */
    this.error = false;

    /** @type {boolean} Clamps a block longer than `collapsedLines` behind a "Show all" toggle. */
    this.collapsible = false;

    /** @type {number} Visible line count while collapsed. */
    this.collapsedLines = 8;

    /** @type {boolean} Whether a collapsible block is currently expanded. */
    this.expanded = false;

    /** @type {string} Cached flat highlighted markup for the editable body. */
    this.highlightedHTML = "";

    /** @type {boolean} */
    this.copied = false;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this.#copiedResetTimer);
  }

  /** Editable re-highlighting is debounced past the first render — typing triggers this on every
   *  keystroke, and only the last parse in a burst is ever shown.
   * @param {import("lit").PropertyValues} changedProperties */
  willUpdate(changedProperties) {
    super.willUpdate(changedProperties);
    const sourceChanged = ["code", "lang", "diff", "prompt"].some((key) =>
      changedProperties.has(key),
    );

    if (this.editable) {
      if (changedProperties.has("editable")) {
        this.highlightedHTML = highlightToHTML(this.code, this.lang);
      } else if (sourceChanged) {
        this.#editableBody.scheduleHighlight();
      }
      return;
    }

    if (sourceChanged || changedProperties.has("editable") || changedProperties.has("streaming")) {
      this.#lines = highlightToLines(this.code, this.lang, {
        diff: this.diff,
        prompt: this.prompt,
      });
      // A trailing newline ends the last line, it doesn't start a new one — unless code is still
      // streaming in, where the caret belongs on that fresh line.
      const tail = this.#lines.at(-1);
      if (!this.streaming && this.#lines.length > 1 && tail?.html === "" && !tail.prompt) {
        this.#lines.pop();
      }
    }
    if (
      sourceChanged ||
      ["editable", "highlightLines", "errorLines", "streaming", "lineNumbers", "startLine"].some(
        (key) => changedProperties.has(key),
      )
    ) {
      this.#bodyHTML = this.#buildBodyHTML();
    }
  }

  /** Pushes freshly highlighted markup into the contenteditable body once it changes.
   *  @param {import("lit").PropertyValues} changedProperties */
  updated(changedProperties) {
    super.updated(changedProperties);
    if (!this.editable) return;
    if (!changedProperties.has("highlightedHTML") && !changedProperties.has("editable")) return;
    this.#editableBody.syncDOM();
  }

  /** A diff numbers removed lines on the old side and everything else on the new side, restarting
   *  at each `@@` hunk header. */
  #computeNumbers() {
    let oldLine = this.startLine;
    let newLine = this.startLine;
    return this.#lines.map((line) => {
      switch (line.kind) {
        case "meta":
          if (line.hunk) ({ oldStart: oldLine, newStart: newLine } = line.hunk);
          return null;
        case "removed":
          return oldLine++;
        case "added":
          return newLine++;
        case "context":
          oldLine++;
          return newLine++;
        default:
          return newLine++;
      }
    });
  }

  /** One string for all lines, so `unsafeHTML` commits a streaming update as a single innerHTML. */
  #buildBodyHTML() {
    this.#numbers = this.#computeNumbers();
    // A loop, not Math.min(...spread) — spreading a very long file overflows the call stack.
    let lowest = Infinity;
    let widest = 0;
    for (const n of this.#numbers) {
      if (n === null) continue;
      lowest = Math.min(lowest, n);
      widest = Math.max(widest, n);
    }
    this.#gutterDigits = Math.max(2, String(widest).length);
    const highlighted = parseLineRanges(this.highlightLines, lowest, widest);
    const errored = parseLineRanges(this.errorLines, lowest, widest);
    const last = this.#lines.length - 1;
    return this.#lines
      .map((line, index) => {
        const number = this.#numbers[index];
        let classes = "code-block__line";
        if (line.kind && line.kind !== "context") classes += ` code-block__line_${line.kind}`;
        if (number !== null && highlighted.has(number)) classes += " code-block__line_highlighted";
        if (number !== null && errored.has(number)) classes += " code-block__line_error";
        const gutter = this.lineNumbers
          ? `<span class="code-block__number" aria-hidden="true">${number ?? ""}</span>`
          : "";
        const caret =
          this.streaming && index === last
            ? `<span class="code-block__caret" aria-hidden="true"></span>`
            : "";
        // Keeps a sign-less diff line (blank, `\ No newline…`) aligned with its signed neighbours.
        const signSlot =
          line.kind && line.kind !== "meta" && !line.sign
            ? `<span class="code-block__sign"></span>`
            : "";
        return `<span class="${classes}">${gutter}${signSlot}${renderLinePrefix(line)}<span class="code-block__text">${line.html}${caret}</span></span>`;
      })
      .join("");
  }

  /** The copied text leaves prompts out — pasting `$ pnpm test` into a shell would fail. */
  get #copyText() {
    if (!this.prompt) return this.code;
    const prefix = `${this.prompt} `;
    return this.code
      .split("\n")
      .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line))
      .join("\n");
  }

  get #isCollapsed() {
    return (
      this.collapsible &&
      !this.editable &&
      !this.expanded &&
      this.#lines.length > this.collapsedLines
    );
  }

  /** Applies the picked language from the `md-menu` and fires `chx-code-block-lang-change`.
   *  @param {CustomEvent<{value: string}>} event */
  handleLanguageSelect = (event) => {
    this.lang = event.detail.value;
    this.#emit("chx-code-block-lang-change", { lang: this.lang });
  };

  handleCopyClick = async () => {
    try {
      await navigator.clipboard.writeText(this.#copyText);
    } catch {
      return;
    }
    this.copied = true;
    this.#emit("chx-code-block-copy", { code: this.#copyText });
    clearTimeout(this.#copiedResetTimer);
    this.#copiedResetTimer = setTimeout(() => {
      this.copied = false;
    }, COPIED_RESET_MS);
  };

  handleWrapClick = () => {
    this.wrap = !this.wrap;
    this.#emit("chx-code-block-wrap-change", { wrap: this.wrap });
  };

  handleToggleClick = () => {
    this.expanded = !this.expanded;
    this.#emit("chx-code-block-expanded-change", { expanded: this.expanded });
  };

  /** @param {string} type @param {unknown} detail */
  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  /** @param {string} label */
  #renderLabel(label) {
    return when(
      this.langMenu,
      () => html`
        <md-button class="code-block__button" part="label" id=${this.#labelId} variant="text">
          <md-icon slot="icon" aria-hidden="true">${unsafeSVG(expandMoreIcon)}</md-icon>
          ${label}
        </md-button>
        <md-menu for=${this.#labelId} @select=${this.handleLanguageSelect}>
          <md-menu-item value="">Plain text</md-menu-item>
          ${repeat(
            Object.entries(LANGUAGES),
            ([id]) => id,
            ([id, entry]) => html`<md-menu-item value=${id}>${entry.label}</md-menu-item>`,
          )}
        </md-menu>
      `,
      () => html`<span class="code-block__label" part="label">${label}</span>`,
    );
  }

  #renderFilename() {
    if (!this.filename) return nothing;
    return html`
      <span class="code-block__separator" aria-hidden="true"></span>
      <span class="code-block__filename" part="filename" title=${this.filename}
        >${this.filename}</span
      >
    `;
  }

  #renderWrapButton() {
    if (!this.wrappable) return nothing;
    const label = this.wrap ? "Disable line wrap" : "Wrap lines";
    return html`
      <md-icon-button
        class="code-block__icon-button"
        part="wrap"
        id=${this.#wrapId}
        aria-label=${label}
        aria-pressed=${this.wrap ? "true" : "false"}
        ?selected=${this.wrap}
        @click=${this.handleWrapClick}
      >
        <md-icon>${unsafeSVG(wrapTextIcon)}</md-icon>
      </md-icon-button>
      <md-tooltip show-delay="300" for=${this.#wrapId}>${label}</md-tooltip>
    `;
  }

  /** The accessible name swaps along with the icon, so a screen reader hears the confirmation on
   *  the button it just activated; the visual toast is `aria-hidden`. */
  #renderCopyButton() {
    if (!this.copyable || this.streaming) return nothing;
    const label = this.copied ? "Copied" : "Copy code";
    return html`
      <md-icon-button
        class="code-block__icon-button"
        part="copy"
        id=${this.#copyId}
        aria-label=${label}
        @click=${this.handleCopyClick}
      >
        <md-icon>${unsafeSVG(this.copied ? checkIcon : contentCopyIcon)}</md-icon>
      </md-icon-button>
      <md-tooltip show-delay="300" for=${this.#copyId}>Copy code</md-tooltip>
    `;
  }

  /** @param {string} label */
  #renderBody(label) {
    return when(
      this.editable,
      () =>
        html`<div
          class="code-block__body"
          part="body"
          id=${this.#bodyId}
          contenteditable="true"
          spellcheck="false"
          autocapitalize="off"
          role="textbox"
          aria-multiline="true"
          aria-label=${this.filename || label}
          @input=${this.#editableBody.handleInput}
          @keydown=${this.#editableBody.handleKeydown}
          @paste=${this.#editableBody.handlePaste}
          @compositionstart=${this.#editableBody.handleCompositionStart}
          @compositionend=${this.#editableBody.handleCompositionEnd}
        ></div>`,
      () =>
        html`<pre
          class="code-block__body"
          part="body"
          id=${this.#bodyId}
          tabindex="0"
          aria-busy=${this.streaming ? "true" : "false"}
        ><code class="code-block__code">${unsafeHTML(this.#bodyHTML)}</code></pre>`,
    );
  }

  #renderToggle() {
    const overflows =
      this.collapsible && !this.editable && this.#lines.length > this.collapsedLines;
    if (!overflows) return nothing;
    return html`
      <button
        class="code-block__toggle"
        part="toggle"
        type="button"
        aria-controls=${this.#bodyId}
        aria-expanded=${this.expanded ? "true" : "false"}
        @click=${this.handleToggleClick}
      >
        ${this.expanded ? "Show less" : `Show all ${this.#lines.length} lines`}
        <span class="code-block__toggle-icon" aria-hidden="true">${unsafeSVG(expandMoreIcon)}</span>
      </button>
    `;
  }

  render() {
    const label = this.label || (LANGUAGES[this.lang]?.label ?? "Plain text");
    const collapsed = this.#isCollapsed;
    return html`
      <div class="code-block" part="container">
        <div class="code-block__header" part="header">
          <div class="code-block__label-group" part="label-group">
            ${this.#renderLabel(label)} ${this.#renderFilename()}
          </div>
          <div class="code-block__actions" part="actions">
            <span class="code-block__meta" part="meta"><slot name="meta"></slot></span>
            <slot name="actions"></slot>
            ${this.#renderWrapButton()} ${this.#renderCopyButton()}
          </div>
        </div>
        <div
          class="code-block__viewport ${collapsed ? "code-block__viewport_collapsed" : ""}"
          style=${styleMap({
            "--_collapsed-lines": String(this.collapsedLines),
            "--_gutter-digits": String(this.#gutterDigits),
          })}
        >
          ${this.#renderBody(label)}
          ${collapsed ? html`<div class="code-block__fade" aria-hidden="true"></div>` : nothing}
        </div>
        ${this.#renderToggle()}
        <div
          class="code-block__toast ${this.copied ? "code-block__toast_visible" : ""}"
          aria-hidden="true"
        >
          Copied
        </div>
      </div>
    `;
  }
}
