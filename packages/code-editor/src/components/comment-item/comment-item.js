import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";

import "@symblight/wc-material/avatar";

import "../comment-field/comment-field.js";
import { icon } from "../../core/icons.js";
import { relativeTime } from "../../features/comments/shared.js";
import buttons from "../../styles/comment-buttons.css?inline";
import tokens from "../../styles/tokens.css?inline";
import styles from "./comment-item.css?inline";

/**
 * @typedef {import("../../features/comments/shared.js").CdxComment} CdxComment
 * @typedef {import("../../features/comments/comments.js").CdxCommentsConfig} CdxCommentsConfig
 * @typedef {{ sending: boolean, error: string, rev: number, text: string }} CdxItemEdit
 */

/** @param {string} name */
const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

/**
 * @tag cdx-comment-item
 * @summary One comment: avatar, byline, body, Edit / Delete, in-place edit.
 */
@customElement("cdx-comment-item")
export class CdxCommentItem extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    comment: { attribute: false },
    config: { attribute: false },
    canEdit: { type: Boolean, attribute: "can-edit" },
    canDelete: { type: Boolean, attribute: "can-delete" },
    edit: { attribute: false },
    deleting: { type: Boolean, reflect: true },
  };

  static styles = [tokens, buttons, styles];

  constructor() {
    super();

    /** @type {CdxComment | undefined} */
    this.comment = undefined;

    /** @type {CdxCommentsConfig | undefined} */
    this.config = undefined;

    /** @type {boolean} */
    this.canEdit = false;

    /** @type {boolean} */
    this.canDelete = false;

    /** @type {CdxItemEdit | null} Set while this comment is being edited in place. */
    this.edit = null;

    /** @type {boolean} A delete the host hasn't answered yet. */
    this.deleting = false;
  }

  /** @param {string} action @param {object} [detail] */
  #emit(action, detail = {}) {
    this.dispatchEvent(
      new CustomEvent("cdx-comment-ui", {
        detail: { action, commentId: this.comment?.id, ...detail },
        bubbles: true,
        composed: true,
      }),
    );
  }

  #renderAvatar() {
    const { comment, config } = this;
    if (!comment || !config) return nothing;
    const url = config.getAvatarUrl?.(comment) ?? comment.author.avatarUrl;
    return html`
      <span class="item__avatar" part="avatar">
        ${url ? html`<md-avatar class="item__image" src=${url}></md-avatar>` : initials(comment.author.name)}
      </span>
    `;
  }

  #renderActions() {
    const { config, comment } = this;
    if (!config || !comment || this.edit || this.deleting || (!this.canEdit && !this.canDelete)) {
      return nothing;
    }
    return html`
      <span class="item__actions" part="actions">
        ${
          this.canEdit
            ? html`<button
                class="cbtn cbtn_icon"
                type="button"
                part="edit"
                title=${config.labels.edit}
                aria-label=${config.labels.edit}
                @click=${() => this.#emit("item-edit")}
              >
                ${icon("edit")}
              </button>`
            : nothing
        }
        ${
          this.canDelete
            ? html`<button
                class="cbtn cbtn_icon"
                type="button"
                part="delete"
                title=${config.labels.delete}
                aria-label=${config.labels.delete}
                @click=${() => this.#emit("item-delete")}
              >
                ${icon("delete")}
              </button>`
            : nothing
        }
      </span>
    `;
  }

  #renderBody() {
    const { comment, config, edit } = this;
    if (!comment || !config) return nothing;
    if (edit) {
      return html`
        <cdx-comment-field
          class="item__edit"
          kind="edit"
          .labels=${config.labels}
          .maxLength=${config.maxLength}
          .text=${edit.text}
          .rev=${edit.rev}
          .sending=${edit.sending}
          .error=${edit.error}
        ></cdx-comment-field>
      `;
    }
    return html`<p class="item__body" part="body">${comment.body}</p>`;
  }

  render() {
    const { comment, config } = this;
    if (!comment || !config) return nothing;
    const name = config.getAuthor?.(comment) ?? comment.author.name;
    const time = relativeTime(comment.createdAt);
    return html`
      <article class="item" part="item" aria-busy=${String(this.deleting)}>
        ${this.#renderAvatar()}
        <div class="item__main">
          <div class="item__head">
            <span class="item__author" part="author">${name}</span>
            <span class="item__time" part="time"
              >${time}${comment.editedAt ? " · edited" : ""}</span
            >
            ${this.#renderActions()}
          </div>
          ${this.#renderBody()}
        </div>
      </article>
    `;
  }
}
