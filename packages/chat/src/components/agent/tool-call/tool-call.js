import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import "@symblight/wc-material/icon";
import "@symblight/wc-material/progress-circular";
import "../../chip/chip.js";

import readIcon from "@material-design-icons/svg/outlined/description.svg?raw";
import editIcon from "@material-design-icons/svg/outlined/edit.svg?raw";
import deleteIcon from "@material-design-icons/svg/outlined/delete.svg?raw";
import moveIcon from "@material-design-icons/svg/outlined/drive_file_move.svg?raw";
import searchIcon from "@material-design-icons/svg/outlined/search.svg?raw";
import executeIcon from "@material-design-icons/svg/outlined/terminal.svg?raw";
import thinkIcon from "@material-design-icons/svg/outlined/psychology.svg?raw";
import fetchIcon from "@material-design-icons/svg/outlined/cloud.svg?raw";
import switchModeIcon from "@material-design-icons/svg/outlined/swap_horiz.svg?raw";
import otherIcon from "@material-design-icons/svg/outlined/bolt.svg?raw";

import pendingIcon from "@material-design-icons/svg/outlined/schedule.svg?raw";
import permissionIcon from "@material-design-icons/svg/outlined/front_hand.svg?raw";
import completedIcon from "@material-design-icons/svg/outlined/check_circle.svg?raw";
import failedIcon from "@material-design-icons/svg/outlined/error.svg?raw";
import cancelledIcon from "@material-design-icons/svg/outlined/cancel.svg?raw";

import visuallyHidden from "../../../styles/visually-hidden.css?inline";
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

/** `in_progress` has no glyph — it renders an md-progress-circular, see `#renderStatusIcon`.
 *  Null-prototype for the same reason as `KIND_ICONS`.
 *  @type {Record<string, {icon?: string, label: string}>} */
const STATUSES = Object.assign(Object.create(null), {
  pending: { icon: pendingIcon, label: "Pending" },
  in_progress: { label: "Running" },
  "awaiting-permission": { icon: permissionIcon, label: "Awaiting permission" },
  completed: { icon: completedIcon, label: "Completed" },
  failed: { icon: failedIcon, label: "Failed" },
  cancelled: { icon: cancelledIcon, label: "Cancelled" },
});

/** Expanded by default — live or user-blocked work is worth watching, a settled call isn't. An
 *  unknown status (ACP's set can grow) falls back to `pending`'s look, collapsed. */
const OPEN_STATUSES = new Set(["pending", "in_progress", "awaiting-permission"]);

/** @param {ChxToolCallLocation} location */
function formatLocation({ path, line }) {
  return line === undefined ? path : `${path}:${line}`;
}

/**
 * @tag chx-tool-call
 * @summary Agent tool-call card — a `partElements.tool_call` renderer the app wires up itself.
 * @fires chx-tool-call-toggle - `{open}`, on a disclosure change the component didn't make itself.
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
    maxLocations: { type: Number, attribute: "max-locations" },
    error: { type: String },
    open: { type: Boolean, reflect: true },
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
     *  only accents the card, so the banner's question has a visible subject.
     *  @type {"pending" | "in_progress" | "awaiting-permission" | "completed" | "failed" | "cancelled"} */
    this.status = "pending";

    /** @type {ChxToolCallLocation[]} */
    this.locations = [];

    /** Chips past this many collapse into one `+N more`, so a call touching hundreds of files
     *  doesn't put hundreds of custom elements in one measured row. 0 renders all. @type {number} */
    this.maxLocations = 8;

    /** Failure text — shown outside the disclosure, so a collapsed card still says why. @type {string} */
    this.error = "";

    /** @type {boolean} */
    this.open = false;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [visuallyHidden, styles];
  }

  /** Expanded while the call is live, folded once it settles — unless the user has taken the
   *  disclosure over.
   * @param {import("lit").PropertyValues} changedProperties */
  willUpdate(changedProperties) {
    super.willUpdate(changedProperties);
    if (changedProperties.has("status") && !this.#userToggled) {
      this.open = OPEN_STATUSES.has(this.status);
    }
  }

  /** Latched from the click, not from `toggle`: `toggle` is a queued task, so a `tool_call_update`
   *  arriving first re-renders `?open` over the collapse and the latch never engages. */
  #handleSummaryClick = () => {
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

  /** md-progress-circular self-sets `aria-hidden` and runs its own indeterminate animation, so a
   *  running call needs neither here — the status rides in `.tool-call__status-label`.
   *  @param {{icon?: string}} status @returns {import("lit").TemplateResult} */
  #renderStatusIcon(status) {
    if (!status.icon) {
      return html`<md-progress-circular class="tool-call__status-progress"></md-progress-circular>`;
    }
    return html`<md-icon class="tool-call__status-icon" aria-hidden="true"
      >${unsafeSVG(status.icon)}</md-icon
    >`;
  }

  #renderSummary() {
    const status = STATUSES[this.status] ?? STATUSES.pending;
    return html`
      <summary class="tool-call__summary" part="summary" @click=${this.#handleSummaryClick}>
        <md-icon class="tool-call__kind-icon" aria-hidden="true"
          >${unsafeSVG(KIND_ICONS[this.kind] ?? KIND_ICONS.other)}</md-icon
        >
        <span class="tool-call__label" part="label">${this.label}</span>
        ${this.#renderStatusIcon(status)}
        <!-- Not a live region: announcing agent progress is the app's call. -->
        <span class="tool-call__status-label visually-hidden">${status.label}</span>
      </summary>
    `;
  }

  #renderLocations() {
    const locations = /** @type {ChxToolCallLocation[]} */ (this.locations ?? []);
    if (locations.length === 0) return nothing;
    const limit = this.maxLocations > 0 ? this.maxLocations : locations.length;
    const shown = locations.slice(0, limit);
    const overflow = locations.length - shown.length;
    return html`
      <div class="tool-call__locations" part="locations">
        ${map(
          shown,
          (location) =>
            html`<chx-chip class="tool-call__location">${formatLocation(location)}</chx-chip>`,
        )}
        ${
          overflow > 0
            ? html`<chx-chip class="tool-call__location tool-call__location_overflow"
                >+${overflow} more</chx-chip
              >`
            : nothing
        }
      </div>
    `;
  }

  render() {
    return html`
      <div class="tool-call" part="container">
        <details
          class="tool-call__disclosure"
          part="disclosure"
          ?open=${this.open}
          @toggle=${this.#handleToggle}
        >
          ${this.#renderSummary()}
          <div class="tool-call__content" part="content">
            ${this.#renderLocations()}
            <slot></slot>
          </div>
        </details>
        <!-- Not gated on a failed status: a cancel can carry failure text too. -->
        ${
          this.error
            ? html`<div class="tool-call__error" part="error">${this.error}</div>`
            : nothing
        }
      </div>
    `;
  }
}
