import "../code-block/code-block.js";
import { detectLanguage } from "./detect-language.js";

/**
 * Builds a `{id, match, render}` PasteHandler (see types/paste-handler.js) that recognizes pasted
 * code via Lezer's own parse-error signal (detect-language.js) and renders it as a `chx-code-block`
 * chip — a plain function, not a component: assign the result straight to `pasteHandlers`, e.g.
 * `<chx-message-composer .pasteHandlers=${[createCodeBlockPasteHandler()]}>`. Composer/chat never
 * import this module — `pasteHandlers` is the existing generic extension point for exactly this.
 * @param {{minLines?: number, languages?: string[], maxErrorRatio?: number}} [options]
 * @returns {import("../../types/paste-handler.js").PasteHandler}
 */
export function createCodeBlockPasteHandler({ minLines = 2, languages, maxErrorRatio } = {}) {
  return {
    id: "code-block",
    match: ({ text, lines }) => {
      if (lines < minLines) return null;
      const detected = detectLanguage(text, { languages, maxErrorRatio });
      return detected ? { lang: detected.lang } : null;
    },
    render: ({ text, data }) => {
      const block = /** @type {HTMLElement & {code: string, lang: string, langMenu: boolean, editable: boolean}} */ (
        document.createElement("chx-code-block")
      );
      block.code = text;
      block.lang = /** @type {string} */ (data.lang);
      block.langMenu = true;
      block.editable = true;
      return block;
    },
  };
}
