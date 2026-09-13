/**
 * @typedef {Object} ChxMessagePart
 * @property {string} id
 * @property {"text" | "attachment" | "chip" | string} type
 * @property {string} [text]
 * @property {string} [html]
 * @property {unknown} [attachment]
 * @property {"streaming" | "done"} [state]
 * @property {string} [templateId] - `type: "chip"` — see `readChipAttrs`/`buildChipElement`
 * @property {string} [label] - `type: "chip"`
 * @property {string | null} [icon] - `type: "chip"`
 * @property {string} [lang] - `type: "code"` (app-defined, e.g. `chx-code-block`'s paste handler)
 * @property {Record<string, unknown>} [data] - opaque bag, round-tripped by `type: "chip"`/`"code"` parts
 */

/**
 * @typedef {Object} ChxMessage
 * @property {string} id
 * @property {string} [authorId]
 * @property {boolean} own
 * @property {number} createdAt
 * @property {"sending" | "sent" | "failed" | "cancelled"} [status]
 * @property {{message: string}} [error]
 * @property {string} [replyToId]
 * @property {ChxMessagePart[]} parts
 */

export {};
