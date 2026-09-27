/**
 * @typedef {Object} ChxMessagePart
 * @property {string} id
 * @property {"text" | "attachment" | "chip" | string} type
 * @property {string} [text]
 * @property {string} [html]
 * @property {unknown} [attachment]
 * @property {"streaming" | "done"} [state]
 * @property {string} [templateId] - `type: "chip"` — see `readChipAttrs`/`buildChipElement`
 * @property {string} [label] - `type: "chip"`, and `type: "tool_call"` (ACP's `title` — `label`
 *   there too, so it doesn't collide with the native `title` attribute on chx-tool-call)
 * @property {string | null} [icon] - `type: "chip"`
 * @property {string} [lang] - `type: "code"` (app-defined, e.g. `chx-code-block`'s paste handler)
 * @property {"pending" | "in_progress" | "completed" | "failed" | "awaiting-permission" | "cancelled"} [status] -
 *   `type: "tool_call"` — the tool call's own lifecycle, independent of `state` below (which only
 *   tracks whether this package is still receiving stream deltas for the part, not what the tool
 *   itself is doing). `awaiting-permission`/`cancelled` are this package's own, not ACP statuses —
 *   the latter is set locally when a turn is aborted with a tool call still mid-flight. Note
 *   `chx-tool-call` renders no permission UI for `awaiting-permission` (it falls back to `pending`'s
 *   look): answering a request is `chx-input-mode-banner`'s job, above the composer
 * @property {string} [kind] - `type: "tool_call"` — ACP's tool kind (`read`/`edit`/`execute`/…),
 *   drives chx-tool-call's header icon; anything unknown renders as `other`
 * @property {Array<{path: string, line?: number}>} [locations] - `type: "tool_call"` — files the
 *   call touches, rendered as chips
 * @property {string} [error] - `type: "tool_call"` — failure text for `status: "failed"`
 * @property {Array<{content: string, priority?: string, status?: "pending" | "in_progress" | "completed"}>} [entries] -
 *   `type: "plan"` — the whole plan, re-sent in full on every update
 * @property {Record<string, unknown>} [data] - opaque bag, round-tripped by `type: "chip"`/`"code"` parts
 */

/**
 * @typedef {Object} ChxMessage
 * @property {string} id
 * @property {string} [conversationId] - multi-conversation caching key, see chx-chat's `activeConversationId`
 * @property {string} [authorId]
 * @property {boolean} own
 * @property {number} createdAt
 * @property {"sending" | "sent" | "failed" | "cancelled"} [status]
 * @property {{message: string}} [error]
 * @property {string} [replyToId]
 * @property {"read" | "unread"} [readState]
 * @property {ChxMessagePart[]} parts
 */

/**
 * Per-row state, provided through `messageRowContext` to `chx-message` and anything slotted into it.
 * @typedef {Object} ChxRowState
 * @property {ChxMessage} message
 * @property {import("./conversation.js").ChxUser} [author]
 * @property {boolean} own
 * @property {boolean} unread
 * @property {boolean} streaming
 * @property {boolean} sending
 * @property {boolean} selected
 * @property {boolean} compact
 * @property {boolean} actionable - drilled into: interior controls should be tabbable
 * @property {boolean} groupStart
 * @property {boolean} groupEnd
 */

export {};
