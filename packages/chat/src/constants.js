/**
 * The effective conversation id `chx-chat` uses internally when it is **not** driven by conversations
 * (no `<chx-conversations>`, no conversations data/id from the app). A `Symbol`, so it can never
 * collide with a real (string) conversation id. Purely an internal sentinel for "which conversation
 * is active" — it is never stored on `ChxMessage.conversationId` (a `string`) nor passed to an adapter;
 * those keep using the public `activeConversationId` (`undefined` in single-conversation mode, exactly
 * as today). See `.claude/plans/messages/empty-state.md`.
 * @type {symbol}
 */
export const DEFAULT_CONVERSATION_ID = Symbol("chx:default-conversation");
