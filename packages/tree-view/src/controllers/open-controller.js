import { emit } from "../core/emit.js";

/** Only these schemes are opened directly — blocks `javascript:`/`data:` from a data-driven `getHref`. */
const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * "Open in new tab" (middle-click, Ctrl/Cmd+Enter): opens `host.getHref(item)` when it's a safe URL,
 * otherwise fires a cancelable `tvx-open` so the app can route itself.
 */
export class OpenController {
  /**
   * @param {import("../base/tree-view.js").TvxTreeView} host
   * @param {import("./tree-model-controller.js").TreeModelController} model
   */
  constructor(host, model) {
    this.host = host;
    this.model = model;
  }

  /** @param {PropertyKey} id */
  activate(id) {
    const item = this.model.item(id);
    const href = this.host.getHref?.(item);
    if (href && isSafeUrl(href)) {
      window.open(href, "_blank", "noopener,noreferrer"); // no `window.opener` back to this page
    } else {
      emit(this.host, "tvx-open", { key: id, node: item, newTab: true }, true);
    }
  }
}

/** @param {string} href */
function isSafeUrl(href) {
  try {
    return SAFE_PROTOCOLS.has(new URL(href, window.location.href).protocol);
  } catch {
    return false;
  }
}
