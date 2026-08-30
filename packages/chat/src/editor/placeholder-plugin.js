import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

/**
 * Renders `text` as a widget decoration inside the doc's sole line while
 * it's empty — the schema's `line` node has no native placeholder concept,
 * and the mount div (`chx-textbox`'s `.message-composer__input-content`,
 * see textbox.js) is a plain contenteditable `<div>`, not a native `<input>`
 * with its own `placeholder` attribute support.
 * @param {string} text
 */
export function createPlaceholderPlugin(text) {
  return new Plugin({
    props: {
      decorations(state) {
        const { doc } = state;
        if (doc.childCount !== 1 || doc.child(0).content.size !== 0) return null;

        const span = document.createElement("span");
        span.className = "textbox__placeholder";
        span.textContent = text;
        return DecorationSet.create(doc, [Decoration.widget(1, span)]);
      },
    },
  });
}
