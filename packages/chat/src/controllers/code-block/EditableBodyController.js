import {
  getCaretOffset,
  getSelectionFor,
  setCaretOffset,
  isCaretCollapsed,
} from "../../components/code-block/caret.js";
import { UndoStack } from "../../components/code-block/undo-stack.js";

/** A trailing `\n` renders no empty line in a contenteditable; a last `<br>` gives the caret one
 *  (`textContent` and caret offsets both skip it). @param {HTMLElement} container */
function ensureTrailingBreak(container) {
  if (container.lastChild instanceof HTMLBRElement) return;
  container.appendChild(document.createElement("br"));
}

/** Coalesces re-highlighting while typing — only the last reparse in a burst is ever shown. */
const HIGHLIGHT_DEBOUNCE_MS = 150;

/**
 * @typedef {import("lit").ReactiveControllerHost & EventTarget} Host
 * @typedef {{
 *   getContainer: () => HTMLElement | null,
 *   getCode: () => string,
 *   setCode: (code: string) => void,
 *   getHighlightedHTML: () => string,
 *   setHighlightedHTML: (html: string) => void,
 *   highlight: () => string,
 * }} EditableBodyConfig
 */

/**
 * chx-code-block's editable body: composition-safe input, debounced re-highlighting with caret
 * preservation, undo/redo, and boundary keys that hand focus back to the outer textbox.
 */
export class EditableBodyController {
  /** @type {Host} */
  #host;
  /** @type {EditableBodyConfig} */
  #config;
  #undo = new UndoStack();
  #isComposing = false;
  /** @type {number | null} */
  #pendingCaretOffset = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #debounceTimer;

  /** @param {Host} host @param {EditableBodyConfig} config */
  constructor(host, config) {
    this.#host = host;
    this.#config = config;
    host.addController(this);
  }

  /** A pending re-highlight must not fire against a gone host. */
  hostDisconnected() {
    clearTimeout(this.#debounceTimer);
  }

  /** Call from the host's willUpdate when code/lang changed while editable. */
  scheduleHighlight() {
    clearTimeout(this.#debounceTimer);
    this.#debounceTimer = setTimeout(() => {
      this.#config.setHighlightedHTML(this.#config.highlight());
    }, HIGHLIGHT_DEBOUNCE_MS);
  }

  /** Imperative innerHTML + caret restore — a binding would fight the browser's typing mutations.
   *  Call from `updated()` when highlightedHTML/editable changed. */
  syncDOM() {
    const container = this.#config.getContainer();
    if (!container) return;
    // Trust boundary: safe only because highlightToHTML/escapeHtml escapes every text run.
    container.innerHTML = this.#config.getHighlightedHTML();
    ensureTrailingBreak(container);
    if (this.#pendingCaretOffset === null) return;
    setCaretOffset(container, this.#pendingCaretOffset);
    this.#pendingCaretOffset = null;
  }

  /** @param {string} type @param {unknown} detail */
  #emit(type, detail) {
    this.#host.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  /** Re-derives code from the contenteditable's plain-text content.
   * @param {HTMLElement} container */
  #applyEdit(container) {
    this.#undo.push(this.#config.getCode());
    this.#pendingCaretOffset = getCaretOffset(container);
    this.#config.setCode(container.textContent ?? "");
    this.#emit("chx-code-block-change", { code: this.#config.getCode() });
  }

  undo() {
    this.#restore(this.#undo.undo(this.#config.getCode()));
  }

  redo() {
    this.#restore(this.#undo.redo(this.#config.getCode()));
  }

  /** Applies an undo/redo step, caret at the end. @param {string | undefined} value */
  #restore(value) {
    if (value === undefined) return;
    this.#config.setCode(value);
    this.#pendingCaretOffset = value.length;
    this.#emit("chx-code-block-change", { code: value });
  }

  /** Replaces the selection with plain `text` — only if the selection is inside `container`.
   *  @param {string} text @param {HTMLElement} container */
  #insertPlainText(text, container) {
    const selection = getSelectionFor(container);
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!container.contains(range.startContainer)) return;
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    ensureTrailingBreak(container);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    this.#applyEdit(container);
  }

  /** Skipped mid-IME-composition — rewriting innerHTML then would break the composition UI.
   * @param {InputEvent} event */
  handleInput = (event) => {
    if (this.#isComposing) return;
    this.#applyEdit(/** @type {HTMLElement} */ (event.currentTarget));
  };

  /** `handleInput` defers to `handleCompositionEnd` while composing. */
  handleCompositionStart = () => {
    this.#isComposing = true;
  };

  /** @param {CompositionEvent} event */
  handleCompositionEnd = (event) => {
    this.#isComposing = false;
    this.#applyEdit(/** @type {HTMLElement} */ (event.currentTarget));
  };

  /** Enter inserts "\n"; arrows/Backspace at a boundary hand focus back to the outer textbox;
   *  Mod-Z/Mod-Y are this block's own undo/redo. @param {KeyboardEvent} event */
  handleKeydown = (event) => {
    const container = /** @type {HTMLElement} */ (event.currentTarget);
    const mod = event.metaKey || event.ctrlKey;

    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      this.redo();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      this.#insertPlainText("\n", container);
      return;
    }

    const direction = this.#boundaryDirection(event, container);
    if (!direction) return;
    event.preventDefault();
    this.#emit("chx-code-block-boundary", { direction });
  };

  /** @param {KeyboardEvent} event @param {HTMLElement} container @returns {"start" | "end" | null} */
  #boundaryDirection(event, container) {
    if (event.shiftKey || !isCaretCollapsed(container)) return null;
    const code = this.#config.getCode();
    const offset = getCaretOffset(container);
    switch (event.key) {
      case "ArrowLeft":
        return offset === 0 ? "start" : null;
      case "ArrowRight":
        return offset === code.length ? "end" : null;
      case "ArrowUp":
        return code.slice(0, offset).includes("\n") ? null : "start";
      case "ArrowDown":
        return code.slice(offset).includes("\n") ? null : "end";
      case "Backspace":
        return offset === 0 ? "start" : null;
      default:
        return null;
    }
  }

  /** Forces plain-text paste, same posture as textbox.js's own paste-plugin.js.
   * @param {ClipboardEvent} event */
  handlePaste = (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    this.#insertPlainText(text, /** @type {HTMLElement} */ (event.currentTarget));
  };
}
