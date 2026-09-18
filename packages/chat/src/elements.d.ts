import { ChxChat } from "./components/base/chat.js";
import { ChxConversations } from "./components/conversations/conversations.js";
import { ChxConversationItem } from "./components/conversation-item/conversation-item.js";

declare global {
  interface HTMLElementTagNameMap {
    "chx-chat": ChxChat;
    "chx-conversations": ChxConversations;
    "chx-conversation-item": ChxConversationItem;
  }
}

export {};
