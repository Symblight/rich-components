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
 * @property {"pending" | "in_progress" | "completed" | "failed" | "awaiting-permission" | "rejected" | "cancelled"} [status] -
 *   `type: "tool_call"` — the tool call's own lifecycle, independent of `state` below (which only
 *   tracks whether this package is still receiving stream deltas for the part, not what the tool
 *   itself is doing). `awaiting-permission`/`rejected`/`cancelled` are this package's own, not
 *   ACP statuses — `rejected` when the user denies a permission request, `cancelled` set locally
 *   when a turn is aborted with a tool call still mid-flight. Note
 *   `chx-tool-call` renders no permission UI for `awaiting-permission` (it only accents the row):
 *   answering a request is `chx-input-mode-banner`'s job, above the composer
 * @property {string} [kind] - `type: "tool_call"` — ACP's tool kind (`read`/`edit`/`execute`/…),
 *   drives chx-tool-call's row icon; anything unknown renders as `other`
 * @property {Array<{path: string, line?: number}>} [locations] - `type: "tool_call"` — files the
 *   call touches; chx-tool-call shows the first one in its row
 * @property {string} [meta] - `type: "tool_call"` — the result at a glance (`+1 −1`, `46 passed`)
 * @property {string} [error] - `type: "tool_call"` — failure text for `failed`/`rejected`
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
 * @property {ChxMessageAuthor} [author] - shown by chx-message-list's `author-display`
 * @property {ChxMessagePart[]} parts
 */

/**
 * @typedef {Object} ChxMessageAuthor
 * @property {string} [name]
 * @property {string} [avatarUrl]
 */

/**
 * Per-row state, provided through `messageRowContext` to `chx-message` and anything slotted into it.
 * @typedef {Object} ChxRowState
 * @property {ChxMessage} message
 * @property {ChxMessageAuthor} [author]
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
