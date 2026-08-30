/**
 * Excludes-on-missing-id, warns-on-duplicate-id.
 * @param {import("../types/message.js").ChxMessage[]} messages
 */
export function validateMessages(messages) {
  const seenIds = new Set();
  for (const message of messages) {
    if (!message.id) {
      console.error('[chx-chat] message missing required "id"', message);
      continue;
    }
    if (seenIds.has(message.id)) {
      console.warn(
        `[chx-chat] duplicate message id "${message.id}" — only the first is reconcilable`,
        message,
      );
    }
    seenIds.add(message.id);

    const seenPartIds = new Set();
    for (const part of message.parts ?? []) {
      if (!part.id) {
        console.error(`[chx-chat] part missing required "id" in message "${message.id}"`, part);
        continue;
      }
      if (seenPartIds.has(part.id)) {
        console.warn(`[chx-chat] duplicate part id "${part.id}" in message "${message.id}"`, part);
      }
      seenPartIds.add(part.id);
    }
  }
}
