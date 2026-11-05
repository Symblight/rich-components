import { EditorState, Selection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { ReplaceStep } from "prosemirror-transform";
import { history } from "prosemirror-history";

import { schema } from "./schema.js";
import { createKeymap } from "./keymap.js";
import { createPastePlugin } from "./paste-plugin.js";
import { createPlaceholderPlugin } from "./placeholder-plugin.js";
import { createCommandPlugin, commandPluginKey } from "./command-plugin.js";
import { ChipNodeView } from "./command-node-view.js";
import { readChipAttrs, findChipElement } from "./command-chip.js";
import { PasteNodeView } from "./paste-node-view.js";
import { landCaretAfterNode } from "./land-caret.js";
import { toPlainText, toHTML } from "./serialize.js";

const MAC_PERIOD_SUBSTITUTION = /^\. ?$/;

// Undoes macOS/Android's system "double space -> period" text replacement,
// gated on autocorrect="off" already being set — ported from CodeMirror 6's
// fix for the same browser behavior.
/**
 * @param {import("prosemirror-state").Transaction} tr
 * @param {import("prosemirror-state").EditorState} oldState
 * @param {EditorView} view
 * @returns {import("prosemirror-state").Transaction}
 */
function fixMacDoubleSpacePeriod(tr, oldState, view) {
  if (view.dom.getAttribute("autocorrect") !== "off") return tr;
  if (tr.steps.length !== 1) return tr;
  const step = tr.steps[0];
  if (!(step instanceof ReplaceStep) || step.from !== step.to) return tr;
  const inserted = step.slice.content.textBetween(0, step.slice.content.size, "\n");
  if (!MAC_PERIOD_SUBSTITUTION.test(inserted) || step.from !== oldState.selection.head - 1)
    return tr;
  return oldState.tr.insertText(inserted.replace(".", " "), step.from, step.to);
}

/** @param {string} text @returns {import("prosemirror-model").Node[]} One `line` node per line of `text`. */
const linesOf = (text) =>
  text.split("\n").map((line) => schema.nodes.line.create(null, line ? schema.text(line) : null));

/** @param {string} text @returns {unknown} A document for `setDoc()`, a `line` per line of `text`. */
export const docOfText = (text) => schema.nodes.doc.create(null, linesOf(text)).toJSON();

/** Facade over the composer's editing engine — constructed by chx-textbox (textbox.js) against its own mount div; chx-message-composer never touches ProseMirror directly. */
export class Editor {
  // real private fields must be declared here, in the class body — a bare `this.#foo = ...`
  // inside the constructor alone isn't enough
  /** @type {(detail: {value: string, html: string}) => void} */
  #onChange;
  /** @type {((detail: {target: string | null, id: string | undefined}) => void) | undefined} */
  #onCommandSelected;
  /**
   * @param {HTMLElement} mount
   * @param {{
   *   onChange: (detail: {value: string, html: string}) => void,
   *   onSubmit: () => void,
   *   onHistory?: (direction: "up" | "down") => boolean,
   *   getCommandFields?: () => Map<string, Element>,
   *   onCommandSelected?: (detail: {target: string | null, id: string | undefined}) => void,
   *   getExtensions?: () => import("./extension.js").EditorExtension[],
   *   attributes?: Record<string, string>,
   *   placeholder?: string,
   * }} options
   */
  constructor(
    mount,
    {
      onChange,
      onSubmit,
      onHistory = () => false,
      getCommandFields,
      onCommandSelected,
      getExtensions = () => [],
      attributes,
      placeholder,
    },
  ) {
    this.#onChange = onChange;
    this.#onCommandSelected = onCommandSelected;

    const state = EditorState.create({
      schema,
      plugins: [
        createCommandPlugin({ getCommandFields: getCommandFields ?? (() => new Map()) }),
        history(),
        createKeymap({ onSubmit, onHistory }),
        createPastePlugin({ getExtensions }),
        createPlaceholderPlugin(placeholder ?? ""),
      ],
    });

    this.view = new EditorView(mount, {
      state,
      attributes,
      nodeViews: {
        chip: (node) => new ChipNodeView(node),
        paste: (node, view, getPos) => new PasteNodeView(node, view, getPos, { getExtensions }),
      },
      dispatchTransaction: (tr) => {
        const oldState = this.view.state;
        const fixedTr = fixMacDoubleSpacePeriod(tr, oldState, this.view);
        this.view.updateState(oldState.apply(fixedTr));
        if (fixedTr.docChanged) this.#emitChange();
      },
    });
  }

  #emitChange() {
    this.#onChange?.({ value: this.getValue(), html: this.getHTML() });
  }

  /** @returns {string} */
  getValue() {
    return toPlainText(this.view.state.doc);
  }

  /** @returns {string} */
  getHTML() {
    return toHTML(this.view.state.doc, schema);
  }

  /** @returns {boolean} */
  isEmpty() {
    const { doc } = this.view.state; // "line+": empty is one empty line, never size 0
    return doc.childCount === 1 && doc.child(0).content.size === 0;
  }

  /** @returns {boolean} True once Shift-Enter has split the doc into more than one `line`. */
  isMultiline() {
    return this.view.state.doc.childCount > 1;
  }

  /** Resets to an empty document — a fresh `EditorState`, so undo history is discarded too. */
  clear() {
    this.view.updateState(EditorState.create({ schema, plugins: this.view.state.plugins }));
  }

  /** Replaces the whole document with plain text, a `line` per line, the caret at its end. @param {string} text */
  setText(text) {
    const state = EditorState.create({ schema, plugins: this.view.state.plugins });
    const tr = state.tr.replaceWith(0, state.doc.content.size, linesOf(text));
    this.view.updateState(state.apply(tr.setSelection(Selection.atEnd(tr.doc))));
  }

  /** The document, chips and pastes included, for `setDoc()`. @returns {unknown} */
  getDoc() {
    return this.view.state.doc.toJSON();
  }

  /**
   * Replaces the document with one from `getDoc()`; undo history starts over.
   * @param {unknown} json
   * @param {{caret?: "start" | "end"}} [options] Places the caret and scrolls to it. The picker stays
   *   closed, or a prompt ending in `@foo` would open it and take the next arrow key.
   */
  setDoc(json, { caret } = {}) {
    const doc = schema.nodeFromJSON(json);
    const { plugins } = this.view.state;
    if (!caret) {
      this.view.updateState(EditorState.create({ schema, doc, plugins }));
      return;
    }
    const selection = caret === "start" ? Selection.atStart(doc) : Selection.atEnd(doc);
    this.view.updateState(EditorState.create({ schema, doc, plugins, selection }));
    // A transaction of its own: the view scrolls only when the state's scroll counter passes the
    // previous state's, and a fresh state's would rarely pass it.
    this.view.dispatch(
      this.view.state.tr.setMeta(commandPluginKey, { forceClose: true }).scrollIntoView(),
    );
  }

  /** @param {boolean} editable Toggles the ProseMirror view's editable state (contenteditable + input handling). */
  setEditable(editable) {
    this.view.setProps({ editable: () => editable });
  }

  focus() {
    this.view.focus();
  }

  focusEnd() {
    const { doc } = this.view.state;
    this.view.dispatch(this.view.state.tr.setSelection(Selection.atEnd(doc)));
    this.view.focus();
  }

  destroy() {
    this.view.destroy();
  }

  /**
   * Resolves the active command search into a `chip` node. A stale `target` is a no-op.
   * @param {string | null} target
   * @param {Node} node
   */
  resolveCommand(target, node) {
    const pluginState = commandPluginKey.getState(this.view.state);
    if (!pluginState?.active || !target || target !== pluginState.target) return;
    if (pluginState.from === null || pluginState.to === null) return;

    const chip = findChipElement(node);
    if (!chip) return;

    const { templateId, label, icon, data } = readChipAttrs(chip);

    const commandId = data.commandId ?? crypto.randomUUID();

    const commandNode = this.view.state.schema.nodes.chip.create({
      templateId,
      label,
      icon,
      data: { ...data, commandId },
    });

    const { from, to, element } = pluginState;
    const tr = landCaretAfterNode(
      this.view.state.tr.replaceWith(from, to, commandNode),
      from,
      commandNode,
    );
    this.view.dispatch(tr);
    this.view.focus();

    this.#onCommandSelected?.({ target, id: element?.id });
  }

  /**
   * Inserts a chip node at the current selection — resolveCommand's counterpart for callers with
   * no tracked search session to validate against (e.g. attaching a file in chip mode).
   * @param {Node} node
   */
  insertChip(node) {
    const chip = findChipElement(node);
    if (!chip) return;

    const { templateId, label, icon, data } = readChipAttrs(chip);
    const chipNode = this.view.state.schema.nodes.chip.create({ templateId, label, icon, data });

    const { from, to } = this.view.state.selection;
    const tr = landCaretAfterNode(
      this.view.state.tr.replaceWith(from, to, chipNode),
      from,
      chipNode,
    );
    this.view.dispatch(tr);
    this.view.focus();
  }
}
