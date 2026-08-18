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

/**
 * Not `baseKeymap` from prosemirror-commands — its Enter binding chains
 * paragraph-splitting commands that don't fit this composer's semantics
 * (submit, not split). `splitBlock` is reused as-is for Shift-Enter (splits
 * the current `line` into two — schema-agnostic, works for any single
 * uniform block type).
 * @param {{ onSubmit: () => void }} options
 * @returns {import("prosemirror-state").Plugin}
 */
export function createKeymap({ onSubmit }) {
  return keymap({
    Enter: () => {
      onSubmit();
      return true;
    },
    "Shift-Enter": splitBlock,
    Backspace: chainCommands(deleteSelection, joinBackward, selectNodeBackward),
    Delete: chainCommands(deleteSelection, joinForward, selectNodeForward),
    "Mod-a": selectAll,
  });
}
