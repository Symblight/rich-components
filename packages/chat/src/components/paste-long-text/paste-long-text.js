import { LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import "../paste-chip/paste-chip.js";
import { EDITOR_EXTENSION } from "../../editor/extension.js";

import styles from "./paste-long-text.css?inline";

/** `data.kind` of the `paste` nodes this extension owns. */
const KIND = "long-text";

/** Also claims pastes from before `data.kind` (a restored draft, sent HTML) that aren't code.
 * @param {Record<string, unknown> | undefined} data */
const owns = (data) =>
  data?.kind === KIND || (data?.kind === undefined && typeof data?.lang !== "string");

/**
 * Splits a sent message's `<span data-paste-lines>` long-text chip back into a `type: "longText"`
 * part `{text, lines}` — pass to `splitMessageParts`/`createSplitOnSendHandler`.
 * @type {import("../../types/inline-part-rule.js").InlinePartRule}
 */
export const longTextPastePartRule = {
  type: "longText",
  selector: `span[data-paste-lines][data-kind="${KIND}"], span[data-paste-lines]:not([data-kind]):not([data-lang])`,
  toPart: (element) => ({
    text: element.textContent ?? "",
    lines: Number(element.dataset.pasteLines) || 0,
  }),
};

/**
 * @tag chx-paste-long-text
 * @summary Editor extension: collapses a paste of `paste-threshold`+ lines into an "N lines" chip.
 */
@customElement("chx-paste-long-text")
export class ChxPasteLongText extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    pasteThreshold: { type: Number, attribute: "paste-threshold" },
  };

  constructor() {
    super();

    /** @type {number} Pastes of at least this many lines collapse to a chip; <= 0 disables. */
    this.pasteThreshold = 205;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  /** Editor hooks — picked up by the parent chx-message-composer. @returns {import("../../editor/extension.js").EditorExtension} */
  get [EDITOR_EXTENSION]() {
    return {
      handlePaste: (_text, lines) =>
        this.pasteThreshold > 0 && lines >= this.pasteThreshold ? { kind: KIND } : null,
      buildPasteElement: (attrs, source) =>
        owns(attrs.data) ? this.buildElement(attrs, source) : null,
    };
  }

  /**
   * Draws the collapsed paste — both for a fresh paste and a reconstruction (undo/redo, a restored
   * draft). Override to customize the look.
   * @param {import("../../editor/extension.js").PasteAttrs} attrs
   * @param {"composer"} _source
   * @returns {HTMLElement}
   */
  buildElement({ lines }, _source) {
    const chip = /** @type {import("../paste-chip/paste-chip.js").ChxPasteChip} */ (
      document.createElement("chx-paste-chip")
    );
    chip.lines = lines;
    return chip;
  }
}
