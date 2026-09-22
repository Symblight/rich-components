import "@symblight/wc-material/button";
import "../input-mode-banner/input-mode-banner.js";

/** ACP `PermissionOptionKind` → md-button variant. Allow reads as the affirmative action. */
export const OPTION_VARIANTS = {
  allow_once: "filled",
  allow_always: "tonal",
  reject_once: "outlined",
  reject_always: "text",
};

/**
 * @typedef {Object} ChxPermissionOption
 * @property {string} id
 * @property {string} label
 * @property {string} [kind] - ACP's `PermissionOptionKind`
 */

/**
 * @typedef {Object} ChxPermissionRequest
 * @property {string} requestId - correlate on this, never on `toolCallId`: one tool call can be the
 *   subject of several requests over its lifetime (the agent re-prompting after a `reject_once`)
 * @property {string} [toolCallId]
 * @property {string} label
 * @property {ChxPermissionOption[]} options
 */

/** The default answer control. Override `buildOption` to use your own design system's button —
 *  `.slot` and the answer-once click handler are the factory's job, not yours.
 *  @param {ChxPermissionOption} option @returns {HTMLElement} */
export function buildOptionButton(option) {
  const button = document.createElement("md-button");
  button.setAttribute(
    "variant",
    /** @type {any} */ (OPTION_VARIANTS)[option.kind ?? ""] ?? "outlined",
  );
  button.textContent = option.label;
  return button;
}

/**
 * Asks a permission question in a `chx-input-mode-banner` and resolves with the chosen option id,
 * or `null` if the turn was cancelled first — the shape an ACP `session/request_permission`
 * round-trip needs. The banner is deliberately not the tool card: a virtualized list recycles a
 * scrolled-off card out of the DOM entirely, buttons and all, while the turn sits blocked on it.
 *
 * Keep the banner mounted and only toggle `hidden`. It carries `role="status"`, and a live region
 * already in the DOM announces a text change far more reliably than one inserted with its own text.
 * @param {{
 *   getBanner: () => (HTMLElement & {label: string, variant: string}) | null | undefined,
 *   buildOption?: (option: ChxPermissionOption, request: ChxPermissionRequest) => HTMLElement,
 *   optionSlot?: string,
 *   variant?: string,
 * }} options
 * @returns {(request: ChxPermissionRequest, signal: AbortSignal) => Promise<string | null>}
 */
export function createBannerPermissionPrompt({
  getBanner,
  buildOption = buildOptionButton,
  optionSlot = "actions",
  variant = "danger",
}) {
  return (request, signal) =>
    new Promise((resolve) => {
      const banner = getBanner();
      if (!banner) return resolve(null);

      /** @param {string | null} optionId */
      const settle = (optionId) => {
        banner.hidden = true;
        banner.replaceChildren();
        resolve(optionId);
      };

      banner.label = request.label;
      banner.variant = variant;
      banner.replaceChildren(
        ...request.options.map((option) => {
          const element = buildOption(option, request);
          element.slot = optionSlot;
          // one answer per request: the first click tears the whole row down
          element.addEventListener("click", () => settle(option.id), { once: true });
          return element;
        }),
      );
      banner.hidden = false;
      signal.addEventListener("abort", () => settle(null), { once: true });
    });
}
