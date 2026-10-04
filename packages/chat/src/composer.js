// Composer add-ons entry point — `@symblight/chat/composer`. Nothing here is imported by `chx-chat`,
// so a chat that never slots them doesn't bundle any of it. Importing registers the custom elements.
export { ChxCommandPicker } from "./components/command-picker/command-picker.js";
export { ChxPasteLongText } from "./components/paste-long-text/paste-long-text.js";
export { ChxAttachments } from "./components/attachments/attachments.js";
export { ChxAttachment } from "./components/attachment/attachment.js";
export { ChxCodeBlock } from "./components/code-block/code-block.js";
