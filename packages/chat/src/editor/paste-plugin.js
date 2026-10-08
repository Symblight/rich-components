import { Plugin } from "prosemirror-state";

import { landCaretAfterNode } from "./land-caret.js";
import { byPastePriority } from "./extension.js";

/**
 * A trailing "\n" is a line terminator, not an extra line — "a\nb\n" is 2
 * lines. The same count feeds the threshold check and the chip's label.
 * @param {string} text
 * @returns {number}
 */
export function countLines(text) {
  const lines = text.split("\n");
  return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}

/**
 * Builds a `paste` node at the current selection and lands the caret one space after it.
 * @param {import("prosemirror-view").EditorView} view
 * @param {{text: string, lines: number, data: Record<string, unknown>}} attrs
 * @returns {true}
 */
function insertPasteChip(view, attrs) {
  const chip = view.state.schema.nodes.paste.create(attrs);
  const from = view.state.selection.from;
  const tr = landCaretAfterNode(view.state.tr.replaceSelectionWith(chip, false), from, chip);

  view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Forces plain-text paste: lines are inserted one by one, splitting the current `line` block, so a
 * paste merges with the surrounding text. The first editor extension (by `priority`) whose
 * `handlePaste` returns data collapses the paste into a `paste` node instead; with none, it's inline.
 * @param {{getExtensions?: () => import("./extension.js").EditorExtension[]}} [options]
 * @returns {import("prosemirror-state").Plugin}
 */
export function createPastePlugin({ getExtensions = () => [] } = {}) {
  return new Plugin({
    props: {
      /**
       * @param {import("prosemirror-view").EditorView} view
       * @param {ClipboardEvent} event
       */
      handlePaste(view, event) {
        const text = event.clipboardData?.getData("text/plain");
        if (!text) return false;

        const lineCount = countLines(text);
        for (const extension of byPastePriority(getExtensions)) {
          const data = extension.handlePaste?.(text, lineCount);
          if (data != null) return insertPasteChip(view, { text, lines: lineCount, data });
        }

        const lines = text.split("\n");
        let tr = view.state.tr.deleteSelection();
        lines.forEach((line, index) => {
          if (line) tr = tr.insertText(line);
          if (index < lines.length - 1) tr = tr.split(tr.selection.from);
        });
        view.dispatch(tr.scrollIntoView());
        return true;
      },
    },
  });
}
