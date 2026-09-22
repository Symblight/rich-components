import { readChipAttrs } from "../editor/command-chip.js";

/**
 * Splits a message's flat `html` body (what `chat.js`'s `handleSend` always produces — one
 * `{type: "text", html}` part regardless of what was typed) into an ordered parts array: any
 * element matching a rule's `selector` becomes its own `{id, type, ...toPart(element)}` part —
 * inline within a sentence or alone on its own line, both cases interleave correctly — everything
 * else collects into surrounding `{type: "text", text}` parts.
 *
 * Each visual line is its own top-level `<div>` (schema.js's `line` node); walking each line's
 * direct children in order (not `line.textContent` as one blob) is what lets a chip typed mid-
 * sentence split out correctly instead of flattening the whole line to plain text.
 * @param {string} id
 * @param {string} html
 * @param {import("../types/inline-part-rule.js").InlinePartRule[]} rules
 * @returns {import("../types/message.js").ChxMessagePart[] | null} null when no rule matched anything
 */
export function splitMessageParts(id, html, rules) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  if (!rules.some((rule) => wrapper.querySelector(rule.selector))) return null;

  /** @type {import("../types/message.js").ChxMessagePart[]} */
  const parts = [];
  let index = 0;
  let buffer = "";
  // trim() only decides whether buffer is meaningfully non-empty (a whitespace-only segment, e.g.
  // the lone trailing space after a solo chip/paste on its own line, is correctly skipped) — the
  // pushed text keeps its real, untrimmed spacing, or "text " + "chip" + " name " would collapse
  // into "textname" once rendered as adjacent sibling elements.
  const flush = () => {
    if (buffer.trim()) parts.push({ id: `${id}-p${index++}`, type: "text", text: buffer });
    buffer = "";
  };

  const lines = [...wrapper.children];
  lines.forEach((line, lineIndex) => {
    for (const node of line.childNodes) {
      const rule =
        node instanceof Element && rules.find((candidate) => node.matches(candidate.selector));
      if (rule) {
        flush();
        parts.push({
          id: `${id}-p${index++}`,
          type: rule.type,
          ...rule.toPart(/** @type {HTMLElement} */ (node)),
        });
        continue;
      }
      buffer += node.textContent ?? "";
    }
    if (lineIndex < lines.length - 1) buffer += "\n";
  });
  flush();
  return parts;
}

/**
 * Ready-made rule for `chip` nodes (`schema.js`) — matches `[data-template-id]`, reuses the same
 * `readChipAttrs` the live chip-building path already calls, so the resulting part's
 * `{templateId, label, icon, data}` shape feeds straight into `buildChipElement` unchanged.
 * @type {import("../types/inline-part-rule.js").InlinePartRule}
 */
export const chipPartRule = {
  type: "chip",
  selector: "[data-template-id]",
  toPart: (element) => readChipAttrs(element),
};

/**
 * Convenience `chx-messages-change` handler factory — re-splits a just-sent own message's flat
 * text part via `splitMessageParts`, then feeds the corrected parts back through `addMessage()`
 * (matches by `id`, replacing in place rather than duplicating). Covers the common case of every
 * `partElements`-based hydration demo in this package: wire it once per set of rules and forget it.
 * @param {import("../types/inline-part-rule.js").InlinePartRule[]} rules
 * @returns {(event: CustomEvent<{messages: import("../types/message.js").ChxMessage[]}>) => void}
 */
export function createSplitOnSendHandler(rules) {
  return (event) => {
    const last = event.detail.messages.at(-1);
    const part = last?.parts[0];
    if (
      !last?.own ||
      last.parts.length !== 1 ||
      part?.type !== "text" ||
      typeof part.html !== "string"
    ) {
      return;
    }

    const parts = splitMessageParts(last.id, part.html, rules);
    if (!parts) return;
    /** @type {HTMLElement & {addMessage: (message: import("../types/message.js").ChxMessage) => void}} */ (
      event.currentTarget
    ).addMessage({ ...last, parts });
  };
}
