/** Schemes safe to hand to `window.open()` — blocks `javascript:`/`data:` etc. from a `getHref` that echoes untrusted data. */
const ALLOWED_URL_SCHEMES = new Set(["http:", "https:"]);

/**
 * Middle-click / Ctrl+Cmd+Enter "open in new tab" equivalent — a tree item isn't inherently a
 * link, so this resolves the optional `host.getHref(item)` callback; if it returns a safe URL,
 * opens it directly, otherwise dispatches a cancelable `tvx-open` so the app can route itself.
 * Plain Enter (no modifier) never goes through this controller — see `KeyboardNavController`.
 */
export class OpenController {
  /** @param {import("../base/tree-view.js").TvxTreeView} host */
  constructor(host) {
    this.host = host;
  }

  /** @param {MouseEvent} event */
  handleAuxClick(event) {
    if (event.button !== 1) return;
    const item = /** @type {Element} */ (event.target)?.closest?.("tvx-tree-item");
    if (!item || /** @type {any} */ (item).disabled) return;
    event.preventDefault();
    this.activate(/** @type {import("../components/tree-item/tree-item.js").TvxTreeItem} */ (item));
  }

  /** @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item */
  activate(item) {
    const href = this.host.getHref?.(item);
    if (href && this.#isSafeUrl(href)) {
      // noopener/noreferrer: the opened page must not get a `window.opener` back to this page
      // (reverse tabnabbing) — `href` is developer-supplied but frequently data-driven.
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    this.host.dispatchEvent(
      new CustomEvent("tvx-open", {
        detail: { key: item.key, node: item, newTab: true },
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
  }

  /** @param {string} href */
  #isSafeUrl(href) {
    try {
      return ALLOWED_URL_SCHEMES.has(new URL(href, window.location.href).protocol);
    } catch {
      return false;
    }
  }
}
