import { freezeApi } from "./ApiRegistry.js";

/** @import { ChxChatApi } from "../types/api.js" */

const noop = () => {};

/** No-op fallbacks for a namespace with no owner — also the single checked list of method names. */
export const CHAT_API_DEFAULTS = freezeApi(
  /** @type {ChxChatApi} */ ({
    delivery: {
      retry: noop,
      regenerate: noop,
      stop: noop,
      cancel: noop,
      getStatus: () => "ready",
      isBusy: () => false,
    },
    store: {
      getMessages: () => [],
      add: noop,
      loadMore: () => undefined,
      refresh: noop,
      clear: noop,
      hasMore: () => false,
      isLoading: () => false,
    },
    presence: {
      setTyping: noop,
      isTyping: () => false,
    },
    viewport: {
      toBottom: noop,
      toMessage: async () => false,
      isAwayFromBottom: () => false,
      getScrollOffset: () => undefined,
      scrollToOffset: async () => {},
    },
    input: {
      getValue: () => ({ value: "", html: "" }),
      setText: noop,
      clear: noop,
      focus: noop,
      focusEnd: noop,
      isEmpty: () => true,
      insertChip: noop,
    },
    attachments: {
      add: noop,
      remove: noop,
      clear: noop,
      getFiles: () => [],
      open: noop,
    },
  }),
);
