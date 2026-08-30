/** @import { ChxMessage, ChxMessagePart } from "../types/message.js" */
/** @import { ChxMessageChunk } from "../types/adapter.js" */

/**
 * Finds an existing message by chunk.messageId, or creates a shell (own computed the same way
 * reconcileMessages does) and appends it. `replyToId` tags a newly-created shell with whatever
 * message it's anchored to — only meaningful the first time a given messageId is seen, ignored on
 * every later chunk for the same id.
 * @param {ChxMessage[]} messages
 * @param {ChxMessageChunk} chunk
 * @param {string} [userId]
 * @param {string} [replyToId]
 * @returns {{ messages: ChxMessage[], index: number }}
 */
export function getOrCreateMessage(messages, chunk, userId, replyToId) {
  const index = messages.findIndex((m) => m.id === chunk.messageId);
  if (index !== -1) return { messages, index };
  /** @type {ChxMessage} */
  const shell = {
    id: chunk.messageId,
    authorId: /** @type {any} */ (chunk).authorId,
    own: /** @type {any} */ (chunk).authorId === userId,
    createdAt: Date.now(),
    status: "sending",
    ...(replyToId ? { replyToId } : {}),
    parts: [],
  };
  return { messages: [...messages, shell], index: messages.length };
}

/**
 * Applies one delta chunk to a parts array — validates type/state before reusing an existing
 * part, stopping one stream from hijacking another's part or reviving a "done" part.
 * @param {ChxMessagePart[]} parts
 * @param {import("../types/adapter.js").ChxMessageDeltaChunk} chunk
 * @returns {ChxMessagePart[]}
 */
export function applyChunkToParts(parts, chunk) {
  const index = parts.findIndex((p) => p.id === chunk.partId);
  if (index === -1) {
    return [
      ...parts,
      /** @type {ChxMessagePart} */ ({
        id: chunk.partId,
        type: chunk.partType ?? "text",
        state: "streaming",
        ...chunk.delta,
      }),
    ];
  }
  const existing = parts[index];
  if (existing.state === "done") {
    console.warn(`[chx-chat] chunk for already-"done" part "${chunk.partId}" — dropped`, chunk);
    return parts;
  }
  const patched = {
    ...existing,
    text: (existing.text ?? "") + (chunk.delta.text ?? ""), // append — matches every real LLM
    //       streaming API's wire convention (OpenAI's delta.content, Anthropic's text_delta.text)
    ...(chunk.delta.html !== undefined ? { html: chunk.delta.html } : {}), // replace, not append —
    //   html isn't safely concatenative the way plain text is
  };
  return parts.with(index, patched);
}

/**
 * Called once a stream ends successfully — flips every still-"streaming" part to "done".
 * @param {ChxMessage} message
 * @returns {ChxMessage}
 */
export function finalizeStreamingParts(message) {
  // .map() always allocates a new array even when nothing changes, so reference-stability can't
  // be checked against its result directly — tracked explicitly instead
  let changed = false;
  const parts = message.parts.map((p) => {
    if (p.state !== "streaming") return p;
    changed = true;
    return /** @type {ChxMessagePart} */ ({ ...p, state: "done" });
  });
  return changed ? { ...message, parts } : message;
}

/**
 * Finalizes exactly one part by id — the per-part counterpart to finalizeStreamingParts above.
 * @param {ChxMessagePart[]} parts
 * @param {string} partId
 * @returns {ChxMessagePart[]}
 */
export function finalizePart(parts, partId) {
  const index = parts.findIndex((p) => p.id === partId);
  if (index === -1 || parts[index].state !== "streaming") return parts;
  return parts.with(index, { ...parts[index], state: "done" });
}

/**
 * Composition of the four helpers above — the one entry point streamDeltaBuffer.js calls.
 * @param {ChxMessage[]} messages
 * @param {ChxMessageChunk} chunk
 * @param {string} [userId]
 * @param {string} [replyToId]
 * @returns {ChxMessage[]}
 */
export function reconcileChunk(messages, chunk, userId, replyToId) {
  const { messages: withMessage, index } = getOrCreateMessage(messages, chunk, userId, replyToId);
  const message = withMessage[index];

  if (chunk.kind === "finish") {
    return withMessage.with(index, finalizeStreamingParts({ ...message, status: "sent" }));
  }
  if (chunk.kind === "abort") {
    return withMessage.with(index, finalizeStreamingParts({ ...message, status: "cancelled" }));
  }
  if (chunk.kind === "part-end") {
    return withMessage.with(index, { ...message, parts: finalizePart(message.parts, chunk.partId) });
  }

  const parts = applyChunkToParts(
    message.parts,
    /** @type {import("../types/adapter.js").ChxMessageDeltaChunk} */ (chunk),
  );
  return withMessage.with(index, { ...message, parts });
}
