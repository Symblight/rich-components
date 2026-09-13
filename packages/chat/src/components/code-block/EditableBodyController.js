import { getCaretOffset, setCaretOffset, isCaretCollapsed } from "./caret.js";
import { UndoController } from "./UndoController.js";

/** Coalesces re-highlighting while typing — a full Lezer reparse per keystroke on a large file is
 *  wasted work otherwise, since only the last one in a burst is ever shown. */
const HIGHLIGHT_DEBOUNCE_MS = 150;

/**
 * Owns chx-code-block's editable contenteditable body: composition-safe input handling, debounced
 * re-highlighting with caret preservation, undo/redo (via UndoController), and arrow-key/Backspace
 * boundary detection that hands focus back to the outer textbox. Only exercised while `editable`
 * is true — the host stays a thin rendering shell for everything else.
 */
export class EditableBodyController {
  #host;
  #getContainer;
  #getCode;
  #setCode;
  #getHighlightedHTML;
  #setHighlightedHTML;
  #highlight;

  #undo = new UndoController();
  #isComposing = false;
  /** @type {number | null} */
  #pendingCaretOffset = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #debounceTimer;

  /**
   * @param {import("lit").ReactiveControllerHost & EventTarget} host
   * @param {{
   *   getContainer: () => HTMLElement | null,
   *   getCode: () => string,
   *   setCode: (code: string) => void,
   *   getHighlightedHTML: () => string,
   *   setHighlightedHTML: (html: string) => void,
   *   highlight: () => string,
   * }} config
   */
  constructor(host, config) {
    this.#host = host;
    this.#getContainer = config.getContainer;
    this.#getCode = config.getCode;
    this.#setCode = config.setCode;
    this.#getHighlightedHTML = config.getHighlightedHTML;
    this.#setHighlightedHTML = config.setHighlightedHTML;
    this.#highlight = config.highlight;
    host.addController(this);
  }

  hostDisconnected() {
    clearTimeout(this.#debounceTimer);
  }

  /** Call from the host's willUpdate when code/lang changed while editable. */
  scheduleHighlight() {
    clearTimeout(this.#debounceTimer);
    this.#debounceTimer = setTimeout(() => {
      this.#setHighlightedHTML(this.#highlight());
    }, HIGHLIGHT_DEBOUNCE_MS);
  }

  /** Sets the contenteditable's innerHTML imperatively and restores the caret — a lit-html binding
   *  there would fight the browser's own DOM mutations from typing. Call from the host's updated()
   *  whenever highlightedHTML/editable changed. */
  syncDOM() {
    const container = this.#getContainer();
    if (!container) return;
    // Trust boundary: safe only because highlightToHTML/escapeHtml escapes every text run.
    container.innerHTML = this.#getHighlightedHTML();
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
    this.#undo.push(this.#getCode());
    this.#pendingCaretOffset = getCaretOffset(container);
    this.#setCode(container.textContent ?? "");
    this.#emit("chx-code-block-change", { code: this.#getCode() });
  }

  undo() {
    const value = this.#undo.undo(this.#getCode());
    if (value === undefined) return;
    this.#setCode(value);
    this.#pendingCaretOffset = value.length;
    this.#emit("chx-code-block-change", { code: value });
  }

  redo() {
    const value = this.#undo.redo(this.#getCode());
    if (value === undefined) return;
    this.#setCode(value);
    this.#pendingCaretOffset = value.length;
    this.#emit("chx-code-block-change", { code: value });
  }

  /** Inserts `text` as a plain text node at the caret, replacing any active selection. No-ops if
   *  the live selection isn't actually inside `container` — a stale/foreign selection would
   *  otherwise land the text wherever that selection happens to be.
   * @param {string} text @param {HTMLElement} container */
  #insertPlainText(text, container) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!container.contains(range.startContainer)) return;
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
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

  handleCompositionStart = () => {
    this.#isComposing = true;
  };

  /** @param {CompositionEvent} event */
  handleCompositionEnd = (event) => {
    this.#isComposing = false;
    this.#applyEdit(/** @type {HTMLElement} */ (event.currentTarget));
  };

  /** Enter inserts a literal "\n"; arrow keys and Backspace at a boundary hand focus back to the
   *  outer textbox instead of doing nothing (see PasteNodeView's #handleBoundary); Mod-Z/Mod-Y run
   *  this component's own undo/redo — stopEvent keeps them from ever reaching the outer editor.
   * @param {KeyboardEvent} event */
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
    const code = this.#getCode();
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
