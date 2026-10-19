/** @import { ChxMessage } from "../../types/message.js" */

// Pre-measurement geometry, mirroring message.css — only an estimate, the virtualizer measures the real row.
const ESTIMATE = {
  regular: { charsPerLine: 52, lineHeight: 24, padding: 16, meta: 20 },
  compact: { charsPerLine: 70, lineHeight: 20, padding: 6, meta: 19, avatar: 25 },
  rowPadding: 2, // .infinity-scroll__row
  groupGap: 12, // --chx-message-group-gap
  attachments: 128, // one wrapped row of attachment cards
};

/**
 * Rough pre-measurement height — text length → line count → px, cheap and approximate on purpose.
 * @param {ChxMessage} message
 * @param {{
 *   compact: boolean,
 *   groupStart: boolean,
 *   groupEnd: boolean,
 *   hasAuthor: boolean,
 *   dividerExtra: number,
 * }} row
 */
export function estimateMessageSize(
  message,
  { compact, groupStart, groupEnd, hasAuthor, dividerExtra },
) {
  const parts = message.parts ?? [];
  const chars = parts.reduce(
    (sum, part) =>
      part.type === "attachment" ? sum : sum + (part.text?.length ?? part.html?.length ?? 0),
    0,
  );
  const density = compact ? ESTIMATE.compact : ESTIMATE.regular;
  const lines = Math.max(1, Math.ceil(chars / density.charsPerLine));
  let size = lines * density.lineHeight + density.padding;
  if (parts.some((part) => part.type === "attachment")) size += ESTIMATE.attachments;

  // regular own rows hide their meta and avatar in CSS, so their author adds no height
  const authorShown = hasAuthor && (compact || !message.own);
  if (groupStart && authorShown) size += density.meta;
  if (compact && authorShown) size = Math.max(size, ESTIMATE.compact.avatar + density.padding);
  if (groupEnd) size += ESTIMATE.groupGap;

  // divider folds into the row
  return size + ESTIMATE.rowPadding + dividerExtra;
}
