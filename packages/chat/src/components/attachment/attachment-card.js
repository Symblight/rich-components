/** `file` is a plain JS property (`{attribute: false}` in attachment.js), not a reflected attribute — `cloneNode()` never copies it, hence the casts below. @typedef {HTMLElement & {file?: File}} AttachmentCardElement */

/**
 * Builds a fresh `<chx-attachment>` card from a File. Actions slot is suppressed — a remove
 * button makes no sense on an already-sent, immutable message.
 * @param {File} file
 * @returns {HTMLElement}
 */
export function buildAttachmentCard(file) {
  const card = /** @type {AttachmentCardElement} */ (document.createElement("chx-attachment"));
  card.file = file;
  const actions = document.createElement("span");
  actions.slot = "actions";
  card.append(actions);
  return card;
}

/**
 * Reproduces a sent attachment part's card — chx-message-list's default rendering. Tries
 * attachmentChipElements (chx-chat's part.id -> live element map) first, cloning it and manually
 * reapplying `.file` (cloneNode doesn't copy JS-only properties); then falls back to
 * buildAttachmentCard if `part.attachment` is still a live File; otherwise renders as nothing. Pure
 * (unlike hydrateCommandChip, there's no placeholder DOM node here to mutate/replace).
 * @param {import("../../types/message.js").ChxMessagePart} part
 * @param {{attachmentChipElements?: import("../../types/adapter.js").ChipElementLookup}} [options]
 * @returns {HTMLElement | undefined}
 */
export function hydrateAttachmentPart(part, { attachmentChipElements } = {}) {
  const live = /** @type {AttachmentCardElement | undefined} */ (attachmentChipElements?.get(part.id));
  if (live instanceof HTMLElement) {
    const clone = /** @type {AttachmentCardElement} */ (live.cloneNode(true));
    clone.file = live.file;
    clone.removeAttribute("slot");
    return clone;
  }
  return part.attachment instanceof File ? buildAttachmentCard(part.attachment) : undefined;
}
