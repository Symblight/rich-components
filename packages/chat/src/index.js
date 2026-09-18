export { ChxChat } from "./components/base/chat.js";
export { DEFAULT_CONVERSATION_ID } from "./constants.js";
export { ChxConversations } from "./components/conversations/conversations.js";
export { ChxConversationItem } from "./components/conversation-item/conversation-item.js";

export { readChipAttrs, buildChipElement, findChipElement } from "./editor/command-chip.js";

export {
  splitMessageParts,
  chipPartRule,
  createSplitOnSendHandler,
} from "./utils/split-message-parts.js";
