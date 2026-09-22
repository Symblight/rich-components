// Agentic entry point — `@symblight/chat/agent`. Nothing here is imported by `chx-chat`, so a
// messenger that never touches this subpath doesn't bundle any of it. Importing registers the
// custom elements; how a part turns into one of them is the app's own `partElements` renderer.
export { ChxThought } from "./components/agent/thought/thought.js";
export { ChxPlan } from "./components/agent/plan/plan.js";
export { ChxToolCall } from "./components/agent/tool-call/tool-call.js";
export { ChxToolCallDiff } from "./components/agent/tool-call-diff/tool-call-diff.js";
export { ChxInputModeBanner } from "./components/input-mode-banner/input-mode-banner.js";

export {
  OPTION_VARIANTS,
  buildOptionButton,
  createBannerPermissionPrompt,
} from "./components/agent/permission.js";
