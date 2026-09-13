import { highlightTree, classHighlighter } from "@lezer/highlight";
import { javascriptLanguage, typescriptLanguage, tsxLanguage, jsxLanguage } from "@codemirror/lang-javascript";
import { cssLanguage } from "@codemirror/lang-css";
import { htmlLanguage } from "@codemirror/lang-html";
import { jsonLanguage } from "@codemirror/lang-json";
import { pythonLanguage } from "@codemirror/lang-python";
import { markdownLanguage } from "@codemirror/lang-markdown";

/**
 * @typedef {{ parser: { parse(code: string): import("@lezer/common").Tree } }} ParserLanguage
 * @typedef {{ label: string, language?: ParserLanguage }} LanguageEntry
 */

/**
 * `lang` id -> `{label, language}`. `label` drives the header text for every id, known or not;
 * `language` (a Lezer parser, imported eagerly — see below) drives highlighting — an id with no
 * `language` still shows its label, just as unhighlighted monospace text. One registry, not a
 * separate label map and language map, so the two can't drift apart.
 *
 * Imported eagerly, not per-language `import()`: a lazy load raced `chx-code-block`'s first paint
 * against RowMeasurer inside a virtualized list — the row got measured at its pre-highlight height
 * before the dynamic import resolved, then grew once it did, fighting the bottom-anchor/stick-to-
 * bottom logic in a loop. Eager loading means `highlightToHTML` is synchronous, so the row is
 * correct at its very first measurement. Trades per-language code-splitting for that; every
 * consumer of `chx-code-block` now bundles all languages below, not just the ones it renders.
 * @type {Record<string, LanguageEntry>}
 */
export const LANGUAGES = {
  javascript: { label: "JavaScript", language: javascriptLanguage },
  typescript: { label: "TypeScript", language: typescriptLanguage },
  tsx: { label: "TSX", language: tsxLanguage },
  jsx: { label: "JSX", language: jsxLanguage },
  css: { label: "CSS", language: cssLanguage },
  // No dedicated Sass grammar installed — CSS's is a reasonable approximation for highlighting
  // purposes (both share most token shapes), not a correctness claim about full Sass syntax.
  scss: { label: "SCSS", language: cssLanguage },
  html: { label: "HTML", language: htmlLanguage },
  json: { label: "JSON", language: jsonLanguage },
  python: { label: "Python", language: pythonLanguage },
  markdown: { label: "Markdown", language: markdownLanguage },
  // Listed for the header label / future language-picker vocabulary — no grammar wired up yet,
  // falls back to plain escaped text. Add a `language` here once a real consumer needs one highlighted.
  bash: { label: "Bash" },
  ruby: { label: "Ruby" },
  go: { label: "Go" },
  rust: { label: "Rust" },
  sql: { label: "SQL" },
  yaml: { label: "YAML" },
  diff: { label: "Diff" },
};

/** @type {Record<string, string>} */
const ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

/** @param {string} text @returns {string} */
function escapeHtml(text) {
  return text.replace(/[&<>]/g, (char) => ESCAPE_MAP[char]);
}

/**
 * Builds highlighted HTML for `code` — escaped text runs, highlighted ones wrapped in
 * `<span class="tok-...">` (CodeMirror's own `classHighlighter` naming, styled in code-block.css).
 * Unknown `lang`, or a known one with no `language` yet, returns `code` escaped and unwrapped.
 * Every text run goes through `escapeHtml` exactly once, highlighted or not — the one place a bug
 * here would be a real injection risk, since `code` is arbitrary user/app content.
 * @param {string} code
 * @param {string} lang
 * @returns {string}
 */
export function highlightToHTML(code, lang) {
  const language = LANGUAGES[lang]?.language;
  if (!language) return escapeHtml(code);

  const tree = language.parser.parse(code);

  let html = "";
  let lastPos = 0;
  highlightTree(tree, classHighlighter, (from, to, classes) => {
    if (from > lastPos) html += escapeHtml(code.slice(lastPos, from));
    html += `<span class="${classes}">${escapeHtml(code.slice(from, to))}</span>`;
    lastPos = to;
  });
  if (lastPos < code.length) html += escapeHtml(code.slice(lastPos));
  return html;
}
