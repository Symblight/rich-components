// Internal: chx-chat pushes its registry into slotted owners through this key. Not exported from index.js.
export const CONNECT_REGISTRY = Symbol("chx-connect-registry");
// Internal: chx-chat names an own message it's adding (a send, `store.add()`), so the list pins that one
// and never an own message arriving through the adapter (history, a replay, another device).
export const NOTE_SEND = Symbol("chx-note-send");
