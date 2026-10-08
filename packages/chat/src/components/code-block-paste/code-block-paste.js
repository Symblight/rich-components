import { LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import "../code-block/code-block.js";
import { detectLanguage } from "./detect-language.js";
import {
  EDITOR_EXTENSION,
  PASTE_BOUNDARY_EVENT,
  PASTE_CHANGE_EVENT,
} from "../../editor/extension.js";

import styles from "./code-block-paste.css?inline";

/** `data.kind` of the `paste` nodes this extension owns. */
const KIND = "code";

/** Also claims pastes from before `data.kind` (a restored draft, sent HTML): those carry only `lang`.
 * @param {Record<string, unknown> | undefined} data */
const owns = (data) =>
  data?.kind === KIND || (data?.kind === undefined && typeof data?.lang === "string");

/**
 * Splits a sent message's code paste back into a `type: "code"` part `{text, lang}` — pass to
 * `splitMessageParts`/`createSplitOnSendHandler`.
 * @type {import("../../types/inline-part-rule.js").InlinePartRule}
 */
export const codeBlockPastePartRule = {
  type: "code",
  selector: `span[data-paste-lines][data-kind="${KIND}"], span[data-paste-lines]:not([data-kind])[data-lang]`,
  toPart: (element) => ({ text: element.textContent ?? "", lang: element.dataset.lang ?? "" }),
};

/**
 * @tag chx-code-block-paste
 * @summary Editor extension: collapses a paste that looks like code into an editable `chx-code-block`.
 */
@customElement("chx-code-block-paste")
export class ChxCodeBlockPaste extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    minLines: { type: Number, attribute: "min-lines" },
    maxLines: { type: Number, attribute: "max-lines" },
    languages: { attribute: false },
    maxErrorRatio: { type: Number, attribute: "max-error-ratio" },
  };

  constructor() {
    super();

    /** @type {number} Below this line count, a paste is never checked for code. */
    this.minLines = 2;

    /** @type {number} From this line count on, a paste is never checked — detection parses the whole
     *  text once per candidate language on the main thread. <= 0 disables the cap. */
    this.maxLines = 2000;

    /** @type {string[] | undefined} Candidate language ids — defaults to detect-language.js's own list. */
    this.languages = undefined;

    /** @type {number | undefined} Highest tolerated parse-error ratio — see detect-language.js. */
    this.maxErrorRatio = undefined;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  /** Editor hooks — picked up by the parent chx-message-composer. Asked before other paste
   *  extensions, so code up to `maxLines` becomes a code block whatever the long-text threshold. @returns {import("../../editor/extension.js").EditorExtension} */
  get [EDITOR_EXTENSION]() {
    return {
      priority: 1,
      handlePaste: (text, lines) => {
        const data = this.classify(text, lines);
        return data ? { ...data, kind: KIND } : null;
      },
      buildPasteElement: (attrs, source) =>
        owns(attrs.data) ? this.#bind(this.buildElement(attrs, source)) : null,
      updatePasteElement: (element, attrs) => this.updateElement(element, attrs),
    };
  }

  /**
   * Is `text` code? Called synchronously during the paste. Override to change what counts as code.
   * @param {string} text
   * @param {number} lines
   * @returns {{lang: string} | null}
   */
  classify(text, lines) {
    if (lines < this.minLines || (this.maxLines > 0 && lines >= this.maxLines)) return null;
    const detected = detectLanguage(text, {
      languages: this.languages,
      maxErrorRatio: this.maxErrorRatio,
    });
    return detected ? { lang: detected.lang } : null;
  }

  /**
   * Draws the collapsed paste — both for a fresh paste and a reconstruction (undo/redo, a restored
   * draft). Override to customize; `data.lang` is what `classify()` returned.
   * @param {import("../../editor/extension.js").PasteAttrs} attrs
   * @param {"composer"} _source
   * @returns {HTMLElement}
   */
  buildElement({ text, data }, _source) {
    const block = /** @type {import("../code-block/code-block.js").ChxCodeBlock} */ (
      document.createElement("chx-code-block")
    );
    block.code = text;
    block.lang = typeof data.lang === "string" ? data.lang : "";
    block.langMenu = true;
    block.editable = true;
    block.lineNumbers = true;
    return block;
  }

  /**
   * Pushes attrs changed outside the element (undo/redo) into what `buildElement` returned. Only
   * writes what differs, so echoing the element's own edit back is a no-op.
   * @param {HTMLElement} element
   * @param {import("../../editor/extension.js").PasteAttrs} attrs
   */
  updateElement(element, { text, data }) {
    const block = /** @type {HTMLElement & {code?: string, lang?: string}} */ (element);
    if (typeof block.code === "string" && block.code !== text) block.code = text;
    if (typeof block.lang === "string" && typeof data.lang === "string" && block.lang !== data.lang)
      block.lang = data.lang;
  }

  /** Translates chx-code-block's own events (bubbling up from anywhere inside `element`) into the
   *  editor's generic paste events. Listeners live and die with `element`.
   * @param {HTMLElement} element */
  #bind(element) {
    /** @param {string} type @param {unknown} detail */
    const emit = (type, detail) => element.dispatchEvent(new CustomEvent(type, { detail }));
    element.addEventListener("chx-code-block-change", (event) =>
      emit(PASTE_CHANGE_EVENT, { text: /** @type {CustomEvent} */ (event).detail.code }),
    );
    element.addEventListener("chx-code-block-lang-change", (event) =>
      emit(PASTE_CHANGE_EVENT, { data: { lang: /** @type {CustomEvent} */ (event).detail.lang } }),
    );
    element.addEventListener("chx-code-block-boundary", (event) =>
      emit(PASTE_BOUNDARY_EVENT, {
        direction: /** @type {CustomEvent} */ (event).detail.direction,
      }),
    );
    return element;
  }
}
