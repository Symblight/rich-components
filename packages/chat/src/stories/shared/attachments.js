import { ref } from "lit/directives/ref.js";

/**
 * `partElements.attachment` for sent messages — an `attachment` part has no text/html, so without a
 * renderer it shows nothing (see docs/attachments.md). The empty `actions` slot drops the remove
 * button: a sent card is immutable.
 * @param {(file: File) => HTMLElement} buildCard
 * @returns {Record<string, import("../../types/adapter.js").ChxPartRenderer>}
 */
export function sentAttachmentParts(buildCard) {
  return {
    attachment: (part, previous) => {
      const file = /** @type {File} */ (part.attachment);
      if (previous && /** @type {HTMLElement & {file?: File}} */ (previous).file === file)
        return previous;
      const card = buildCard(file);
      card.append(Object.assign(document.createElement("span"), { slot: "actions" }));
      return card;
    },
  };
}

/** Sent cards drawn by the story's own `<chx-attachments>.buildAttachment` — the same draw point live attach uses. */
export function createBuiltInSentCards() {
  /** @type {import("../../components/attachments/attachments.js").ChxAttachments | undefined} */
  let attachmentsEl;
  return {
    open: () => attachmentsEl?.open(),
    attachmentsRef: ref((el) => {
      attachmentsEl = /** @type {any} */ (el);
    }),
    partElements: sentAttachmentParts(
      (file) =>
        /** @type {HTMLElement} */ (
          /** @type {import("../../components/attachments/attachments.js").ChxAttachments} */ (
            attachmentsEl
          ).buildAttachment(file, "message")
        ),
    ),
  };
}
