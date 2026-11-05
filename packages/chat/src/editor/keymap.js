import { keymap } from "prosemirror-keymap";
import {
  chainCommands,
  deleteSelection,
  joinBackward,
  joinForward,
  selectAll,
  selectNodeBackward,
  selectNodeForward,
  splitBlock,
} from "prosemirror-commands";
import { redo, undo } from "prosemirror-history";

import { findEditableDescendant, focusEditableEdge } from "./find-editable.js";

/**
 * Arrow key toward a node whose rendered DOM contains a focusable contenteditable region (e.g.
 * chx-code-block's own editable body) hands it focus directly, landing at the edge nearest the
 * direction of travel — generic by DOM shape, not by node type, so this works for any current or
 * future interactive atom the same way, with no import of anything code-block-specific here.
 *
 * `endOfTextblock` only gates Up/Down: our atom is inline, a sibling within the same `line`, not a
 * separate textblock the way the ProseMirror reference's block-level `code_block` is — Left/Right
 * adjacency to it has nothing to do with textblock edges. Up/Down still needs the check, since a
 * wrapped `line` can have more visual rows above/below before truly reaching this node.
 * @param {"left" | "right" | "up" | "down"} dir
 * @param {-1 | 1} side
 * @returns {import("prosemirror-state").Command}
 */
function arrowHandler(dir, side) {
  return (state, _dispatch, view) => {
    if (!view || !state.selection.empty) return false;
    if ((dir === "up" || dir === "down") && !view.endOfTextblock(dir)) return false;
    const $head = state.selection.$head;
    const node = side < 0 ? $head.nodeBefore : $head.nodeAfter;
    if (!node) return false;
    const nodePos = side < 0 ? $head.pos - node.nodeSize : $head.pos;
    const dom = view.nodeDOM(nodePos);
    const editable = dom instanceof HTMLElement ? findEditableDescendant(dom) : null;
    if (!editable) return false;
    focusEditableEdge(editable, side < 0 ? "end" : "start");
    return true;
  };
}

/**
 * Up on the document's first visual row, Down on its last, is the prompt history's. `endOfTextblock`
 * knows a wrapped line's rows.
 * @param {"up" | "down"} direction
 * @param {(direction: "up" | "down") => boolean} onHistory `false` leaves the key to the browser.
 * @returns {import("prosemirror-state").Command}
 */
function historyHandler(direction, onHistory) {
  return (state, _dispatch, view) => {
    if (!view || !state.selection.empty) return false;
    const edge = direction === "up" ? 0 : state.doc.childCount - 1;
    if (state.selection.$head.index(0) !== edge || !view.endOfTextblock(direction)) return false;
    return onHistory(direction);
  };
}

/**
 * Not `baseKeymap` from prosemirror-commands — its Enter binding chains
 * paragraph-splitting commands that don't fit this composer's semantics
 * (submit, not split). `splitBlock` is reused as-is for Shift-Enter (splits
 * the current `line` into two — schema-agnostic, works for any single
 * uniform block type).
 * @param {{ onSubmit: () => void, onHistory: (direction: "up" | "down") => boolean }} options
 * @returns {import("prosemirror-state").Plugin}
 */
export function createKeymap({ onSubmit, onHistory }) {
  return keymap({
    Enter: () => {
      onSubmit();
      return true;
    },
    "Shift-Enter": splitBlock,
    Backspace: chainCommands(deleteSelection, joinBackward, selectNodeBackward),
    Delete: chainCommands(deleteSelection, joinForward, selectNodeForward),
    "Mod-a": selectAll,
    "Mod-z": undo,
    "Shift-Mod-z": redo,
    "Mod-y": redo,
    ArrowLeft: arrowHandler("left", -1),
    ArrowRight: arrowHandler("right", 1),
    ArrowUp: chainCommands(arrowHandler("up", -1), historyHandler("up", onHistory)),
    ArrowDown: chainCommands(arrowHandler("down", 1), historyHandler("down", onHistory)),
  });
}
