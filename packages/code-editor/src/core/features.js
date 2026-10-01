import { bracketMatching, codeFolding, foldGutter, foldKeymap } from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { autocompletion } from "@codemirror/autocomplete";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Material Symbols paths, 24×24. */
const CHEVRON_DOWN = "M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z";
const CHEVRON_RIGHT = "M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z";

/** @param {string} path */
function icon(path) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS(SVG_NS, "path");
  shape.setAttribute("d", path);
  svg.append(shape);
  return svg;
}

/** Clicking a number puts the caret at the start of that line. */
export function lineNumbersFeature() {
  return [
    lineNumbers({
      domEventHandlers: {
        mousedown(view, line) {
          view.dispatch({ selection: { anchor: line.from } });
          view.focus();
          return true;
        },
      },
    }),
    highlightActiveLineGutter(),
  ];
}

/** CodeMirror keeps a JS/CSS block's closing bracket outside the fold, so a folded block reads
 *  `{ ⋯ }` like JetBrains. Moving the caret into a fold unfolds it — built into foldState. */
export function foldingFeature() {
  return [
    codeFolding({
      preparePlaceholder: (state, range) =>
        state.doc.lineAt(range.to).number - state.doc.lineAt(range.from).number,
      placeholderDOM(_view, onclick, lines) {
        const chip = document.createElement("span");
        chip.className = "cm-foldPlaceholder";
        chip.textContent = "⋯";
        chip.title = `Unfold ${lines} lines`;
        chip.setAttribute("aria-label", `folded code, ${lines} lines`);
        chip.onclick = onclick;
        return chip;
      },
    }),
    foldGutter({
      markerDOM(open) {
        const marker = document.createElement("span");
        marker.className = open ? "cdx-fold-marker" : "cdx-fold-marker cdx-fold-marker_folded";
        marker.title = open ? "Fold" : "Unfold";
        marker.append(icon(open ? CHEVRON_DOWN : CHEVRON_RIGHT));
        return marker;
      },
    }),
    keymap.of(foldKeymap),
  ];
}

export function activeLineFeature() {
  return highlightActiveLine();
}

export function bracketMatchingFeature() {
  return bracketMatching();
}

export function indentGuidesFeature() {
  return indentationMarkers({
    highlightActiveBlock: true,
    markerType: "fullScope",
    thickness: 1,
    colors: {
      light: "var(--cdx-indent-guide-color)",
      dark: "var(--cdx-indent-guide-color)",
      activeLight: "var(--cdx-indent-guide-active-color)",
      activeDark: "var(--cdx-indent-guide-active-color)",
    },
  });
}

/** Sources come from the grammar's language data and from plugins (an LSP bridge, for one). */
export function autocompleteFeature() {
  return autocompletion({ icons: true, activateOnTypingDelay: 100 });
}

export function lintFeature() {
  return keymap.of(lintKeymap);
}

export function wrapFeature() {
  return EditorView.lineWrapping;
}
