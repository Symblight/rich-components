/** @import { ChxMessage } from "../../types/message.js" */

// chx-message sits two shadow roots deep (message-list → infinity-scroll → message), so a page-level
// ::part() only reaches it with an exportparts hop at *every* host in between — see CLAUDE.md's
// "::part() only forwards one shadow level". Prefixed on the way out so they can't collide with
// chx-infinity-scroll's own parts.
const MESSAGE_PARTS = [
  "unread-marker",
  "avatar",
  "body",
  "meta",
  "attachments",
  "before-content",
  "content",
  "after-content",
  "status",
  "actions",
];
export const MESSAGE_EXPORTPARTS = MESSAGE_PARTS.map((part) => `${part}: message-${part}`).join(
  ", ",
);
// Per-row state names on the chx-message host itself, a deliberately closed vocabulary: exportparts
// has no wildcard, so every name a page can ever target has to be listed literally here.
const MESSAGE_STATE_PARTS = [
  "message-own",
  "message-incoming", // own's complement: part selectors can't be negated, so "not own" needs a name
  "message-unread",
  "message-streaming",
  "message-system",
  "message-compact",
  "message-loading",
  "message-selected",
];
export const INFINITY_SCROLL_EXPORTPARTS = [
  "scroller",
  "sticky",
  "viewport",
  "item",
  "message",
  ...MESSAGE_STATE_PARTS,
  ...MESSAGE_PARTS.map((part) => `message-${part}`),
].join(", ");

/** Own message still being delivered — an incoming reply shell is also "sending" while it streams,
 * but that's `busy`, not a delivery state. @param {ChxMessage} message */
export function isSending(message) {
  return message.own && message.status === "sending";
}

/** The row's part names, drawn from MESSAGE_STATE_PARTS. Custom properties set in a matching
 * `::part()` rule inherit into chx-message's shadow tree, which is how a page restyles a row's
 * interior (e.g. a chrome-free system row) without a nested part selector — those don't exist.
 * @param {ChxMessage} message @param {{streaming: boolean, compact: boolean, selected: boolean}} state */
export function messagePartNames(message, { streaming, compact, selected }) {
  const names = ["message"];
  names.push(message.own ? "message-own" : "message-incoming");
  if (message.readState === "unread") names.push("message-unread");
  if (streaming) names.push("message-streaming");
  if (message.parts?.[0]?.type === "system") names.push("message-system");
  if (compact) names.push("message-compact");
  if (isSending(message)) names.push("message-loading");
  if (selected) names.push("message-selected");
  return names.join(" ");
}
