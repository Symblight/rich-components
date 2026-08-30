import { Plugin } from "prosemirror-state";

/**
 * Forces paste to always be plain text, matching the old
 * handleComposerPaste's policy — `handlePaste` runs before ProseMirror's
 * own HTML/text clipboard parsing and fully replaces it when it returns
 * `true`. Splits the clipboard text on "\n" and inserts each line in turn,
 * splitting the current `line` block between them — so paste merges with
 * whatever text already surrounds the cursor instead of overwriting it.
 * @returns {import("prosemirror-state").Plugin}
 */
export function createPastePlugin() {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const text = event.clipboardData?.getData("text/plain");
        if (!text) return false;

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
