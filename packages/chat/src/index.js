export { ChxChat } from "./components/base/chat.js";
export { ChatController } from "./controllers/chat/ChatController.js";
export { DEFAULT_CONVERSATION_ID } from "./constants.js";
export { messageRowContext } from "./context/message-row-context.js";
export { ChxConversations } from "./components/conversations/conversations.js";
export { ChxConversationItem } from "./components/conversation-item/conversation-item.js";

export { readChipAttrs, buildChipElement, findChipElement } from "./editor/command-chip.js";

export {
  splitMessageParts,
  chipPartRule,
  createSplitOnSendHandler,
} from "./utils/split-message-parts.js";

/** @typedef {import("./types/api.js").ChxChatApi} ChxChatApi */
/** @typedef {import("./types/api.js").ChxChatNamespace} ChxChatNamespace */
/** @typedef {import("./types/api.js").ChxDeliveryApi} ChxDeliveryApi */
/** @typedef {import("./types/api.js").ChxStoreApi} ChxStoreApi */
/** @typedef {import("./types/api.js").ChxPresenceApi} ChxPresenceApi */
/** @typedef {import("./types/api.js").ChxViewportApi} ChxViewportApi */
/** @typedef {import("./types/api.js").ChxInputApi} ChxInputApi */
/** @typedef {import("./types/api.js").ChxAttachmentsApi} ChxAttachmentsApi */
