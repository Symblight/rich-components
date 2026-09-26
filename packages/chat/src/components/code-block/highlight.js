import { highlightTree, classHighlighter, tagHighlighter, tags } from "@lezer/highlight";
import {
  javascriptLanguage,
  typescriptLanguage,
  tsxLanguage,
  jsxLanguage,
} from "@codemirror/lang-javascript";
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
  // No Lezer grammar — hunk coloring is a line-prefix pass in `highlightDiff`, which is all a diff
  // needs and far less than a real grammar would cost.
  diff: { label: "Diff" },
};

/** @type {Record<string, string>} */
const ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

/** Quotes aren't escaped: every run lands in text-content position, never in an attribute value.
 *  Putting a `title=`/`data-*` on a token span breaks that — this output goes to `unsafeHTML`.
 *  @param {string} text @returns {string} */
function escapeHtml(text) {
  return text.replace(/[&<>]/g, (char) => ESCAPE_MAP[char]);
}

/** classHighlighter has no class for function names — layered on top so calls get their own color. */
const functionHighlighter = tagHighlighter([
  { tag: tags.function(tags.variableName), class: "tok-function" },
  { tag: tags.function(tags.propertyName), class: "tok-function" },
]);

/**
 * @typedef {{
 *   html: string,
 *   kind?: "added" | "removed" | "context" | "meta",
 *   sign?: string,
 *   prompt?: string,
 *   hunk?: { oldStart: number, newStart: number },
 * }} HighlightedLine
 * `sign`/`prompt` are the line's prefix, peeled off before highlighting so the grammar only ever
 * sees real source; `hunk` is set on a `@@ -a,b +c,d @@` meta line.
 */

const DIFF_META = /^(diff |index |@@|\+\+\+|---)/;
const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)/;

/** Highlights plain source into one HTML string per line. A token spanning several lines (block
 *  comment, template string) is split into one span per line, so every line is self-contained.
 *  Every text run goes through `escapeHtml` exactly once — `code` is arbitrary user/app content.
 * @param {string} code @param {string} lang @returns {string[]} */
function highlightSource(code, lang) {
  const language = LANGUAGES[lang]?.language;
  if (!language) return code.split("\n").map(escapeHtml);

  const lines = [""];
  /** @param {string} text @param {string} [classes] */
  const append = (text, classes) => {
    text.split("\n").forEach((piece, index) => {
      if (index > 0) lines.push("");
      if (!piece) return;
      const escaped = escapeHtml(piece);
      lines[lines.length - 1] += classes ? `<span class="${classes}">${escaped}</span>` : escaped;
    });
  };

  let lastPos = 0;
  highlightTree(
    language.parser.parse(code),
    [classHighlighter, functionHighlighter],
    (from, to, classes) => {
      if (from > lastPos) append(code.slice(lastPos, from));
      append(code.slice(from, to), classes);
      lastPos = to;
    },
  );
  if (lastPos < code.length) append(code.slice(lastPos));
  return lines;
}

/**
 * One entry per source line. With `diff` (implied by `lang === "diff"`), `code` is a unified diff:
 * each line's `+`/`-`/space prefix becomes `sign`, and the rest is highlighted as `lang` — so a
 * TypeScript diff keeps its syntax colors. With `prompt`, a leading `"<prompt> "` becomes `prompt`.
 * @param {string} code
 * @param {string} lang
 * @param {{ diff?: boolean, prompt?: string }} [options]
 * @returns {HighlightedLine[]}
 */
export function highlightToLines(code, lang, { diff = false, prompt = "" } = {}) {
  const isDiff = diff || lang === "diff";
  const promptPrefix = prompt ? `${prompt} ` : "";

  /** @type {HighlightedLine[]} */
  const lines = [];
  /** Source text per non-meta line, in order — highlighted as one document so tokens stay intact. */
  const sources = [];
  for (const raw of code.split("\n")) {
    if (isDiff && DIFF_META.test(raw)) {
      const match = HUNK.exec(raw);
      lines.push({
        html: escapeHtml(raw),
        kind: "meta",
        hunk: match ? { oldStart: Number(match[1]), newStart: Number(match[2]) } : undefined,
      });
      continue;
    }
    /** @type {HighlightedLine} */
    const line = { html: "" };
    let source = raw;
    if (isDiff) {
      line.kind = raw[0] === "+" ? "added" : raw[0] === "-" ? "removed" : "context";
      // Only a sign actually present in `code` — the editable body's textContent must stay `code`.
      if (raw[0] === "+" || raw[0] === "-" || raw[0] === " ") {
        line.sign = raw[0];
        source = raw.slice(1);
      }
    }
    if (promptPrefix && source.startsWith(promptPrefix)) {
      line.prompt = promptPrefix;
      source = source.slice(promptPrefix.length);
    }
    lines.push(line);
    sources.push(source);
  }

  const highlighted = highlightSource(sources.join("\n"), lang === "diff" ? "" : lang);
  let index = 0;
  for (const line of lines) {
    if (line.kind !== "meta") line.html = highlighted[index++] ?? "";
  }
  return lines;
}

/** @param {HighlightedLine} line @returns {string} */
export function renderLinePrefix(line) {
  const sign = line.sign ? `<span class="code-block__sign">${line.sign}</span>` : "";
  const prompt = line.prompt
    ? `<span class="code-block__prompt">${escapeHtml(line.prompt)}</span>`
    : "";
  return sign + prompt;
}

/** Inline per-line colors for the editable body, which has no block rows to carry a line class. */
/** @type {Partial<Record<string, string>>} */
const DIFF_TOKEN = { added: "tok-diffAdded", removed: "tok-diffRemoved", meta: "tok-diffMeta" };

/** Flat markup for the editable body. Prefixes stay in as real text so its `textContent` is `code`.
 * @param {string} code
 * @param {string} lang
 * @returns {string} */
export function highlightToHTML(code, lang) {
  return highlightToLines(code, lang)
    .map((line) => {
      const markup = renderLinePrefix(line) + line.html;
      const token = line.kind && DIFF_TOKEN[line.kind];
      return token ? `<span class="${token}">${markup}</span>` : markup;
    })
    .join("\n");
}
