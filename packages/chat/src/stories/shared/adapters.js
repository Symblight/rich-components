/** @typedef {import("../../types/message.js").ChxMessage} ChxMessage */
/** @typedef {import("../../types/adapter.js").ChxMessageChunk} ChxMessageChunk */
/** @typedef {import("../../types/realtime.js").ChxRealtimeEvent} ChxRealtimeEvent */
/** @typedef {ReadableStreamDefaultController<ChxMessageChunk>} ChunkController */

/** @param {number} ms @returns {Promise<void>} */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_REPLIES = [
  "That's a great question — let me think about that for a moment.",
  "Sure thing, here's what I'd suggest based on what you described.",
  "Good point. Let's walk through this step by step.",
  "Here's a quick breakdown of the key points to consider.",
  "I hear you — that's a common thing to run into, here's how I'd approach it.",
];

/**
 * A fake `sendMessage` that waits `delayMs` before the whole reply lands in one chunk — the wait is
 * what `chx-streaming-indicator` covers.
 * @param {{delayMs?: number, replies?: string[]}} [options]
 */
export function createReplyAdapter({ delayMs = 600, replies = DEFAULT_REPLIES } = {}) {
  let replyCount = 0;
  return {
    /** @param {ChxMessage} message @param {{signal: AbortSignal}} options */
    sendMessage: async (message, { signal }) => {
      await sleep(delayMs);
      if (signal.aborted) return;
      const replyId = `reply-${message.id}`;
      const text = replies[replyCount++ % replies.length];
      return new ReadableStream({
        start(controller) {
          controller.enqueue({
            messageId: replyId,
            authorId: "assistant",
            partId: `${replyId}-t1`,
            partType: "text",
            delta: { text },
          });
          controller.enqueue({ kind: "finish", messageId: replyId });
          controller.close();
        },
      });
    },
  };
}

/**
 * A fake `listMessages` over `total` messages, `pageSize` at a time, newest page first; `cursor` is
 * the stringified index to page backward from.
 * @param {{total: number, pageSize: number, delayMs?: number, makeMessage: (index: number, input: {conversationId?: string}) => ChxMessage}} options
 */
export function createPaginatedAdapter({ total, pageSize, delayMs = 600, makeMessage }) {
  return {
    /** @param {{conversationId?: string, cursor?: string}} input */
    listMessages: async (input) => {
      await sleep(delayMs);
      const end = input.cursor ? Number(input.cursor) : total;
      const start = Math.max(0, end - pageSize);
      const messages = Array.from({ length: end - start }, (_, i) => makeMessage(start + i, input));
      return { messages, cursor: String(start), hasMore: start > 0 };
    },
  };
}

/**
 * Captures the handlers `chx-chat` passes to `subscribe`, so a story can stand in for a server push.
 * A real adapter calls these from its own socket handler instead.
 */
export function createRealtimeStub() {
  /** @type {((message: ChxMessage) => void) | undefined} */
  let onMessage;
  /** @type {((event: ChxRealtimeEvent) => void) | undefined} */
  let onEvent;
  return {
    /** @param {{onMessage: (message: ChxMessage) => void, onEvent?: (event: ChxRealtimeEvent) => void}} handlers */
    subscribe: (handlers) => {
      onMessage = handlers.onMessage;
      onEvent = handlers.onEvent;
      return () => {
        onMessage = undefined;
        onEvent = undefined;
      };
    },
    /** @param {ChxMessage} message */
    emitMessage: (message) => onMessage?.(message),
    /** @param {ChxRealtimeEvent} event */
    emitEvent: (event) => onEvent?.(event),
  };
}

/**
 * Streams `text` into `partId` one chunk per `split` match (words by default, `/(?<=\n)/` for lines),
 * `delayMs` apart. `first` rides the first chunk only, e.g. a code part's `lang`.
 * @param {ChunkController} controller
 * @param {{messageId: string, partId: string, partType: string, text: string, split?: RegExp, first?: Record<string, unknown>, delayMs: number, signal: AbortSignal}} options
 */
export async function streamChunks(
  controller,
  { messageId, partId, partType, text, split = /(?<=\s)/, first, delayMs, signal },
) {
  for (const [i, chunk] of text.split(split).entries()) {
    if (signal.aborted) return;
    await sleep(delayMs);
    controller.enqueue({
      messageId,
      authorId: "assistant",
      partId,
      partType,
      delta: i === 0 && first ? { text: chunk, ...first } : { text: chunk },
    });
  }
}

/**
 * Ends a streamed turn from a `finally` — an aborted turn still needs a terminator, or chx-chat's
 * read stays pending forever.
 * @param {ChunkController} controller @param {string} messageId @param {AbortSignal} signal
 */
export function endTurn(controller, messageId, signal) {
  controller.enqueue({ kind: signal.aborted ? "abort" : "finish", messageId });
  controller.close();
}
