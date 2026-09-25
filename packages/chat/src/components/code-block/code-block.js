import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { when } from "lit/directives/when.js";
import { repeat } from "lit/directives/repeat.js";

import "@symblight/wc-material/button";
import "@symblight/wc-material/icon";
import "@symblight/wc-material/menu";

import expandMoreIcon from "@material-design-icons/svg/outlined/expand_more.svg?raw";

import { LANGUAGES, highlightToHTML } from "./highlight.js";
import { EditableBodyController } from "../../controllers/code-block/EditableBodyController.js";
import styles from "./code-block.css?inline";

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
    langMenu: { type: Boolean, attribute: "lang-menu" },
    editable: { type: Boolean },
    highlightedHTML: { state: true },
  };

  /** Links the label button to its `md-menu`, one per instance. @type {string} */
  #labelId = `chx-code-block-label-${crypto.randomUUID()}`;

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

    /** @type {string} Header text, replacing the language label — a terminal block wants the command
     *  it ran and a diff wants its file path, neither of which is a language. Empty falls back to
     *  `LANGUAGES[lang].label`. Also the editable body's aria-label. */
    this.label = "";

    /** @type {boolean} Header label becomes an md-menu trigger for picking `lang`. */
    this.langMenu = false;

    /** @type {boolean} Switches the body from a read-only `<pre>` to a `contenteditable` div. */
    this.editable = false;

    /** @type {string} Cached highlighted markup for the read-only `<pre>`, recomputed in `willUpdate`. */
    this.highlightedHTML = "";
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  /** Debounced only past the first render — typing triggers this on every keystroke, and only the
   *  last parse in a burst is ever shown. The first render is always immediate: a paste handler
   *  (or any consumer) setting `code`/`lang`/`editable` together on a freshly created block expects
   *  its content to appear at once, not 150ms later behind an empty body.
   * @param {import("lit").PropertyValues} changedProperties */
  willUpdate(changedProperties) {
    super.willUpdate(changedProperties);
    if (!changedProperties.has("code") && !changedProperties.has("lang")) return;

    if (!this.editable || !this.hasUpdated) {
      this.highlightedHTML = highlightToHTML(this.code, this.lang);
      return;
    }
    this.#editableBody.scheduleHighlight();
  }

  /** Pushes freshly highlighted markup into the contenteditable body once it changes.
   *  @param {import("lit").PropertyValues} changedProperties */
  updated(changedProperties) {
    super.updated(changedProperties);
    if (!this.editable) return;
    if (!changedProperties.has("highlightedHTML") && !changedProperties.has("editable")) return;
    this.#editableBody.syncDOM();
  }

  /** Applies the picked language from the `md-menu` and fires `chx-code-block-lang-change`.
   *  @param {CustomEvent<{value: string}>} event */
  handleLanguageSelect = (event) => {
    this.lang = event.detail.value;
    this.dispatchEvent(
      new CustomEvent("chx-code-block-lang-change", {
        detail: { lang: this.lang },
        bubbles: true,
        composed: true,
      }),
    );
  };

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

  /** @param {string} label */
  #renderBody(label) {
    return when(
      this.editable,
      () =>
        html`<div
          class="code-block__body"
          part="body"
          contenteditable="true"
          spellcheck="false"
          autocapitalize="off"
          role="textbox"
          aria-multiline="true"
          aria-label=${label}
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
          tabindex="0"
        ><code>${unsafeHTML(this.highlightedHTML)}</code></pre>`,
    );
  }

  render() {
    const label = this.label || (LANGUAGES[this.lang]?.label ?? "Plain text");
    return html`
      <div class="code-block" part="container">
        <div class="code-block__header" part="header">
          <div class="code-block__label-group" part="label-group">${this.#renderLabel(label)}</div>
          <div class="code-block__actions" part="actions">
            <slot name="actions"></slot>
          </div>
        </div>
        ${this.#renderBody(label)}
      </div>
    `;
  }
}
