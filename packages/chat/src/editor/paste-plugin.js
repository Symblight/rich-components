import { Plugin } from "prosemirror-state";

import { landCaretAfterNode } from "./land-caret.js";

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
 * Forces paste to always be plain text, matching the old
 * handleComposerPaste's policy — `handlePaste` runs before ProseMirror's
 * own HTML/text clipboard parsing and fully replaces it when it returns
 * `true`. Splits the clipboard text on "\n" and inserts each line in turn,
 * splitting the current `line` block between them — so paste merges with
 * whatever text already surrounds the cursor instead of overwriting it.
 *
 * Precedence, driven entirely by chx-paste-long-text (see Editor.js's
 * `configurePasteLongText`) — this plugin itself has no opinion:
 *  1. A paste of at least `getPasteThreshold()` lines always collapses to
 *     the plain "N lines" chip — `classify()` never runs in this branch,
 *     however it would have classified the content. `threshold <= 0`
 *     disables collapsing entirely (the default when no chx-paste-long-text
 *     is registered).
 *  2. Otherwise, `getClassify()` (e.g. chx-paste-long-text's code detector)
 *     is checked once; a non-null result collapses to a classified chip.
 *  3. Otherwise, the existing inline plain-text insertion — unchanged.
 * @param {{
 *   getPasteThreshold?: () => number,
 *   getClassify?: () => ((text: string, lines: number) => Record<string, unknown> | null) | undefined,
 * }} [options]
 * @returns {import("prosemirror-state").Plugin}
 */
export function createPastePlugin({ getPasteThreshold, getClassify } = {}) {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const text = event.clipboardData?.getData("text/plain");
        if (!text) return false;

        const threshold = getPasteThreshold?.() ?? 0;
        const lineCount = countLines(text);
        if (threshold > 0 && lineCount >= threshold) {
          return insertPasteChip(view, { text, lines: lineCount, data: {} });
        }

        const data = getClassify?.()?.(text, lineCount);
        if (data != null) {
          return insertPasteChip(view, { text, lines: lineCount, data });
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
