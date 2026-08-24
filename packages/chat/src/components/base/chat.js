import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { ContextProvider } from "@lit/context";

import "../message-composer/message-composer.js";
import "../message-list/message-list.js";
import { DropTargetController } from "../../controllers/DropTargetController.js";
import { attachmentsContext } from "../../context/attachments-context.js";
import { commandsContext } from "../../context/commands-context.js";

import styles from "./chat.css?inline";

/**
 * @tag chx-chat
 * @summary Chat.
 */
@customElement("chx-chat")
export class ChxChat extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    loading: { type: Boolean, reflect: true, attribute: true },
    label: { type: String, attribute: true },
    commandFields: { attribute: false },
  };

  constructor() {
    super();

    /** @type {String} */
    this.label = "";

    /** @type {Boolean} */
    this.loading = false;

    /** @type {Map<Element, Element>} */
    this.commandFields = new Map();

    /**
     * Registered on chx-chat itself, not chx-message-composer — chx-chat is
     * the common light-DOM ancestor of both chx-message-list and
     * chx-message-composer, so a drag entering anywhere over either (not
     * just the composer) is caught here. `canDrop` gates the whole thing on
     * a <chx-attachments> actually being connected — if there's nowhere to
     * put a dropped file, the rest of the chat isn't a dropzone either. See
     * .claude/plans/attachments.spec.md's "Drop target ownership".
     * @type {DropTargetController}
     */
    this._dropTarget = new DropTargetController(this, {
      canDrop: () => !!this.messageComposerElement?.attachmentsElement,
      onDrop: (files) => this.messageComposerElement?.attachmentsElement?.addFiles(files, "drop"),
    });

    /**
     * Provides the currently attached files to any descendant regardless of
     * shadow nesting depth — kept in sync via `chx-attachments-change`
     * (below), not by chx-chat computing anything itself. Chosen over the
     * manual per-level property-push pattern already used for
     * label/loading/commandFields specifically because chx-textbox (the
     * consumer that needs this, for its `textbox_attached` row-gap) sits
     * two shadow levels down (chx-chat → chx-message-composer's shadow →
     * chx-textbox) — context crosses that in one hop, no relay through
     * chx-message-composer needed. See
     * .claude/plans/attachments.spec.md.
     * @type {ContextProvider<typeof attachmentsContext>}
     */
    this._attachmentsProvider = new ContextProvider(this, {
      context: attachmentsContext,
      initialValue: [],
    });

    /**
     * Same pattern as _attachmentsProvider above, kept in sync via
     * handleChange's own `chx-change` listener (its `commands` detail) instead
     * of a dedicated change event — resolved command chips live inside the
     * ProseMirror doc, not as light-DOM children, so there's no separate
     * slotchange-driven signal to hook the way chx-attachments has one.
     * @type {ContextProvider<typeof commandsContext>}
     */
    this._commandsProvider = new ContextProvider(this, {
      context: commandsContext,
      initialValue: [],
    });
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("chx-send-message", /** @type {EventListener} */ (this.handleSend));
    this.addEventListener("chx-change", /** @type {EventListener} */ (this.handleChange));
    this.addEventListener(
      "chx-attachments-change",
      /** @type {EventListener} */ (this.handleAttachmentsChange),
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("chx-send-message", /** @type {EventListener} */ (this.handleSend));
    this.removeEventListener("chx-change", /** @type {EventListener} */ (this.handleChange));
    this.removeEventListener(
      "chx-attachments-change",
      /** @type {EventListener} */ (this.handleAttachmentsChange),
    );
  }

  /**
   * chx-message-composer is now consumer-authored light DOM (see
   * handleDefaultSlotchange) rather than something chx-chat renders itself,
   * so this is a light-DOM query, not a shadow-root one.
   * @returns {import("../message-composer/message-composer.js").ChxMessageComposer}
   */
  get messageComposerElement() {
    return /** @type {import("../message-composer/message-composer.js").ChxMessageComposer} */ (
      this.querySelector("chx-message-composer")
    );
  }

  /**
   * Same status as messageComposerElement above — consumer-authored,
   * optional light DOM.
   * @returns {import("../message-list/message-list.js").ChxMessageList}
   */
  get messageListElement() {
    return /** @type {import("../message-list/message-list.js").ChxMessageList} */ (
      this.querySelector("chx-message-list")
    );
  }

  /**
   * Resolves the command search identified by `target` (the token handed to
   * the app via command-query's detail) by replacing its tracked range with
   * `node` — see Editor.resolveCommand for the actual insertion logic.
   * A stale `target` is a no-op.
   * @param {string | null} target
   * @param {Node} node
   */
  insertAtCommand(target, node) {
    this.messageComposerElement?.insertAtCommand(target, node);
  }

  /**
   * Programmatically attaches a file — same effect as picking or dropping
   * one. A no-op if no <chx-attachments> is connected anywhere in the
   * composer. See .claude/plans/attachments.spec.md.
   * @param {File} file
   */
  attachFile(file) {
    this.messageComposerElement?.attachFile(file);
  }

  /**
   * Replaces the composer's document with plain text — e.g. pre-filling a
   * draft or a suggested reply.
   * @param {string} text
   */
  setText(text) {
    this.messageComposerElement?.setText(text);
  }

  /** True while an OS file drag carrying files is over the chat (message list included) — driven by `_dropTarget`, pushed down to the composer/textbox for the dashed-border/hint visual. @returns {boolean} */
  get dragging() {
    return this._dropTarget.dragging;
  }

  /** @param {CustomEvent} event */
  handleSend(event) {
    console.log(event.detail);
    this._commandsProvider.setValue([]);
  }

  /** @param {CustomEvent<{commands: Array<{label: string, element: HTMLElement}>}>} event */
  handleChange(event) {
    console.log(event.detail);
    this._commandsProvider.setValue(event.detail.commands ?? []);
  }

  /** @param {CustomEvent<{attachments: File[]}>} event */
  handleAttachmentsChange = (event) => {
    this._attachmentsProvider.setValue(event.detail.attachments);
  };

  /**
   * Sole discovery point for <chx-command-field> — chx-chat is the direct
   * parent of both chx-message-composer and (once it consumes this too)
   * chx-message-list, so a plain property passed to both is enough; no
   * @lit/context needed (see commands.spec.md). Key and value are both the
   * live element — chx-chat stays agnostic of what a "plugin" even is,
   * doesn't read commandCharacter itself, just tracks connected elements.
   * @param {Event} event
   */
  handleCommandFieldSlotchange(event) {
    const slot = /** @type {HTMLSlotElement} */ (event.target);
    this.commandFields = new Map(
      slot.assignedElements({ flatten: true }).map((element) => [element, element]),
    );
  }

  /**
   * chx-message-list/chx-message-composer are consumer-authored light DOM —
   * chx-chat only orchestrates layout (see chat.css's ::slotted() rules) and
   * pushes its own config onto whatever composer/list shows up here, since
   * it can no longer bind properties onto them via its own template.
   */
  handleDefaultSlotchange() {
    this.pushComposerProperties();
    this.pushMessageListProperties();
  }

  pushComposerProperties() {
    const composer = this.messageComposerElement;
    if (!composer) return;
    composer.label = this.label;
    composer.loading = this.loading;
    composer.commandFields = this.commandFields;
    composer.dragging = this.dragging;
  }

  /**
   * The message list only needs the drag-overlay state (see
   * message-list.js's own `dragging`/`dropHint`) — it has no
   * label/loading/commandFields concept of its own.
   */
  pushMessageListProperties() {
    const list = this.messageListElement;
    if (!list) return;
    list.dragging = this.dragging;
  }

  /**
   * Runs on every update, not gated to specific changedProperties keys —
   * `dragging` is controller-driven (DropTargetController calls
   * requestUpdate() directly, not through a declared reactive property), so
   * it never shows up in changedProperties the way label/loading/
   * commandFields do. Cheap enough to just always re-push.
   * @param {import("lit").PropertyValues} changedProperties
   */
  updated(changedProperties) {
    super.updated(changedProperties);
    this.pushComposerProperties();
    this.pushMessageListProperties();
  }

  render() {
    return html`
      <slot @slotchange=${this.handleDefaultSlotchange}></slot>
      <slot name="command-field" @slotchange=${this.handleCommandFieldSlotchange}></slot>
    `;
  }
}
