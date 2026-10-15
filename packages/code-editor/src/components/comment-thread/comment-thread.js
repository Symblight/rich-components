import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import "@symblight/wc-material/shadow";

import "../comment-field/comment-field.js";
import "../comment-item/comment-item.js";
import { icon } from "../../core/icons.js";
import buttons from "../../styles/comment-buttons.css?inline";
import tokens from "../../styles/tokens.css?inline";
import styles from "./comment-thread.css?inline";

/**
 * @typedef {import("../../features/comments/shared.js").CdxThread} CdxThread
 * @typedef {import("../../features/comments/shared.js").CdxCommentTone} CdxCommentTone
 * @typedef {import("../../features/comments/comments.js").CdxCommentsConfig} CdxCommentsConfig
 * @typedef {{
 *   kind: "new" | "reply" | "edit",
 *   commentId?: string,
 *   sending: boolean,
 *   error: string,
 *   rev: number,
 *   text: string,
 * }} CdxDraftView
 * @typedef {{
 *   id: string,
 *   line: number,
 *   thread: CdxThread,
 *   tone: CdxCommentTone,
 *   collapsed: boolean,
 *   draft: CdxDraftView | null,
 *   draftText: () => string,
 *   canResolve: boolean,
 *   canReply: boolean,
 *   pending: import("../../features/comments/shared.js").CdxThreadPending | null,
 *   error: string,
 *   locked: boolean,
 *   permissions: Record<string, { edit: boolean, delete: boolean }>,
 *   config: CdxCommentsConfig,
 * }} CdxThreadModel
 */

const TONE_ICON = { comment: "chat_bubble", resolved: "task_alt" };

/**
 * @tag cdx-comment-thread
 * @summary A line's comment thread: header, comments, reply field.
 */
@customElement("cdx-comment-thread")
export class CdxCommentThread extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    model: { attribute: false },
  };

  static styles = [tokens, buttons, styles];

  constructor() {
    super();

    /** @type {CdxThreadModel | undefined} */
    this.model = undefined;
  }

  /** Focuses the draft's own field — for an edit it's inside the item, not the reply box. */
  async focusField() {
    await this.updateComplete;
    if (this.model?.draft?.kind === "edit") {
      const item = [...this.renderRoot.querySelectorAll("cdx-comment-item")].find((el) => el.edit);
      await item?.updateComplete;
      item?.renderRoot.querySelector("cdx-comment-field")?.focus();
      return;
    }
    this.renderRoot.querySelector("cdx-comment-field")?.focus();
  }

  /** @param {string} action */
  #emit(action) {
    this.dispatchEvent(
      new CustomEvent("cdx-comment-ui", { detail: { action }, bubbles: true, composed: true }),
    );
  }

  /** @param {CdxThreadModel} model */
  #renderBar(model) {
    const { config, thread, collapsed } = model;
    const count = thread.comments.length;
    const first = thread.comments[0];
    const snippet = first?.body.replace(/\s+/g, " ") ?? "";
    const resolved = model.tone === "resolved" && !thread.outdated;
    return html`
      <div class="thread__bar" part="bar">
        <span class="thread__icon">${icon(TONE_ICON[model.tone])}</span>
        ${
          collapsed
            ? html`<span class="thread__summary">
                <b>${resolved ? "Resolved" : (first?.author.name ?? "")}</b>
                · ${count} ${count === 1 ? "comment" : "comments"}
                <span class="thread__snippet">${snippet}</span>
              </span>`
            : html`<span class="thread__summary"><b>Comment on line ${model.line}</b></span>`
        }
        ${thread.outdated ? html`<span class="thread__tag">${config.labels.outdated}</span>` : nothing}
        <span class="thread__grow"></span>
        ${
          model.canResolve && !collapsed && count
            ? html`<button
                class="cbtn"
                type="button"
                part="resolve"
                ?disabled=${!!model.pending}
                aria-busy=${String(model.pending?.action === "resolve")}
                @click=${() => this.#emit("thread-resolve")}
              >
                ${
                  model.pending?.action === "resolve"
                    ? html`<span class="cbtn__spinner" aria-hidden="true"></span
                        >${config.labels.sending}`
                    : thread.resolved
                      ? config.labels.reopen
                      : config.labels.resolve
                }
              </button>`
            : nothing
        }
        ${
          count
            ? html`<button
                class="cbtn cbtn_icon"
                type="button"
                part="toggle"
                aria-expanded=${String(!collapsed)}
                aria-label=${collapsed ? "Expand thread" : "Collapse thread"}
                @click=${() => this.#emit("thread-toggle")}
              >
                ${icon(collapsed ? "down" : "up")}
              </button>`
            : nothing
        }
      </div>
    `;
  }

  /** @param {CdxThreadModel} model */
  #renderBody(model) {
    const { thread, config } = model;
    // the typed text, not the text at open: a widget scrolled back into view is a new element
    const draft = model.draft && { ...model.draft, text: model.draftText() };
    const newDraft = draft?.kind === "new" ? draft : null;
    const replyDraft = draft?.kind === "reply" ? draft : null;
    return html`
      ${
        thread.comments.length
          ? html`<div class="thread__list" part="list">
              ${thread.comments.map((comment) => {
                const own = model.permissions[comment.id];
                return html`<cdx-comment-item
                  .comment=${comment}
                  .config=${config}
                  ?can-edit=${(own?.edit ?? false) && !model.locked}
                  ?can-delete=${own?.delete ?? false}
                  ?deleting=${model.pending?.action === "delete" && model.pending.commentIds.includes(comment.id)}
                  .edit=${draft?.kind === "edit" && draft.commentId === comment.id ? draft : null}
                ></cdx-comment-item>`;
              })}
            </div>`
          : nothing
      }
      ${
        newDraft
          ? html`<cdx-comment-field
              kind="new"
              .labels=${config.labels}
              .maxLength=${config.maxLength}
              .text=${newDraft.text}
              .rev=${newDraft.rev}
              .sending=${newDraft.sending}
              .error=${newDraft.error}
            ></cdx-comment-field>`
          : model.canReply
            ? html`<cdx-comment-field
                kind="reply"
                ?idle=${!replyDraft}
                ?locked=${model.locked}
                .labels=${config.labels}
                .maxLength=${config.maxLength}
                .text=${replyDraft?.text ?? ""}
                .rev=${replyDraft?.rev ?? 0}
                .sending=${replyDraft?.sending ?? false}
                .error=${replyDraft?.error ?? ""}
              ></cdx-comment-field>`
            : nothing
      }
    `;
  }

  render() {
    const model = this.model;
    if (!model) return nothing;
    return html`
      <section
        class="thread thread_tone-${model.tone} ${model.collapsed ? "thread_collapsed" : ""}"
        part="thread ${model.tone}"
        role="group"
        aria-label="Comment thread on line ${model.line}"
      >
        <md-shadow></md-shadow>
        <div class="thread__in">
          ${this.#renderBar(model)}
          ${
            model.error
              ? html`<div class="thread__error" part="error" role="alert">
                  ${icon("error")}${model.error}
                </div>`
              : nothing
          }
          ${model.collapsed ? nothing : html`<div class="thread__content">${this.#renderBody(model)}</div>`}
        </div>
      </section>
    `;
  }
}
