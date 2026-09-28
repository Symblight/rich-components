import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import "@symblight/wc-material/icon";
import "@symblight/wc-material/progress-circular";

import readIcon from "@material-design-icons/svg/outlined/description.svg?raw";
import editIcon from "@material-design-icons/svg/outlined/edit.svg?raw";
import deleteIcon from "@material-design-icons/svg/outlined/delete.svg?raw";
import moveIcon from "@material-design-icons/svg/outlined/drive_file_move.svg?raw";
import searchIcon from "@material-design-icons/svg/outlined/search.svg?raw";
import executeIcon from "@material-design-icons/svg/outlined/terminal.svg?raw";
import thinkIcon from "@material-design-icons/svg/outlined/psychology.svg?raw";
import fetchIcon from "@material-design-icons/svg/outlined/cloud_download.svg?raw";
import switchModeIcon from "@material-design-icons/svg/outlined/swap_horiz.svg?raw";
import otherIcon from "@material-design-icons/svg/outlined/extension.svg?raw";

import pendingIcon from "@material-design-icons/svg/outlined/schedule.svg?raw";
import permissionIcon from "@material-design-icons/svg/outlined/back_hand.svg?raw";
import failedIcon from "@material-design-icons/svg/outlined/error.svg?raw";
import cancelledIcon from "@material-design-icons/svg/outlined/cancel.svg?raw";
import rejectedIcon from "@material-design-icons/svg/outlined/block.svg?raw";
import chevronIcon from "@material-design-icons/svg/outlined/expand_more.svg?raw";

import { RowCompactController } from "../../../controllers/agent/RowCompactController.js";
import visuallyHidden from "../../../styles/visually-hidden.css?inline";
import rowStyles from "../agent-row.css?inline";
import styles from "./tool-call.css?inline";

/** @typedef {{path: string, line?: number}} ChxToolCallLocation */

/** ACP's `ToolKind` values — anything else falls back to `other`. Null-prototype because `kind` is
 *  agent-controlled: on a plain literal, `constructor`/`toString` resolve up the chain to a Function
 *  that no `??` catches. Values feed `unsafeSVG` — build-time imports only, never runtime data.
 *  @type {Record<string, string>} */
const KIND_ICONS = Object.assign(Object.create(null), {
  read: readIcon,
  edit: editIcon,
  delete: deleteIcon,
  move: moveIcon,
  search: searchIcon,
  execute: executeIcon,
  think: thinkIcon,
  fetch: fetchIcon,
  switch_mode: switchModeIcon,
  other: otherIcon,
});

/** `in_progress` renders an md-progress-circular; `completed` renders nothing — success needs no
 *  attention. Null-prototype for the same reason as `KIND_ICONS`.
 *  @type {Record<string, {icon?: string, spinner?: boolean, label: string}>} */
const STATUSES = Object.assign(Object.create(null), {
  pending: { icon: pendingIcon, label: "Pending" },
  in_progress: { spinner: true, label: "Running" },
  "awaiting-permission": { icon: permissionIcon, label: "Awaiting permission" },
  completed: { label: "Completed" },
  failed: { icon: failedIcon, label: "Failed" },
  rejected: { icon: rejectedIcon, label: "Denied" },
  cancelled: { icon: cancelledIcon, label: "Cancelled" },
});

/** Expanded by default — live output and a failure's reason are worth seeing, a settled call isn't.
 *  An unknown status (ACP's set can grow) falls back to `pending`'s look, collapsed. */
const OPEN_STATUSES = new Set(["in_progress", "failed", "rejected"]);

/** @param {string} path */
function splitPath(path) {
  const slash = path.lastIndexOf("/");
  return { dir: path.slice(0, slash + 1), file: path.slice(slash + 1) };
}

/**
 * @tag chx-tool-call
 * @summary Agent tool-call row — a `partElements.tool_call` renderer the app wires up itself.
 * @fires chx-tool-call-toggle - `{open}`, on a disclosure change the component didn't make itself.
 * @fires chx-tool-call-location-click - `{path, line}`, a click on the row's folder path.
 */
