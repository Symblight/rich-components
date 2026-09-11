/** @typedef {import("./message.js").ChxMessage} ChxMessage */
/** @typedef {import("./message.js").ChxMessagePart} ChxMessagePart */

/**
 * @typedef {Object} ChxMessageDeltaChunk
 * @property {"delta"} [kind]
 * @property {string} messageId
 * @property {string} [authorId]
 * @property {string} partId
 * @property {string} [partType]
 * @property {Partial<Pick<ChxMessagePart, "text" | "html">>} delta
 */

/**
 * @typedef {Object} ChxMessageLifecycleChunk
 * @property {"finish" | "abort"} kind
 * @property {string} messageId
 */

/**
 * @typedef {Object} ChxMessagePartEndChunk
 * @property {"part-end"} kind
 * @property {string} messageId
 * @property {string} partId
 */

/**
 * @typedef {ChxMessageDeltaChunk | ChxMessageLifecycleChunk | ChxMessagePartEndChunk} ChxMessageChunk
 */

/**
 * @typedef {Object} ChxMessageEnvelope
 * @property {string} [eventId]
 * @property {number} [sequence]
 * @property {ChxMessageChunk} chunk
 */

/**
 * @typedef {(message: ChxMessage, previousElement?: HTMLElement) => HTMLElement} ChxMessageRenderer
 */

/**
 * @typedef {(part: ChxMessagePart, previousElement?: HTMLElement) => HTMLElement} ChxPartRenderer
 */

/**
 * @typedef {Object} ChxChatAdapter
 * @property {(input: {cursor?: string, direction?: "forward" | "backward", signal?: AbortSignal}) => Promise<{messages: ChxMessage[], cursor?: string, hasMore?: boolean}>} [listMessages]
 * @property {(handlers: {
 *   onMessage: (message: ChxMessage) => void,
 *   onChunk: (item: ChxMessageChunk | ChxMessageEnvelope) => void,
 *   onTyping?: (isTyping: boolean) => void,
 *   onConnectionChange: (state: "connecting" | "connected" | "error", error?: unknown) => void,
 * }) => () => void} [subscribe]
 * @property {(message: ChxMessage, options: {signal: AbortSignal}) => Promise<ReadableStream<ChxMessageChunk | ChxMessageEnvelope> | void>} [sendMessage]
 * @property {(replyMessageId: string, options: {signal: AbortSignal}) => Promise<ReadableStream<ChxMessageChunk | ChxMessageEnvelope> | void>} [regenerate]
 */

export {};
