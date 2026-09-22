import { LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import "../paste-chip/paste-chip.js";
import "../code-block/code-block.js";
import { detectLanguage } from "./detect-language.js";

import styles from "./paste-long-text.css?inline";

/**
 * @tag chx-paste-long-text
 * @summary Collapses a long paste in chx-message-composer into a chip — a plain "N lines" chip by
 * default, or a `chx-code-block` chip when the pasted text looks like code. Renders nothing itself;
 * reaches into its ancestor chx-message-composer's editor directly (see #registerWithEditor) so
 * chx-message-composer/chx-textbox carry no paste-specific properties at all.
 */
@customElement("chx-paste-long-text")
export class ChxPasteLongText extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    pasteThreshold: { type: Number, attribute: "paste-threshold" },
    minCodeLines: { type: Number, attribute: "min-code-lines" },
    codeLanguages: { attribute: false },
    maxCodeErrorRatio: { type: Number, attribute: "max-code-error-ratio" },
  };

  // real private fields must be declared here, in the class body — a bare `this.#foo = ...` inside
  // the constructor alone isn't enough
  /** @type {import("../message-composer/message-composer.js").ChxMessageComposer | undefined} */
  #composer;

  constructor() {
    super();

    /** @type {number} Pastes of at least this many lines collapse to a chip; <= 0 disables. */
    this.pasteThreshold = 205;

    /** @type {number} Below this line count, a paste is never checked for code — see detectLanguage. */
    this.minCodeLines = 2;

    /** @type {string[] | undefined} Candidate language ids — defaults to detect-language.js's own list. */
    this.codeLanguages = undefined;

    /** @type {number | undefined} Highest tolerated parse-error ratio — see detect-language.js. */
    this.maxCodeErrorRatio = undefined;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  connectedCallback() {
    super.connectedCallback();
    this.#registerWithEditor();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#composer?.editor?.configurePasteLongText(null);
    this.#composer = undefined;
  }

  /**
   * The editor is constructed asynchronously (chx-textbox's own `firstUpdated()`, itself reached
   * only after chx-message-composer's first render) — awaiting both `updateComplete`s in turn is
   * the same ordering `handleSend`/`focus()` already rely on elsewhere, and is guaranteed to run
   * after `firstUpdated()` since Lit resolves `updateComplete` only once that's already happened.
   */
  async #registerWithEditor() {
    const composer =
      /** @type {import("../message-composer/message-composer.js").ChxMessageComposer | null} */ (
        this.closest("chx-message-composer")
      );
    if (!composer) return;
    this.#composer = composer;

    await composer.updateComplete;
    await composer.textboxElement?.updateComplete;
    if (this.#composer !== composer) return; // disconnected again while awaiting

    composer.editor?.configurePasteLongText({
      getPasteThreshold: () => this.pasteThreshold,
      classify: (text, lines) => this.classify(text, lines),
      buildElement: (attrs, source) => this.buildElement(attrs, source),
    });
  }

  /**
   * Is `text` code? Called synchronously during the original paste — a paste at or over
   * `pasteThreshold` always wins first and never reaches this (see paste-plugin.js's own
   * precedence doc).
   * @param {string} text
   * @param {number} lines
   * @returns {{lang: string} | null}
   */
  classify(text, lines) {
    if (lines < this.minCodeLines) return null;
    const detected = detectLanguage(text, {
      languages: this.codeLanguages,
      maxErrorRatio: this.maxCodeErrorRatio,
    });
    return detected ? { lang: detected.lang } : null;
  }

  /**
   * Draws the collapsed paste's element — the single place both a fresh paste and a later
   * reconstruction (undo/redo, restoring a draft) draw from. Named generically, not `buildChip`:
   * it can return any element (a `chx-code-block` below, or a plain chip). Override to customize
   * the look; `data.lang` set means `classify()` matched code.
   * @param {{text: string, lines: number, data: Record<string, unknown>}} attrs
   * @param {"composer"} _source
   * @returns {HTMLElement}
   */
  buildElement({ text, lines, data }, _source) {
    if (typeof data?.lang === "string") {
      const block =
        /** @type {HTMLElement & {code: string, lang: string, langMenu: boolean, editable: boolean}} */ (
          document.createElement("chx-code-block")
        );
      block.code = text;
      block.lang = data.lang;
      block.langMenu = true;
      block.editable = true;
      return block;
    }

    const chip = /** @type {import("../paste-chip/paste-chip.js").ChxPasteChip} */ (
      document.createElement("chx-paste-chip")
    );
    chip.lines = lines;
    return chip;
  }
}
