/**
 * Owns the composer-side mention lifecycle: discovering registered
 * <chx-mention-field> elements from a slot, reacting when one is resolved
 * (its .value is set externally after the app picks a menu option), and
 * finalizing the chip in the textbox.
 *
 * A plain ReactiveController rather than composer's own methods so this
 * logic — and the input-detection state machine it will grow — stays
 * separable from message-composer.js's unrelated concerns (paste, send,
 * caret focus).
 */
export class MentionFieldController {
  /** @param {import("lit").LitElement} host */
  constructor(host) {
    /** @type {import("lit").LitElement} */
    this.host = host;
    host.addController(this);
  }

  hostConnected() {}

  hostDisconnected() {}

  /**
   * `{ flatten: true }` matters here specifically: chx-chat forwards
   * slot="mention-field" into composer via its own nested
   * <slot name="mention-field" slot="mention-field">, so a non-flattened
   * call resolves to that intermediate <slot> element, not the actual
   * <chx-mention-field> — confirmed live (Playwright against the running
   * Storybook story) that this was silently listening on the wrong node.
   * @param {Event} event
   */
  handleConnectMentionField = (event) => {
    const slot = /** @type {HTMLSlotElement} */ (event.target);
    for (const element of slot.assignedElements({ flatten: true })) {
      element.addEventListener("change", this.handleMentionFieldChange);
    }
  };

  /**
   * Fires when a registered <chx-mention-field>'s .value is set externally
   * (app picked a menu option) — finalizes the chip at the current
   * selection.
   *
   * NOT YET COMPLETE: this inserts at wherever the caret currently sits,
   * not at the original "@query" range from when the trigger character was
   * typed — that requires the input-detection state machine (tracking
   * where a mention search started) which isn't implemented yet. Until
   * then this only replaces an empty/collapsed selection, it doesn't
   * delete the raw typed query text before it.
   * @param {Event} event
   */
  handleMentionFieldChange = (event) => {
    const pluginElement = /** @type {HTMLElement & {value?: string}} */ (event.target);

    const root = /** @type {ShadowRoot & {getSelection?: () => Selection | null}} */ (
      this.host.renderRoot
    );
    const selection = root.getSelection ? root.getSelection() : document.getSelection();
    if (!selection?.rangeCount) return;

    this.insertMentionChip(selection.getRangeAt(0), pluginElement, pluginElement.value ?? "");
  };

  /**
   * Replaces the raw "@query" text in `range` with a finalized,
   * non-editable mention chip. No trailing zero-width-space caret anchor —
   * relies on native atomic-node caret behavior (contenteditable="false"
   * already jumps over on arrow keys and deletes whole on Backspace); a
   * zero-width space there would break the one-Backspace-deletes-the-chip
   * requirement, since Backspace would consume it before ever reaching the
   * chip.
   * @param {Range} range
   * @param {Element} pluginElement
   * @param {string} value
   */
  insertMentionChip(range, pluginElement, value) {
    const chip = /** @type {HTMLElement & {value?: string}} */ (
      document.createElement(pluginElement.tagName.toLowerCase())
    );
    chip.value = value;
    // chip.value alone only drives chx-mention-field's *shadow* rendering
    // (md-input-chip inside it) — ContentTextoFormatter walks light DOM
    // only (shadow DOM is correctly invisible to it), so without this the
    // chip contributes nothing at all to the composer's plain-text value.
    chip.textContent = value;
    chip.setAttribute("contenteditable", "false");

    range.deleteContents();
    range.insertNode(chip);

    range.setStartAfter(chip);
    range.collapse(true);

    const root = /** @type {ShadowRoot & {getSelection?: () => Selection | null}} */ (
      this.host.renderRoot
    );
    const selection = root.getSelection ? root.getSelection() : document.getSelection();
    if (!selection) return;

    selection.removeAllRanges();
    selection.addRange(range);
  }
}
