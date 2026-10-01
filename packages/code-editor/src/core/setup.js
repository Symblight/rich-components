import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { indentOnInput } from "@codemirror/language";
import { drawSelection, EditorView, keymap } from "@codemirror/view";

import { lintFeature } from "./features.js";
import { cdxHighlighting, cdxTheme } from "./theme.js";

const CURSOR_BLINK_RATE_MS = 1060;

/** Always on, whatever the properties say. */
export function baseSetup() {
  return [
    history(),
    drawSelection({ cursorBlinkRate: CURSOR_BLINK_RATE_MS }),
    indentOnInput(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    lintFeature(),
    cdxTheme,
    cdxHighlighting,
    EditorView.contentAttributes.of({ part: "content" }),
  ];
}
