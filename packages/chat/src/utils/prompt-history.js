/** @typedef {import("../types/message.js").ChxMessage} ChxMessage */

/**
 * What a message says as plain text: its text, a chip's label.
 * @param {ChxMessage} message
 */
export const promptText = (message) =>
  message.parts.map((part) => part.text ?? part.label ?? "").join("");

/**
 * The messages Up can bring back, oldest first: your own with text, failed and cancelled included.
 * @param {readonly ChxMessage[]} messages
 */
export const recallable = (messages) =>
  messages.filter((message) => message.own && promptText(message).trim());

/**
 * Where a key leads.
 * @param {readonly ChxMessage[]} prompts `recallable()`
 * @param {string | null} at The shown prompt's id, `null` for the draft.
 * @param {"up" | "down"} direction
 * @returns {string | null} A message's id, `null` for the draft (a prompt that's gone leads there too), or `at` at the oldest.
 */
export function step(prompts, at, direction) {
  if (at === null) return direction === "up" ? (prompts.at(-1)?.id ?? null) : null;
  const index = prompts.findIndex((prompt) => prompt.id === at);
  if (index < 0) return null;
  if (direction === "up") return prompts[Math.max(index - 1, 0)].id;
  return prompts[index + 1]?.id ?? null;
}
