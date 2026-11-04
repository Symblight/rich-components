/** @import { ChxMessage } from "./message.js" */
/** @import { ChxChatStatus } from "./adapter.js" */

/**
 * @typedef {Object} ChxDeliveryApi
 * @property {(messageId: string) => void} retry - re-sends a `status: "failed"` own message
 * @property {(messageId: string) => void} regenerate - redoes a reply; the reply's id or its send's id
 * @property {(conversationId?: string) => void} stop - aborts every in-flight delivery there
 * @property {(messageId: string) => void} cancel - aborts one in-flight delivery
 * @property {(conversationId?: string) => ChxChatStatus} getStatus - not tracked in `render()`; use `ChatController.status`
 * @property {(conversationId?: string) => boolean} isBusy - not tracked in `render()`; use `ChatController.busy`
 */

/**
 * @typedef {Object} ChxStoreApi
 * @property {(conversationId?: string) => ChxMessage[]} getMessages - not tracked in `render()`; use `ChatController.messages`
 * @property {(message: Omit<ChxMessage, "own" | "createdAt"> & {own?: boolean, createdAt?: number}) => void} add
 * @property {() => Promise<void> | undefined} loadMore - one older page of the active conversation
 * @property {(conversationId?: string) => void} refresh - clear + refetch
 * @property {(conversationId?: string) => void} clear - no argument clears every conversation
 * @property {(conversationId?: string) => boolean} hasMore - not tracked in `render()`; use `ChatController.hasMore`
 * @property {(conversationId?: string) => boolean} isLoading - not tracked in `render()`; use `ChatController.loading`
 */

/**
 * @typedef {Object} ChxPresenceApi
 * @property {(isTyping: boolean, conversationId?: string) => void} setTyping
 * @property {(conversationId?: string) => boolean} isTyping - not tracked in `render()`; use `ChatController.typing`
 */

/**
 * @typedef {Object} ChxViewportApi
 * @property {(behavior?: ScrollBehavior) => void} toBottom
 * @property {(messageId: string, options?: {align?: "start" | "center" | "end", behavior?: ScrollBehavior}) => Promise<boolean>} toMessage - `false` when the id isn't loaded
 * @property {() => boolean} isAwayFromBottom - not tracked in `render()`; use `ChatController.awayFromBottom`
 * @property {() => number | undefined} getScrollOffset
 * @property {(offset: number) => Promise<void>} scrollToOffset
 * @property {() => number | undefined | null} positionToSave - internal, for conversation switches:
 *   the offset to come back to, `undefined` for the bottom, `null` when mid-switch (keep what's saved)
 * @property {(offset: number | undefined) => Promise<void>} showPosition - internal: call right after
 *   `messages` swapped to another conversation; `undefined` is the bottom
 */

/**
 * @typedef {Object} ChxInputApi
 * @property {() => {value: string, html: string}} getValue
 * @property {(text: string) => void} setText
 * @property {() => void} clear - text only; files are `attachments.clear()`
 * @property {() => void} focus
 * @property {() => void} focusEnd
 * @property {() => boolean} isEmpty
 * @property {(node: Node, target?: string | null) => void} insertChip - replaces the command range
 *   `target` (from `chx-command-query`) with `node`, or inserts at the caret without one
 */

/**
 * @typedef {Object} ChxAttachmentsApi
 * @property {(files: File | File[]) => void} add
 * @property {(file: File) => void} remove
 * @property {() => void} clear
 * @property {() => File[]} getFiles - not tracked in `render()`; use `ChatController.files`
 * @property {() => void} open - opens the file picker
 */

/**
 * @typedef {Object} ChxChatApi
 * @property {ChxDeliveryApi} delivery
 * @property {ChxStoreApi} store
 * @property {ChxPresenceApi} presence
 * @property {ChxViewportApi} viewport
 * @property {ChxInputApi} input
 * @property {ChxAttachmentsApi} attachments
 */

/** @typedef {keyof ChxChatApi} ChxChatNamespace */

export {};