@customElement("chx-tool-call")
export class ChxToolCall extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    toolCallId: { type: String, attribute: "tool-call-id" },
    label: { type: String },
    kind: { type: String, reflect: true },
    status: { type: String, reflect: true },
    locations: { attribute: false },
    meta: { type: String },
    error: { type: String },
    open: { type: Boolean, reflect: true },
    compact: { type: Boolean, reflect: true },
    hasContent: { state: true },
  };

  /** Latches on the first manual toggle — after that `status` never moves `open` again. */
  #userToggled = false;

  constructor() {
    super();

    /** ACP's `toolCallId` — carried for the app's own correlation, never interpreted here. @type {string} */
    this.toolCallId = "";

    /** ACP's `title` — named `label` so it doesn't collide with the native `title` tooltip attribute.
     *  @type {string} */
    this.label = "";

    /** @type {string} */
    this.kind = "other";

    /** Permission is deliberately not answered here — `chx-input-mode-banner` owns that, docked
     *  above the composer where a virtualized list can't recycle it away. `awaiting-permission`
     *  only accents the row, so the banner's question has a visible subject.
     *  @type {"pending" | "in_progress" | "awaiting-permission" | "completed" | "failed" | "rejected" | "cancelled"} */
    this.status = "pending";

    /** Only the first is shown — file name and line in the row, its folder muted after it.
     *  @type {ChxToolCallLocation[]} */
    this.locations = [];

    /** The result at a glance — `+1 −1`, `46 passed`. The `meta` slot overrides it.
     *  @type {string} */
    this.meta = "";

    /** Failure text, first thing in the expanded body. @type {string} */
    this.error = "";

    /** @type {boolean} */
    this.open = false;

    /** Follows the message row's `compact` inside a chat. @type {boolean} */
    this.compact = false;

    /** Default slot holds something — drives the chevron and whether the row opens.
     *  @type {boolean} */
    this.hasContent = false;

    new RowCompactController(this);
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [visuallyHidden, rowStyles, styles];
  }

  get #hasBody() {
    return this.hasContent || Boolean(this.error);
  }

  /** Expanded while the call is live or failed, folded once it settles — unless the user has taken
   *  the disclosure over.
   * @param {import("lit").PropertyValues} changedProperties */
  willUpdate(changedProperties) {
    super.willUpdate(changedProperties);
    if (changedProperties.has("status") && !this.#userToggled) {
      this.open = OPEN_STATUSES.has(this.status);
    }
  }

  /** Latched from the click, not from `toggle`: `toggle` is a queued task, so a `tool_call_update`
   *  arriving first re-renders `?open` over the collapse and the latch never engages.
   *  @param {MouseEvent} event */
  #handleSummaryClick = (event) => {
    // nothing to disclose — an open empty body would only draw a stray rule
    if (!this.#hasBody) {
      event.preventDefault();
      return;
    }
    this.#userToggled = true;
  };

  /** @param {Event} event */
  #handleToggle = (event) => {
    const open = /** @type {HTMLDetailsElement} */ (event.target).open;
    if (open === this.open) return;
    this.open = open;
    this.dispatchEvent(
      new CustomEvent("chx-tool-call-toggle", {
        detail: { open },
        bubbles: true,
        composed: true,
      }),
    );
  };

  /** @param {Event} event */
  #handleSlotchange = (event) => {
    const slot = /** @type {HTMLSlotElement} */ (event.target);
    this.hasContent = slot
      .assignedNodes({ flatten: true })
      .some((node) => node.nodeType === Node.ELEMENT_NODE || node.textContent?.trim());
  };

  /** Opens the file instead of toggling the row. @param {MouseEvent} event */
  #handlePathClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const { path, line } = /** @type {ChxToolCallLocation} */ (this.locations[0]);
    this.dispatchEvent(
      new CustomEvent("chx-tool-call-location-click", {
        detail: { path, line },
        bubbles: true,
        composed: true,
      }),
    );
  };

  /** @param {{icon?: string, spinner?: boolean}} status */
  #renderStatusIcon(status) {
    if (status.spinner) {
      return html`<md-progress-circular
        class="tool-call__status agent-row__progress"
        part="status"
      ></md-progress-circular>`;
    }
    if (!status.icon) return nothing;
    return html`<md-icon class="tool-call__status agent-row__icon" part="status" aria-hidden="true"
      >${unsafeSVG(status.icon)}</md-icon
    >`;
  }

  #renderLocation() {
    const location = /** @type {ChxToolCallLocation[]} */ (this.locations ?? [])[0];
    if (!location?.path) return nothing;
    const { dir, file } = splitPath(location.path);
    return html`
      <span class="tool-call__file" part="file"
        >${file}${
          location.line === undefined
            ? nothing
            : html`<span class="tool-call__line">:${location.line}</span>`
        }</span
      >
      ${
        dir
          ? html`<span
              class="tool-call__path"
              part="path"
              title=${location.path}
              @click=${this.#handlePathClick}
              ><bdi class="tool-call__path-text">${dir}</bdi></span
            >`
          : nothing
      }
    `;
  }

  render() {
    const status = STATUSES[this.status] ?? STATUSES.pending;
    const hasBody = this.#hasBody;
    return html`
      <details class="tool-call" part="container" ?open=${this.open} @toggle=${this.#handleToggle}>
        <summary
          class="tool-call__summary agent-row__head"
          part="summary"
          @click=${this.#handleSummaryClick}
        >
          <md-icon class="tool-call__icon agent-row__icon" part="icon" aria-hidden="true"
            >${unsafeSVG(KIND_ICONS[this.kind] ?? KIND_ICONS.other)}</md-icon
          >
          <span class="tool-call__label agent-row__label" part="label">${this.label}</span>
          ${this.#renderLocation()}
          <span class="agent-row__spacer"></span>
          <span class="tool-call__meta agent-row__meta" part="meta"
            ><slot name="meta">${this.meta}</slot></span
          >
          ${this.#renderStatusIcon(status)}
          <!-- Not a live region: announcing agent progress is the app's call. -->
          <span class="tool-call__status-label visually-hidden">${status.label}</span>
          ${
            hasBody
              ? html`<md-icon class="agent-row__chevron" aria-hidden="true"
                  >${unsafeSVG(chevronIcon)}</md-icon
                >`
              : nothing
          }
        </summary>
        <div class="tool-call__content agent-row__body" part="content" ?hidden=${!hasBody}>
          ${this.error ? html`<p class="tool-call__error" part="error">${this.error}</p>` : nothing}
          <slot @slotchange=${this.#handleSlotchange}></slot>
        </div>
      </details>
    `;
  }
}
