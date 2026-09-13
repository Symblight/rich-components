import { LANGUAGES } from "../code-block/highlight.js";

/**
 * Candidate lang ids tried by default, most-specific/strict grammar first — on a tie (two
 * languages both parsing error-free) the first in this list wins, so e.g. valid JSON is reported
 * as "json" rather than the more permissive "javascript" superset. `html` is deliberately absent:
 * its grammar accepts arbitrary untagged text as a valid document, so plain prose always parses
 * with a 0 error ratio — there's no error-based signal to discriminate it from real markup. Any id
 * in code-block/highlight.js's LANGUAGES with a `.language` (html included) can still be passed
 * explicitly via the `languages` option, that risk understood.
 */
const DEFAULT_LANGUAGES = ["json", "javascript", "typescript", "python", "css"];

/**
 * Highest tolerated share of the input covered by Lezer's own error-recovery nodes. Kept tight
 * (not e.g. 5-10%): several grammars (Python's included) recover well enough from ordinary prose
 * — attribute-access-shaped phrases, bare-name "statements" — to land a percent or two of error
 * coverage on plain English, so a loose threshold reads sentences as code. A false negative (real
 * code, not detected) just stays plain text, same as before this feature existed; a false positive
 * visibly mangles a prose paste into a code chip — the two failure modes aren't equally costly.
 */
const DEFAULT_MAX_ERROR_RATIO = 0.01;

/**
 * These languages parse a leading `{...}` as a block statement, not an object literal, which
 * misclassifies the common "paste an object" case. Wrapping in parens forces expression parsing —
 * matching how the same text reads in the wild (a value being logged/returned), not as a program.
 */
const EXPRESSION_AMBIGUOUS = new Set(["javascript", "typescript", "jsx", "tsx"]);

/**
 * A grammar's error recovery can read an ordinary sentence as valid code with zero recovery
 * errors — JS/TS's ASI and labeled-statement rules read "Let me know if the deploy: succeeds..."
 * as a label followed by expression statements; Python's string literal tokenizes a contraction's
 * apostrophe ("That's") as an opening quote and lenently swallows the rest of the line as its body,
 * no error node either time. An error-ratio threshold alone can't catch either case, so this is a
 * blanket sanity gate: `text` must contain at least one character plain English essentially never
 * does but real code in any of these languages almost always does, checked once regardless of which
 * language ends up matching.
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
    if (EXPRESSION_AMBIGUOUS.has(lang)) ratio = Math.min(ratio, parseErrorRatio(language, `(${text}\n)`));
    if (ratio > maxErrorRatio) continue;
    if (!best || ratio < best.errorRatio) best = { lang, errorRatio: ratio };
  }
  return best;
}
