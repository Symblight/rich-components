import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { map } from "lit/directives/map.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import "@symblight/wc-material/icon";
import "@symblight/wc-material/progress-circular";
import "@symblight/wc-material/progress-linear";

import planIcon from "@material-design-icons/svg/outlined/checklist.svg?raw";
import chevronIcon from "@material-design-icons/svg/outlined/expand_more.svg?raw";
import pendingIcon from "@material-design-icons/svg/outlined/radio_button_unchecked.svg?raw";
import completedIcon from "@material-design-icons/svg/outlined/check.svg?raw";

import { RowCompactController } from "../../../controllers/agent/RowCompactController.js";
import tokens from "../../../styles/tokens.css?inline";
import visuallyHidden from "../../../styles/visually-hidden.css?inline";
import rowStyles from "../agent-row.css?inline";
import styles from "./plan.css?inline";

/** @typedef {{content: string, priority?: string, status?: "pending" | "in_progress" | "completed"}} ChxPlanEntry */

/** Null-prototype because `status` is agent-controlled: on a plain literal, `constructor`/`toString`
 *  resolve up the chain to a Function that no `??` catches. `in_progress` has no glyph — it renders
 *  an md-progress-circular, see `#renderEntryIcon`. Icons feed `unsafeSVG`: build-time imports only.
 *  @type {Record<string, {icon?: string, label: string, modifier: string}>} */
const ENTRY_STATUSES = Object.assign(Object.create(null), {
  pending: { icon: pendingIcon, label: "Pending", modifier: "pending" },
  in_progress: { label: "In progress", modifier: "in-progress" },
  completed: { icon: completedIcon, label: "Completed", modifier: "completed" },
});

/**
 * @tag chx-plan
 * @summary Agent plan checklist — a `partElements.plan` renderer the app wires up itself.
 * @fires chx-plan-toggle - `{open}`, on a disclosure change the component didn't make itself.
 */
@customElement("chx-plan")
export class ChxPlan extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    entries: { attribute: false },
    label: { type: String },
    open: { type: Boolean, reflect: true },
    compact: { type: Boolean, reflect: true },
  };

  /** Links the entry list to its visible header label, one per instance. @type {string} */
  #labelId = `chx-plan-label-${crypto.randomUUID()}`;

  /** Latches on the first manual toggle — after that progress never moves `open` again. */
  #userToggled = false;

  constructor() {
    super();

    /** Replaced wholesale on every update — the agent re-sends the whole plan. @type {ChxPlanEntry[]} */
    this.entries = [];

    /** @type {string} */
    this.label = "Plan";

    /** @type {boolean} */
    this.open = true;

    /** Follows the message row's `compact` inside a chat. @type {boolean} */
    this.compact = false;

    new RowCompactController(this);
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [tokens, visuallyHidden, rowStyles, styles];
  }

  /** Open while there's work left, folded into its summary row once every entry is done.
   * @param {import("lit").PropertyValues} changedProperties */
  willUpdate(changedProperties) {
    super.willUpdate(changedProperties);
    if (!changedProperties.has("entries") || this.#userToggled) return;
    const entries = /** @type {ChxPlanEntry[]} */ (this.entries ?? []);
    this.open = entries.length === 0 || entries.some((entry) => entry.status !== "completed");
  }

  /** Latched from the click, not from `toggle`: `toggle` is a queued task, so a plan update
   *  arriving first re-renders `?open` over the change and the latch never engages. */
  #handleSummaryClick = () => {
    this.#userToggled = true;
  };

  /** @param {Event} event */
  #handleToggle = (event) => {
    const open = /** @type {HTMLDetailsElement} */ (event.target).open;
    if (open === this.open) return;
    this.open = open;
    this.dispatchEvent(
      new CustomEvent("chx-plan-toggle", { detail: { open }, bubbles: true, composed: true }),
    );
  };

  /** md-progress-circular self-sets `aria-hidden` and runs its own indeterminate animation, so the
   *  running entry needs neither here — the status rides in `.plan__entry-status`.
   *  @param {{icon?: string, modifier: string}} status @returns {import("lit").TemplateResult} */
  #renderEntryIcon(status) {
    const className = `plan__entry-icon plan__entry-icon_${status.modifier}`;
    if (!status.icon) {
      return html`<md-progress-circular
        class="${className} agent-row__progress"
      ></md-progress-circular>`;
    }
    return html`<md-icon class=${className} aria-hidden="true">${unsafeSVG(status.icon)}</md-icon>`;
  }

  /** @param {ChxPlanEntry} entry @returns {import("lit").TemplateResult} */
  #renderEntry(entry) {
    const status = ENTRY_STATUSES[entry.status ?? "pending"] ?? ENTRY_STATUSES.pending;
    return html`
      <li
        class=${classMap({ plan__entry: true, [`plan__entry_${status.modifier}`]: true })}
        part="entry"
      >
        ${this.#renderEntryIcon(status)}
        <span class="plan__entry-content">${entry.content}</span>
        <!-- Not a live region: announcing plan churn is the app's call. -->
        <span class="plan__entry-status visually-hidden">${status.label}</span>
      </li>
    `;
  }

  render() {
    const entries = /** @type {ChxPlanEntry[]} */ (this.entries ?? []);
    const completed = entries.filter((entry) => entry.status === "completed").length;
    return html`
      <details class="plan" part="container" ?open=${this.open} @toggle=${this.#handleToggle}>
        <summary
          class="plan__summary agent-row__head"
          part="summary"
          @click=${this.#handleSummaryClick}
        >
          <md-icon class="plan__icon agent-row__icon" part="icon" aria-hidden="true"
            >${unsafeSVG(planIcon)}</md-icon
          >
          <span class="plan__label agent-row__label" part="label" id=${this.#labelId}
            >${this.label}</span
          >
          <md-progress-linear
            class="plan__progress-bar"
            part="progress"
            aria-hidden="true"
            .value=${entries.length ? completed / entries.length : 0}
          ></md-progress-linear>
          <span class="plan__progress agent-row__meta" part="meta"
            >${completed}/${entries.length}</span
          >
          <span class="agent-row__spacer"></span>
          <md-icon class="agent-row__chevron" aria-hidden="true">${unsafeSVG(chevronIcon)}</md-icon>
        </summary>
        <!-- role=list survives the list-style:none semantics drop in Safari/VoiceOver. -->
        <ul
          class="plan__entries agent-row__body"
          part="entries"
          role="list"
          aria-labelledby=${this.#labelId}
        >
          ${map(entries, (entry) => this.#renderEntry(entry))}
        </ul>
      </details>
    `;
  }
}
