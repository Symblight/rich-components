import { LANGUAGES } from "../code-block/highlight.js";

/**
 * Tried most-specific first — on a tie (e.g. valid JSON) the stricter grammar wins over a looser
 * superset like javascript. `html` is deliberately excluded: it parses arbitrary text as a valid
 * document with zero errors, so it can't discriminate code from prose; any id in
 * code-block/highlight.js's LANGUAGES can still be passed explicitly via `languages`.
 */
const DEFAULT_LANGUAGES = ["json", "javascript", "typescript", "python", "css"];

/**
 * Highest tolerated share of parse-error nodes. Kept tight because some grammars (Python included)
 * recover well enough from ordinary prose to still score a percent or two "valid" — a loose
 * threshold reads sentences as code, which is the more visible failure mode of the two.
 */
const DEFAULT_MAX_ERROR_RATIO = 0.01;

/**
 * These grammars parse a leading `{...}` as a block statement, not an object literal — wrapping in
 * parens forces expression parsing, matching how such a paste is actually used (a logged/returned
 * value, not a program).
 */
const EXPRESSION_AMBIGUOUS = new Set(["javascript", "typescript", "jsx", "tsx"]);

/**
 * A grammar's error recovery can read plain English as valid code with zero errors (JS/TS's ASI
 * and labeled-statement rules, Python's lenient string tokenizing) — error ratio alone can't catch
 * that, so this is a blanket gate requiring at least one character real code almost always has and
 * prose rarely does.
 */
const STRUCTURAL_HINT = /[{}()[\]=<>;]/;

/**
 * Share of `length` covered by Lezer's own error-recovery nodes, in [0, 1] — the signal this module
 * guesses a language from, not a separate classifier.
 * @param {import("@lezer/common").Tree} tree
 * @param {number} length
 * @returns {number}
 */
function errorRatio(tree, length) {
  if (length === 0) return 1;
  let errorChars = 0;
  const cursor = tree.cursor();
  do {
    if (cursor.type.isError) errorChars += cursor.to - cursor.from;
  } while (cursor.next());
  return errorChars / length;
}

/**
 * @param {import("../code-block/highlight.js").ParserLanguage} language
 * @param {string} text
 * @returns {number}
 */
function parseErrorRatio(language, text) {
  return errorRatio(language.parser.parse(text), text.length);
}

/**
 * Guesses which of `languages` `text` is written in: a language whose grammar parses it with
 * few/no recovery errors is a language it's plausibly valid in. Returns the candidate with the
 * lowest error ratio, provided it's at or under `maxErrorRatio`; otherwise `text` isn't confidently
 * code in any candidate language and this returns `null`.
 * @param {string} text
 * @param {{languages?: string[], maxErrorRatio?: number}} [options]
 * @returns {{lang: string, errorRatio: number} | null}
 */
export function detectLanguage(
  text,
  { languages = DEFAULT_LANGUAGES, maxErrorRatio = DEFAULT_MAX_ERROR_RATIO } = {},
) {
  if (!STRUCTURAL_HINT.test(text)) return null;

  let best = null;
  for (const lang of languages) {
    const language = LANGUAGES[lang]?.language;
    if (!language) continue;

    let ratio = parseErrorRatio(language, text);
    if (EXPRESSION_AMBIGUOUS.has(lang))
      ratio = Math.min(ratio, parseErrorRatio(language, `(${text}\n)`));
    if (ratio > maxErrorRatio) continue;
    if (!best || ratio < best.errorRatio) best = { lang, errorRatio: ratio };
  }
  return best;
}
