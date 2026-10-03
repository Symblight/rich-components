import { LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import "../paste-chip/paste-chip.js";
import "../code-block/code-block.js";
import { detectLanguage } from "./detect-language.js";
import { EDITOR_EXTENSION } from "../../editor/extension.js";

import styles from "./paste-long-text.css?inline";

/**
 * @tag chx-paste-long-text
 * @summary Collapses a long paste in chx-message-composer into a chip — a plain "N lines" chip by
 * default, or a `chx-code-block` chip when the pasted text looks like code. Renders nothing; an
 * editor extension (`EDITOR_EXTENSION`) picked up by its parent chx-message-composer.
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

  /** Editor hooks — picked up by the parent chx-message-composer. @returns {import("../../editor/extension.js").EditorExtension} */
  get [EDITOR_EXTENSION]() {
    return {
      handlePaste: (text, lines) => this.#collapse(text, lines),
      buildPasteElement: (attrs, source) => this.buildElement(attrs, source),
    };
  }

  /**
   * A paste at or over `pasteThreshold` lines is always the plain chip (`classify()` never runs);
   * below it, `classify()` decides. `pasteThreshold <= 0` leaves only `classify()`.
   * @param {string} text @param {number} lines
   */
  #collapse(text, lines) {
    if (this.pasteThreshold > 0 && lines >= this.pasteThreshold) return {};
    return this.classify(text, lines);
  }

  /**
   * Is `text` code? Called synchronously during the paste, only below `pasteThreshold`.
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
      const block = /** @type {import("../code-block/code-block.js").ChxCodeBlock} */ (
        document.createElement("chx-code-block")
      );
      block.code = text;
      block.lang = data.lang;
      block.langMenu = true;
      block.editable = true;
      block.lineNumbers = true;
      return block;
    }

    const chip = /** @type {import("../paste-chip/paste-chip.js").ChxPasteChip} */ (
      document.createElement("chx-paste-chip")
    );
    chip.lines = lines;
    return chip;
  }
}
