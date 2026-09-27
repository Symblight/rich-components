import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { classMap } from "lit/directives/class-map.js";
import { ContextConsumer } from "@lit/context";

import "@symblight/wc-material/avatar";
import "@symblight/wc-material/progress-circular";
import "../unread-marker/unread-marker.js";
import { messageRowContext } from "../../context/message-row-context.js";
import styles from "./message.css?inline";

/** @import { ChxRowState } from "../../types/message.js" */
/** @import { ChxUser } from "../../types/conversation.js" */

const ROW_TAG = "chx-message-row";

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

/**
 * @tag chx-message
 * @summary Message.
 */
@customElement("chx-message")
export class ChxMessage extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    own: { type: Boolean, reflect: true },
    // aria-busy is a real ARIA state, expected as the literal string "true"/"false" — Lit's
    // default Boolean converter reflects by presence/empty-string instead, which assistive tech
    // doesn't reliably read as a boolean state, so this uses an explicit converter
    busy: {
      type: Boolean,
      reflect: true,
      attribute: "aria-busy",
      converter: {
        toAttribute: (/** @type {boolean} */ value) => (value ? "true" : "false"),
        fromAttribute: (/** @type {string | null} */ value) => value === "true",
      },
    },
    // whether this message is currently "drilled into" (its interior controls are tabbable) —
    // set by chx-message-list's roving-focus handling, a plain presence-based flag, not a real
    // ARIA state
    actionable: { type: Boolean, reflect: true, attribute: "data-actionable" },
    // gates the unread-marker slot, whose native fallback is a plain <chx-unread-marker> — the
    // opt-in-but-with-a-default shape the initial-loading/loading-history slots use, not
    // typing/streaming's "no slot, no render"
    unread: { type: Boolean, reflect: true },
    compact: { type: Boolean, reflect: true },
    // delivery in flight (message.status === "sending") — gates the status slot, not aria-busy (that's streaming)
    loading: { type: Boolean, reflect: true },
    // highlighted row (jump-to / permalink), mirrored to aria-current
    selected: { type: Boolean, reflect: true },
    // drives the avatar/meta slots' fallback content
    author: { attribute: false },
    // shown next to the author in the meta slot's fallback
    createdAt: { type: Number, attribute: false },
    // position in a run of same-author messages — default true, so a standalone message shows its
    // author; mirrored as joined-previous/joined-next (absent by default) for the run's CSS
    groupStart: { type: Boolean, attribute: false },
    groupEnd: { type: Boolean, attribute: false },
  };

  /** Row state, only when a direct child of a row — a quote nested in the content must not inherit it.
   *  @type {ContextConsumer<typeof messageRowContext, ChxMessage> | undefined} */
  #rowConsumer;
  // an empty actions slot must not show the compact variant's bordered panel — :has(::slotted()) never matches here
  #hasActions = false;

  /** @param {Event} event */
  #handleActionsSlotchange = (event) => {
    const hasActions = /** @type {HTMLSlotElement} */ (event.target).assignedElements().length > 0;
    if (hasActions === this.#hasActions) return;
    this.#hasActions = hasActions;
    this.requestUpdate();
  };

  constructor() {
    super();

    /** @type {boolean} */
    this.own = false;

    /** @type {boolean} */
    this.busy = false;

    /** @type {boolean} */
    this.actionable = false;

    /** @type {boolean} */
    this.unread = false;

    /** @type {boolean} */
    this.compact = false;

    /** @type {boolean} */
    this.loading = false;

    /** @type {boolean} */
    this.selected = false;

    /** @type {ChxUser | undefined} */
    this.author = undefined;

    /** @type {number | undefined} */
    this.createdAt = undefined;

    /** @type {boolean} */
    this.groupStart = true;

    /** @type {boolean} */
    this.groupEnd = true;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  /** The row state this message is showing, if it's inside a row. @returns {ChxRowState | undefined} */
  get row() {
    return this.#rowConsumer?.value;
  }

  connectedCallback() {
    // before super — ContextConsumer requests the context in hostConnected, which super triggers
    if (this.parentElement?.localName === ROW_TAG) {
      this.#rowConsumer ??= new ContextConsumer(this, {
        context: messageRowContext,
        subscribe: true,
        callback: (row) => this.#applyRow(row),
      });
    } else if (this.#rowConsumer) {
      this.removeController(this.#rowConsumer);
      this.#rowConsumer = undefined;
    }
    super.connectedCallback();
    // inside a row the row is the article (and the roving focus target) — a nested article would
    // shadow it in FocusBehaviorController's closest("[role='article']"); a clone may carry the
    // pattern's copy of the attribute, so it's removed, not just left unset
    if (this.#rowConsumer) this.removeAttribute("role");
    else this.setAttribute("role", "article");
  }

  /** Inside a row the context drives state; standalone, properties do. @param {ChxRowState | undefined} row */
  #applyRow(row) {
    if (!row) return;
    this.own = row.own;
    this.busy = row.streaming;
    this.unread = row.unread;
    this.compact = row.compact;
    this.loading = row.sending;
    this.selected = row.selected;
    this.actionable = row.actionable;
    this.author = row.author;
    this.createdAt = row.message.createdAt;
    this.groupStart = row.groupStart;
    this.groupEnd = row.groupEnd;
  }

  /** @param {import("lit").PropertyValues} changedProperties */
  willUpdate(changedProperties) {
    this.toggleAttribute("joined-previous", !this.groupStart);
    this.toggleAttribute("joined-next", !this.groupEnd);
    if (changedProperties.has("selected") && !this.#rowConsumer) {
      if (this.selected) this.setAttribute("aria-current", "true");
      else this.removeAttribute("aria-current");
    }
  }

  render() {
    const avatarUrl = this.author?.avatarUrl;
    const displayName = this.author?.displayName;
    return html`
      ${when(
        this.unread,
        () => html`
          <div class="message__unread-marker" part="unread-marker">
            <slot name="unread-marker"><chx-unread-marker></chx-unread-marker></slot>
          </div>
        `,
      )}
      <div class="message__avatar" part="avatar">
        <slot name="avatar">
          ${avatarUrl
            ? html`<md-avatar
                class="message__avatar-image"
                src=${avatarUrl}
                aria-hidden="true"
              ></md-avatar>`
            : nothing}
        </slot>
      </div>
      <div class="message__body" part="body">
        <div class="message__meta" part="meta">
          <slot name="meta">
            ${displayName && this.groupStart
              ? html`<span class="message__meta-default">
                  <span class="message__author">${displayName}</span>
                  ${this.createdAt === undefined
                    ? nothing
                    : html`<time
                        class="message__time"
                        datetime=${new Date(this.createdAt).toISOString()}
                        >${timeFormat.format(this.createdAt)}</time
                      >`}
                </span>`
              : nothing}
          </slot>
        </div>
        <div class="message__attachments" part="attachments">
          <slot name="attachments"></slot>
        </div>
        <div class="message__before-content" part="before-content">
          <slot name="before-content"></slot>
        </div>
        <span class="message__content" part="content">
          <slot></slot>
        </span>
        <div class="message__after-content" part="after-content">
          <slot name="after-content"></slot>
        </div>
        ${when(
          this.loading,
          () => html`
            <div class="message__status" part="status">
              <slot name="status">
                <md-progress-circular class="message__status-spinner"></md-progress-circular>
                <span>Sending…</span>
              </slot>
            </div>
          `,
        )}
        <div
          class=${classMap({
            message__actions: true,
            message__actions_empty: !this.#hasActions,
          })}
          part="actions"
        >
          <slot name="actions" @slotchange=${this.#handleActionsSlotchange}></slot>
        </div>
      </div>
    `;
  }
}
