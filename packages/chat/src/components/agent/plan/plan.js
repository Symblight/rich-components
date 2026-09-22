import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { map } from "lit/directives/map.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import "@symblight/wc-material/icon";
import "@symblight/wc-material/progress-circular";

import pendingIcon from "@material-design-icons/svg/outlined/radio_button_unchecked.svg?raw";
import completedIcon from "@material-design-icons/svg/outlined/task_alt.svg?raw";

import visuallyHidden from "../../../styles/visually-hidden.css?inline";
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
 */
@customElement("chx-plan")
export class ChxPlan extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    entries: { attribute: false },
    label: { type: String },
  };

  /** Links the entry list to its visible header label, one per instance. @type {string} */
  #labelId = `chx-plan-label-${crypto.randomUUID()}`;

  constructor() {
    super();

    /** Replaced wholesale on every update — the agent re-sends the whole plan. @type {ChxPlanEntry[]} */
    this.entries = [];

    /** @type {string} */
    this.label = "Plan";
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [visuallyHidden, styles];
  }

  /** md-progress-circular self-sets `aria-hidden` and runs its own indeterminate animation, so the
   *  running entry needs neither here — the status rides in `.plan__entry-status`.
   *  @param {{icon?: string}} status @returns {import("lit").TemplateResult} */
  #renderEntryIcon(status) {
    if (!status.icon) {
      return html`<md-progress-circular class="plan__entry-progress"></md-progress-circular>`;
    }
    return html`<md-icon class="plan__entry-icon" aria-hidden="true"
      >${unsafeSVG(status.icon)}</md-icon
    >`;
  }

  /** @param {ChxPlanEntry} entry */
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
      <div class="plan" part="container">
        <div class="plan__header" part="header">
          <span class="plan__label" id=${this.#labelId}>${this.label}</span>
          <span class="plan__progress">${completed}/${entries.length}</span>
        </div>
        <!-- role=list survives the list-style:none semantics drop in Safari/VoiceOver. -->
        <ul class="plan__entries" part="entries" role="list" aria-labelledby=${this.#labelId}>
          ${map(entries, (entry) => this.#renderEntry(entry))}
        </ul>
      </div>
    `;
  }
}
