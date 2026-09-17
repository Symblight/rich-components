/** @typedef {import("./message.js").ChxMessage} ChxMessage */
/** @typedef {import("./message.js").ChxMessagePart} ChxMessagePart */
/** @typedef {import("./realtime.js").ChxRealtimeEvent} ChxRealtimeEvent */

/**
 * @typedef {Object} ChxMessageDeltaChunk
 * @property {"delta"} [kind]
 * @property {string} messageId
 * @property {string} [conversationId] - only consulted when this chunk creates a new message shell,
 *   see chx-chat's `activeConversationId` — a chunk for an already-known message ignores it
 * @property {string} [authorId]
 * @property {string} partId
 * @property {string} [partType]
 * @property {Partial<Pick<ChxMessagePart, "text" | "html">>} delta
 */

/**
 * @typedef {Object} ChxMessageLifecycleChunk
 * @property {"finish" | "abort"} kind
 * @property {string} messageId
 * @property {string} [conversationId] - see ChxMessageDeltaChunk's own note
 */

/**
 * @typedef {Object} ChxMessagePartEndChunk
 * @property {"part-end"} kind
 * @property {string} messageId
 * @property {string} [conversationId] - see ChxMessageDeltaChunk's own note
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
 * `message`/`index` are appended, not prepended — existing 2-arg renderers keep working
 * unmodified, since JS ignores trailing args a function doesn't declare.
 * @typedef {(part: ChxMessagePart, previousElement: HTMLElement | undefined, message: ChxMessage, index: number) => HTMLElement} ChxPartRenderer
 */

/**
 * @typedef {Object} ChxChatAdapter
 * @property {(input: {conversationId?: string, cursor?: string, direction?: "forward" | "backward", signal?: AbortSignal}) => Promise<{messages: ChxMessage[], cursor?: string, hasMore?: boolean}>} [listMessages]
 * @property {(handlers: {
 *   onMessage: (message: ChxMessage) => void,
 *   onChunk: (item: ChxMessageChunk | ChxMessageEnvelope) => void,
 *   onTyping?: (isTyping: boolean) => void,
 *   onConnectionChange: (state: "connecting" | "connected" | "error", error?: unknown) => void,
 *   onEvent?: (event: ChxRealtimeEvent) => void,
 * }) => () => void} [subscribe] - one long-lived, conversation-spanning subscription — never re-invoked
 *   on an `activeConversationId` switch, see chx-chat's `activeConversationId`; a `ChxMessage`/`ChxMessageChunk`
 *   for any conversation (including a currently-backgrounded one) can arrive on it at any time. `onEvent`
 *   covers typing/presence/read/conversation-collection sync — see `src/types/realtime.js` and
 *   `.claude/plans/messages/realtime-sync.md`; deliberately separate from `onMessage`/`onTyping`
 *   above, which keep covering the two event kinds they already handled before `onEvent` existed
 * @property {(message: ChxMessage, options: {signal: AbortSignal}) => Promise<ReadableStream<ChxMessageChunk | ChxMessageEnvelope> | void>} [sendMessage] - `message.conversationId` carries which
 *   conversation this send belongs to, same field as everywhere else — no separate parameter
 * @property {(replyMessageId: string, options: {signal: AbortSignal, conversationId?: string}) => Promise<ReadableStream<ChxMessageChunk | ChxMessageEnvelope> | void>} [regenerate]
 * @property {(input: {conversationId: string | undefined, messageId: string}) => Promise<void>} [markRead] - called
 *   fire-and-forget when a message crosses `chx-message-list`'s `readThreshold`, see `chx-message-read`
 */

export {};
