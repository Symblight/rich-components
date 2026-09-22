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
 * @param {string} [conversationId] - explicit target (a `#deliver`/`#deliverRegenerate` call always
 *   knows this up front); falls back to the chunk's own `conversationId` for `subscribe`'s `onChunk`,
 *   which has no other way to know which conversation an unseen `messageId` belongs to
 * @returns {{ messages: ChxMessage[], index: number }}
 */
export function getOrCreateMessage(messages, chunk, userId, replyToId, conversationId) {
  const index = messages.findIndex((m) => m.id === chunk.messageId);
  if (index !== -1) return { messages, index };
  /** @type {ChxMessage} */
  const shell = {
    id: chunk.messageId,
    conversationId: conversationId ?? /** @type {any} */ (chunk).conversationId,
    authorId: /** @type {any} */ (chunk).authorId,
    own: /** @type {any} */ (chunk).authorId === userId,
    createdAt: Date.now(),
    status: "sending",
    ...(replyToId ? { replyToId } : {}),
    parts: [],
  };
  return { messages: [...messages, shell], index: messages.length };
}

/** Tool-call statuses that mean nothing further is expected for that part. */
const SETTLED_STATUSES = new Set(["completed", "failed", "cancelled"]);

/** A tool call still mid-flight — only `tool_call` parts carry a `status` at all.
 * @param {ChxMessagePart} part */
function isUnsettled(part) {
  return part.status !== undefined && !SETTLED_STATUSES.has(part.status);
}

/**
 * Applies one delta chunk to a parts array — validates state before reusing an existing part,
 * stopping one stream from reviving another's finished text part.
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
  // a turn-level finish/abort marks every part "done" at once; a part owning a `status` (a tool
  // call) keeps taking updates past that — its lifecycle is the agent's, not the turn's
  if (existing.state === "done" && existing.status === undefined) {
    console.warn(`[chx-chat] chunk for already-"done" part "${chunk.partId}" — dropped`, chunk);
    return parts;
  }
  // id/type/state are structural, never patched by a delta — the type already forbids this,
  // discarded here too since a misbehaving adapter can still hand us any plain object at runtime
  const {
    id: _id,
    type: _type,
    state: _state,
    text: _text,
    ...rest
  } = /** @type {any} */ (chunk.delta);
  const patched = {
    ...existing,
    ...rest, // every field but `text` replaces outright — covers `html` (not safely concatenative
    //           the way plain text is) and any other part-specific field (e.g. a tool call's
    //           `status`/`locations`), not just the two this used to special-case
    text: (existing.text ?? "") + (chunk.delta.text ?? ""), // append — matches every real LLM
    //       streaming API's wire convention (OpenAI's delta.content, Anthropic's text_delta.text)
  };
  return parts.with(index, patched);
}

/**
 * Called once a stream ends — flips every still-"streaming" part to "done". Under `cancelled` (an
 * `abort`) it also settles any mid-flight tool call, since after a cancel the agent's own final
 * update may never come; a real one arriving later still overwrites it.
 * @param {ChxMessage} message
 * @param {{cancelled?: boolean}} [options]
 * @returns {ChxMessage}
 */
export function finalizeStreamingParts(message, { cancelled = false } = {}) {
  // .map() always allocates a new array even when nothing changes, so reference-stability can't
  // be checked against its result directly — tracked explicitly instead
  let changed = false;
  const parts = message.parts.map((p) => {
    const settle = cancelled && isUnsettled(p);
    if (p.state !== "streaming" && !settle) return p;
    changed = true;
    return /** @type {ChxMessagePart} */ ({
      ...p,
      state: "done",
      ...(settle ? { status: "cancelled" } : {}),
    });
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
 * @param {string} [conversationId] - see getOrCreateMessage's own note
 * @returns {ChxMessage[]}
 */
export function reconcileChunk(messages, chunk, userId, replyToId, conversationId) {
  const { messages: withMessage, index } = getOrCreateMessage(
    messages,
    chunk,
    userId,
    replyToId,
    conversationId,
  );
  const message = withMessage[index];

  if (chunk.kind === "finish") {
    return withMessage.with(index, finalizeStreamingParts({ ...message, status: "sent" }));
  }
  if (chunk.kind === "abort") {
    return withMessage.with(
      index,
      finalizeStreamingParts({ ...message, status: "cancelled" }, { cancelled: true }),
    );
  }
  if (chunk.kind === "part-end") {
    return withMessage.with(index, {
      ...message,
      parts: finalizePart(message.parts, chunk.partId),
    });
  }

  const parts = applyChunkToParts(
    message.parts,
    /** @type {import("../types/adapter.js").ChxMessageDeltaChunk} */ (chunk),
  );
  return withMessage.with(index, { ...message, parts });
}
