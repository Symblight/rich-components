import { ChxChat } from "./components/base/chat.js";

declare global {
  interface HTMLElementTagNameMap {
    "chx-chat": ChxChat;
  }
}

export {};
