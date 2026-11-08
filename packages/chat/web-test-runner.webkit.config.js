import { playwrightLauncher } from "@web/test-runner-playwright";
import config from "./web-test-runner.config.js";

// Scroll-following specs in WebKit too: apps embed the chat in WKWebView (Tauri on macOS), whose
// scroll and resize timing differs from Chromium's. No coverage: the Chromium run measures it.
export default {
  ...config,
  coverage: false,
  files: [
    "src/components/message-list/agent-scroll.spec.js",
    "src/components/infinity-scroll/infinity-scroll.spec.js",
  ],
  browsers: [playwrightLauncher({ product: "webkit" })],
};
