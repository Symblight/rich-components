/** @typedef {import("../../types/message.js").ChxMessage} ChxMessage */
/** @typedef {import("../../types/message.js").ChxMessagePart} ChxMessagePart */
/** @typedef {import("../../types/conversation.js").ChxUser} ChxUser */

/** Stable placeholder photo per name. @param {string} name */
export function avatarUrl(name) {
  return `https://i.pravatar.cc/72?u=${encodeURIComponent(name)}`;
}

export const ME = { name: "You", avatarUrl: avatarUrl("you") };
export const ASSISTANT = { name: "Assistant", avatarUrl: avatarUrl("assistant") };

/** @param {string} name @param {ChxUser["role"]} [role] @returns {ChxUser} */
export function makeUser(name, role) {
  return { id: name, displayName: name, role, avatarUrl: avatarUrl(name) };
}

/** @param {string} id @param {string} text @returns {ChxMessagePart} */
export function textPart(id, text) {
  return { id, type: "text", text };
}

/**
 * The shape `splitMessageParts` produces for a resolved picker/attachment chip.
 * @param {string} id
 * @param {{templateId: string, label: string, data: Record<string, unknown>}} chip
 * @returns {ChxMessagePart}
 */
export function chipPart(id, { templateId, label, data }) {
  return { id, type: "chip", templateId, label, icon: null, data };
}

/**
 * A sent message; `text` becomes a single text part unless `parts` is given.
 * @param {Partial<ChxMessage> & {id: string, own: boolean, text?: string}} options
 * @returns {ChxMessage}
 */
export function makeMessage({ id, own, text = "", parts, ...rest }) {
  return {
    authorId: own ? "me" : "assistant",
    createdAt: Date.now(),
    status: "sent",
    ...rest,
    id,
    own,
    parts: parts ?? [textPart(`${id}-t1`, text)],
  };
}

/** @param {number} i @param {boolean} own */
function defaultText(i, own) {
  return own ? `My message #${i}` : `Assistant reply #${i}, a bit longer to see wrapping happen.`;
}

/**
 * `count` messages ending now, `spacingMs` apart, ids `${prefix}-${i}`.
 * @param {number} count
 * @param {{prefix?: string, isOwn?: (i: number) => boolean, text?: (i: number, own: boolean) => string, spacingMs?: number}} [options]
 * @returns {ChxMessage[]}
 */
export function makeMessages(
  count,
  { prefix = "msg", isOwn = (i) => i % 2 === 0, text = defaultText, spacingMs = 1 } = {},
) {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const own = isOwn(i);
    return makeMessage({
      id: `${prefix}-${i}`,
      own,
      text: text(i, own),
      createdAt: now - (count - 1 - i) * spacingMs,
    });
  });
}
