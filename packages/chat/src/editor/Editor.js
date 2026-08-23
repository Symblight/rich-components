import { EditorState, Selection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { ReplaceStep } from "prosemirror-transform";

import { schema } from "./schema.js";
import { createKeymap } from "./keymap.js";
import { createPastePlugin } from "./paste-plugin.js";
import { createPlaceholderPlugin } from "./placeholder-plugin.js";
import { createCommandPlugin, commandPluginKey } from "./command-plugin.js";
import { CommandNodeView } from "./command-node-view.js";
import { toPlainText, toHTML } from "./serialize.js";

const MAC_PERIOD_SUBSTITUTION = /^\. ?$/;
const WHITESPACE = /\s/; // matches U+00A0 too, same as command-plugin.js/command-picker.js

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

/** Facade over the composer's editing engine — constructed by chx-textbox (textbox.js) against its own mount div; chx-message-composer never touches ProseMirror directly. */
export class Editor {
  /**
   * @param {HTMLElement} mount
   * @param {{
   *   onChange: (detail: {value: string, html: string}) => void,
   *   onSubmit: () => void,
   *   getCommandFields?: () => Map<Element, Element>,
   *   onCommandSelected?: (detail: {target: string | null, id: string | undefined}) => void,
   *   attributes?: Record<string, string>,
   *   placeholder?: string,
   * }} options
   */
  constructor(
    mount,
    { onChange, onSubmit, getCommandFields, onCommandSelected, attributes, placeholder },
  ) {
    this._onChange = onChange;
    this._onCommandSelected = onCommandSelected;

    const state = EditorState.create({
      schema,
      plugins: [
        createCommandPlugin({ getCommandFields: getCommandFields ?? (() => new Map()) }),
        createKeymap({ onSubmit }),
        createPastePlugin(),
        createPlaceholderPlugin(placeholder ?? ""),
      ],
    });

    this.view = new EditorView(mount, {
      state,
      attributes,
      nodeViews: {
        command: (node) => new CommandNodeView(node),
      },
      dispatchTransaction: (tr) => {
        const oldState = this.view.state;
        const fixedTr = fixMacDoubleSpacePeriod(tr, oldState, this.view);
        this.view.updateState(oldState.apply(fixedTr));
        if (fixedTr.docChanged) this._emitChange();
      },
    });
  }

  _emitChange() {
    this._onChange?.({ value: this.getValue(), html: this.getHTML() });
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
    return this.view.state.doc.content.size === 0;
  }

  /** @returns {boolean} True once Shift-Enter has split the doc into more than one `line`. */
  isMultiline() {
    return this.view.state.doc.childCount > 1;
  }

  clear() {
    this.view.updateState(EditorState.create({ schema, plugins: this.view.state.plugins }));
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
   * Resolves the active command search by replacing it with a `command`
   * node built from `node`'s `data-template-id` + text content. A stale
   * `target` is a no-op.
   * @param {string | null} target
   * @param {Node} node
   */
  resolveCommand(target, node) {
    const pluginState = commandPluginKey.getState(this.view.state);
    if (!pluginState?.active || !target || target !== pluginState.target) return;
    if (pluginState.from === null || pluginState.to === null) return;

    const parent = /** @type {ParentNode} */ (node);
    const chip =
      node instanceof Element && node.hasAttribute("data-template-id")
        ? node
        : parent.querySelector?.("[data-template-id]");
    if (!(chip instanceof HTMLElement) || !chip.dataset.templateId) return;

    // Direct text-node children only, not chip.textContent — a chip shell
    // can carry a non-text icon child whose own text would otherwise leak
    // into the label.
    const label = [...chip.childNodes]
      .filter((child) => child.nodeType === Node.TEXT_NODE)
      .map((child) => child.textContent)
      .join("")
      .trim();

    const icon = chip.querySelector('[slot="icon"]')?.innerHTML || null;

    const commandNode = this.view.state.schema.nodes.command.create({
      templateId: chip.dataset.templateId,
      label,
      icon,
    });

    const { from, to, element } = pluginState;
    let tr = this.view.state.tr.replaceWith(from, to, commandNode);

    // Land the caret one space after the chip so typing can continue right
    // away — reuse a space that's already there instead of adding a second
    // one. U+00A0, not a plain " ": a trailing space at the very end of a
    // line isn't a caret-reachable position in the browser's own rendering.
    const afterChip = from + commandNode.nodeSize;
    const $afterChip = tr.doc.resolve(afterChip);
    const nextChar = $afterChip.parent.textBetween(
      $afterChip.parentOffset,
      Math.min($afterChip.parentOffset + 1, $afterChip.parent.content.size),
    );
    if (!nextChar || !WHITESPACE.test(nextChar)) tr = tr.insertText(" ", afterChip);

    tr = tr.setSelection(TextSelection.create(tr.doc, afterChip + 1));
    this.view.dispatch(tr);
    this.view.focus();

    this._onCommandSelected?.({ target, id: element?.id });
  }
}
