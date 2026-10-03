import { createContext } from "@lit/context";

/** @typedef {import("../api/ApiRegistry.js").ApiRegistry<import("../types/api.js").ChxChatApi>} ChatApiRegistry */

/**
 * The chat's API registry, provided by `chx-chat` and consumed by `ChatController`.
 * @type {import("@lit/context").Context<symbol, ChatApiRegistry>}
 */
export const chatApiContext = createContext(Symbol.for("@symblight/chat/api"));
