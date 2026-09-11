import { TextSelection } from "prosemirror-state";

const WHITESPACE = /\s/; // matches U+00A0 too, not just a plain " "

/**
 * Lands the caret one space after a just-inserted atomic node, reusing existing whitespace
 * instead of adding a second one. Shared by Editor.js and paste-plugin.js.
 * @param {import("prosemirror-state").Transaction} tr
 * @param {number} from
 * @param {import("prosemirror-model").Node} node
 * @returns {import("prosemirror-state").Transaction}
 */
export function landCaretAfterNode(tr, from, node) {
  const afterNode = from + node.nodeSize;
  const $afterNode = tr.doc.resolve(afterNode);
  const nextChar = $afterNode.parent.textBetween(
    $afterNode.parentOffset,
    Math.min($afterNode.parentOffset + 1, $afterNode.parent.content.size),
  );
  if (!nextChar || !WHITESPACE.test(nextChar)) tr = tr.insertText(" ", afterNode);
  return tr.setSelection(TextSelection.create(tr.doc, afterNode + 1));
}
