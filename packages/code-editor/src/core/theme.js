import { syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { classHighlighter, tagHighlighter, tags } from "@lezer/highlight";

/** @param {string} color */
const wavy = (color) => ({
  backgroundImage: "none",
  textDecoration: `underline wavy ${color}`,
  textDecorationThickness: "1px",
  textUnderlineOffset: "3px",
  textDecorationSkipInk: "none",
});

/** Tie-breaks with the base theme's `&light`/`&dark` rules by order — theme modules mount after it. */
export const cdxTheme = EditorView.theme({
  "&": {
    flex: "1 1 auto",
    minBlockSize: "0",
    color: "var(--cdx-content-color)",
    backgroundColor: "var(--cdx-content-background-color)",
    fontSize: "var(--cdx-content-font-size)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    fontFamily: "var(--cdx-content-font-family)",
    lineHeight: "var(--cdx-content-line-height)",
  },
  ".cm-content": {
    padding: "var(--cdx-content-padding)",
    caretColor: "var(--cdx-caret-color)",
  },
  ".cm-line": {
    paddingInline: "var(--cdx-line-padding-inline)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeft: "2px solid var(--cdx-caret-color)",
    marginLeft: "-1px",
  },
  ".cm-selectionBackground": {
    background: "var(--cdx-selection-inactive-background-color)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    background: "var(--cdx-selection-background-color)",
  },
  ".cm-placeholder": {
    color: "var(--cdx-placeholder-color)",
  },
  // CodeMirror restarts the blink by swapping an inline animation-name, so `animation: none` loses;
  // pausing holds the caret on the visible first keyframe
  "@media (prefers-reduced-motion: reduce)": {
    "&.cm-focused > .cm-scroller > .cm-cursorLayer": {
      animationPlayState: "paused",
    },
  },

  // Gutter: same surface as the text and no divider — only the numbers' rhythm separates them.
  ".cm-gutters": {
    backgroundColor: "var(--cdx-content-background-color)",
    color: "var(--cdx-line-number-color)",
    border: "none",
    userSelect: "none",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    boxSizing: "content-box",
    minWidth: "2ch",
    padding: "0 0.5rem 0 0.375rem",
    cursor: "pointer",
  },

  // Active line: tinted with primary while focused, a neutral trace of where the caret was otherwise.
  // Drawn as an image layer, not a background-color, so a diff row keeps its fill underneath.
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "transparent",
    backgroundImage:
      "linear-gradient(var(--cdx-active-line-inactive-background-color), var(--cdx-active-line-inactive-background-color))",
  },
  "&.cm-focused .cm-activeLine, &.cm-focused .cm-activeLineGutter": {
    backgroundImage:
      "linear-gradient(var(--cdx-active-line-background-color), var(--cdx-active-line-background-color))",
  },
  ".cm-activeLineGutter": {
    color: "var(--cdx-line-number-active-color)",
  },
  "&.cm-focused .cm-activeLineGutter": {
    fontWeight: "var(--_cdx-font-weight-medium)",
  },

  // Fold chevrons stay hidden until the gutter is hovered, except on a folded block.
  ".cm-foldGutter .cm-gutterElement": {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.25rem",
  },
  ".cdx-fold-marker": {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    inlineSize: "1.125rem",
    blockSize: "1.125rem",
    borderRadius: "var(--_cdx-shape-corner-extra-small)",
    color: "var(--cdx-fold-marker-color)",
    cursor: "pointer",
    opacity: "0",
    transition: "opacity 0.12s",
    "& svg": {
      inlineSize: "100%",
      blockSize: "100%",
      fill: "currentColor",
    },
    "&:hover": {
      backgroundColor: "var(--cdx-fold-marker-hover-background-color)",
    },
  },
  ".cm-gutters:hover .cdx-fold-marker, .cdx-fold-marker_folded": {
    opacity: "1",
  },
  ".cm-foldPlaceholder": {
    display: "inline-flex",
    alignItems: "center",
    blockSize: "calc(1lh - 4px)",
    margin: "0 3px",
    padding: "0 6px",
    verticalAlign: "1px",
    backgroundColor: "var(--cdx-fold-placeholder-background-color)",
    border: "none",
    borderRadius: "var(--_cdx-shape-corner-extra-small)",
    color: "var(--cdx-fold-placeholder-color)",
    fontFamily: "var(--_cdx-font-family)",
    fontSize: "0.85em",
    fontWeight: "var(--_cdx-font-weight-medium)",
    lineHeight: "1",
    cursor: "pointer",
    "&:hover": {
      backgroundColor: "var(--cdx-fold-placeholder-hover-background-color)",
      color: "var(--cdx-content-color)",
    },
  },

  "&.cm-focused .cm-matchingBracket": {
    backgroundColor: "var(--cdx-bracket-match-background-color)",
    boxShadow: "inset 0 0 0 1px var(--cdx-bracket-match-border-color)",
    borderRadius: "2px",
  },
  "&.cm-focused .cm-nonmatchingBracket": {
    backgroundColor: "var(--cdx-bracket-mismatch-background-color)",
    borderRadius: "2px",
  },

  // Diagnostics: wavy underlines instead of lint's fixed-color SVG ones, so they follow the tokens.
  ".cm-lintRange-error": wavy("var(--cdx-diagnostic-error-color)"),
  ".cm-lintRange-warning": wavy("var(--cdx-diagnostic-warning-color)"),
  ".cm-lintRange-info": wavy("var(--cdx-diagnostic-info-color)"),
  ".cm-lintRange-hint": wavy("var(--cdx-diagnostic-hint-color)"),
  ".cm-lintRange-active": {
    backgroundColor: "var(--cdx-bracket-match-background-color)",
  },
  ".cm-diagnostic": {
    padding: "0.25rem 0.5rem 0.25rem 0.625rem",
  },
  ".cm-diagnostic-error": { borderLeft: "3px solid var(--cdx-diagnostic-error-color)" },
  ".cm-diagnostic-warning": { borderLeft: "3px solid var(--cdx-diagnostic-warning-color)" },
  ".cm-diagnostic-info": { borderLeft: "3px solid var(--cdx-diagnostic-info-color)" },
  ".cm-diagnostic-hint": { borderLeft: "3px solid var(--cdx-diagnostic-hint-color)" },

  ".cm-tooltip": {
    backgroundColor: "var(--cdx-tooltip-background-color)",
    color: "var(--cdx-tooltip-color)",
    border: "none",
    borderRadius: "var(--_cdx-shape-corner-extra-small)",
    boxShadow: "var(--cdx-tooltip-shadow)",
    fontFamily: "var(--_cdx-font-family)",
    fontSize: "var(--_cdx-body-medium-font-size)",
    lineHeight: "var(--_cdx-body-medium-line-height)",
    overflow: "hidden",
  },
  ".cm-tooltip-lint": {
    padding: "0",
  },

  ".cm-panels": {
    backgroundColor: "var(--cdx-panel-background-color)",
    color: "var(--cdx-content-color)",
    fontFamily: "var(--_cdx-font-family)",
    fontSize: "var(--_cdx-body-medium-font-size)",
  },
  ".cm-panels-bottom": {
    borderTop: "1px solid var(--cdx-content-border-color)",
  },
  ".cm-panel.cm-panel-lint ul [aria-selected]": {
    backgroundColor: "var(--cdx-panel-selected-background-color)",
  },
  ".cm-panel.cm-panel-lint ul:focus [aria-selected]": {
    backgroundColor: "var(--cdx-panel-selected-background-color)",
    color: "inherit",
  },

  // Change markers: a 3px bar for added/modified lines, a triangle on the seam for removed ones.
  ".cdx-vcs-gutter": {
    minWidth: "10px",
  },
  ".cdx-vcs-gutter .cm-gutterElement": {
    position: "relative",
  },
  ".cdx-vcs-marker::after": {
    content: '""',
    position: "absolute",
    insetBlock: "0",
    insetInlineStart: "3px",
    inlineSize: "3px",
    borderRadius: "0 2px 2px 0",
  },
  ".cdx-vcs-marker_added::after": { backgroundColor: "var(--cdx-vcs-added-color)" },
  ".cdx-vcs-marker_modified::after": { backgroundColor: "var(--cdx-vcs-modified-color)" },
  ".cdx-vcs-marker_deleted::after, .cdx-vcs-marker_deleted-end::after": {
    insetBlock: "auto",
    inlineSize: "0",
    blockSize: "0",
    border: "4px solid transparent",
    borderInlineStart: "5px solid var(--cdx-vcs-deleted-color)",
    borderRadius: "0",
    zIndex: "1",
  },
  ".cdx-vcs-marker_deleted::after": { top: "-4px" },
  ".cdx-vcs-marker_deleted-end::after": { bottom: "-4px" },
  ".cdx-vcs-marker_deleted-row::after": { backgroundColor: "var(--cdx-vcs-deleted-color)" },
  // a HEAD mark opens its chunk; hovering widens the bar to say so
  ".cdx-vcs-marker_peekable": { cursor: "pointer" },
  ".cdx-vcs-marker_peekable:hover::after": { inlineSize: "5px" },

  // Diff rows, both layers: added lines are real text on a green wash; removed lines are a block
  // of "ghost" rows (not part of the file — no caret, no selection), muted to 80%.
  "&.cm-merge-b .cm-changedLine, .cm-inlineChangedLine, .cdx-line-added": {
    position: "relative",
    backgroundColor: "var(--cdx-diff-added-background-color)",
  },
  ".cm-deletedChunk": {
    position: "relative",
    paddingInline: "var(--cdx-line-padding-inline)",
    backgroundColor: "var(--cdx-diff-removed-background-color)",
  },
  ".cm-deletedLine": {
    position: "relative",
    opacity: "var(--cdx-diff-removed-opacity)",
  },
  // the sign sits in the text inset, so ghost and real rows keep their text aligned
  "&.cm-merge-b .cm-changedLine::before, .cdx-line-added::before, .cm-deletedLine::before": {
    position: "absolute",
    insetInlineStart: "2px",
    font: "500 0.75rem/inherit var(--cdx-content-font-family)",
    userSelect: "none",
    pointerEvents: "none",
  },
  "&.cm-merge-b .cm-changedLine::before, .cdx-line-added::before": {
    content: '"+"',
    color: "var(--cdx-diff-added-sign-color)",
  },
  ".cm-deletedLine::before": {
    content: '"−"',
    insetInlineStart: "calc(2px - var(--cdx-line-padding-inline))",
    color: "var(--cdx-diff-removed-sign-color)",
  },
  ".cm-insertedLine, .cm-deletedLine, .cm-deletedLine del": {
    textDecoration: "none",
  },

  // Autocomplete: an MD3 menu — surface-container, 4dp corners, elevation 2, compact rows.
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--cdx-content-font-family)",
    fontSize: "var(--cdx-content-font-size)",
    maxHeight: "calc(10 * 1.75rem)",
    minWidth: "15rem",
    padding: "0.25rem 0",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    display: "flex",
    alignItems: "center",
    minBlockSize: "1.75rem",
    padding: "0 0.75rem",
    lineHeight: "1.75rem",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    background: "var(--cdx-menu-selected-background-color)",
    color: "var(--cdx-content-color)",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > completion-section": {
    borderBottom: "1px solid var(--cdx-content-border-color)",
    fontFamily: "var(--_cdx-font-family)",
    fontSize: "0.75rem",
  },
  ".cm-completionMatchedText": {
    textDecoration: "none",
    color: "var(--cdx-caret-color)",
    fontWeight: "var(--_cdx-font-weight-medium)",
  },
  ".cm-completionDetail": {
    marginInlineStart: "auto",
    paddingInlineStart: "1rem",
    color: "var(--_cdx-color-on-surface-variant)",
    fontStyle: "normal",
  },
  ".cm-completionIcon": {
    color: "var(--_cdx-color-on-surface-variant)",
    opacity: "1",
  },
  ".cm-completionIcon-function, .cm-completionIcon-method": {
    color: "var(--cdx-syntax-function-color)",
  },
  ".cm-completionIcon-class, .cm-completionIcon-interface, .cm-completionIcon-type, .cm-completionIcon-enum":
    { color: "var(--cdx-syntax-type-color)" },
  ".cm-completionIcon-keyword": { color: "var(--cdx-syntax-keyword-color)" },
  ".cm-tooltip.cm-completionInfo": {
    padding: "0.5rem 0.75rem",
    maxWidth: "25rem",
  },
  ".cm-snippetField": {
    backgroundColor: "var(--cdx-bracket-match-background-color)",
  },

  // Search matches: every hit tinted, the current one stronger; selection echoes fainter still.
  ".cm-searchMatch": {
    backgroundColor: "var(--cdx-search-match-background-color)",
    borderRadius: "2px",
  },
  ".cm-searchMatch.cm-searchMatch-selected, .cm-searchMatch-selected": {
    backgroundColor: "var(--cdx-search-match-selected-background-color)",
    boxShadow: "inset 0 0 0 1px var(--cdx-search-match-selected-border-color)",
  },
  ".cm-selectionMatch": {
    backgroundColor: "var(--cdx-selection-match-background-color)",
    borderRadius: "2px",
  },
  ".cm-panels-top": {
    borderBottom: "1px solid var(--cdx-content-border-color)",
  },

  // LSP: hover, signature help, rename and references read as MD3 surfaces.
  ".cm-lsp-documentation": {
    padding: "0.5rem 0.75rem",
    maxWidth: "32rem",
    "& pre, & code": {
      fontFamily: "var(--cdx-content-font-family)",
      fontSize: "var(--cdx-content-font-size)",
    },
    "& pre": {
      margin: "0.25rem 0",
      padding: "0.5rem",
      backgroundColor: "var(--cdx-content-background-color)",
      borderRadius: "var(--_cdx-shape-corner-extra-small)",
      overflowX: "auto",
    },
    "& p": { margin: "0.25rem 0" },
  },
  ".cm-lsp-signature-tooltip": {
    padding: "0.375rem 0.75rem",
    "& .cm-lsp-signature": {
      fontFamily: "var(--cdx-content-font-family)",
      fontSize: "var(--cdx-content-font-size)",
    },
    "& .cm-lsp-active-parameter": {
      color: "var(--cdx-caret-color)",
      fontWeight: "var(--_cdx-font-weight-medium)",
      textDecoration: "none",
    },
  },
  ".cm-panel.cm-lsp-rename-panel, .cm-lsp-reference-panel": {
    padding: "0.5rem 0.75rem",
    "& input": {
      blockSize: "2rem",
      padding: "0 0.5rem",
      background: "transparent",
      border: "1px solid var(--_cdx-color-outline)",
      borderRadius: "var(--_cdx-shape-corner-extra-small)",
      color: "inherit",
      font: "inherit",
    },
  },
});

/** classHighlighter has no class for function names — layered on top so calls get their own color. */
export const functionHighlighter = tagHighlighter([
  { tag: tags.function(tags.variableName), class: "tok-function" },
  { tag: tags.function(tags.propertyName), class: "tok-function" },
]);

/** `tok-*` classes rather than inline styles, so the palette lives in CSS tokens. */
export const cdxHighlighting = [
  syntaxHighlighting(classHighlighter),
  syntaxHighlighting(functionHighlighter),
];
