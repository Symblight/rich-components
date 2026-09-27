import { ChxChat } from "./components/base/chat.js";
import { ChxConversations } from "./components/conversations/conversations.js";
import { ChxConversationItem } from "./components/conversation-item/conversation-item.js";
import { ChxMessage } from "./components/message/message.js";
import { ChxMessageRow } from "./components/message-row/message-row.js";

declare global {
  interface HTMLElementTagNameMap {
    "chx-chat": ChxChat;
    "chx-conversations": ChxConversations;
    "chx-conversation-item": ChxConversationItem;
    "chx-message": ChxMessage;
    "chx-message-row": ChxMessageRow;
  }
}

export {};
