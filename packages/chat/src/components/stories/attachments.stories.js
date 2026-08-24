import { html } from "lit";

import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import stop from "@material-design-icons/svg/outlined/stop.svg?raw";
import attachFileIcon from "@material-design-icons/svg/outlined/add.svg?raw";
import insertDriveFileIcon from "@material-design-icons/svg/outlined/insert_drive_file.svg?raw";
import imageIcon from "@material-design-icons/svg/outlined/image.svg?raw";

import "@symblight/wc-material/icon";
import "@symblight/wc-material/icon-button";

import "../../index.js";
import "../attachments/attachments.js";
import "../attachment/attachment.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Attachments API",
  component: "chx-attachments",
  tags: ["autodocs"],
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/**
 * Page-level CSS for the leading upload trigger — chx-textbox's own
 * ::slotted() rule can only cover the font-size custom property (inherits
 * through the slot into the slotted md-icon-button's own shadow DOM),
 * ::part(button) padding parity has to come from here instead. See
 * .claude/plans/attachments.spec.md's "Button styling parity with the
 * submit button".
 */
const triggerStyles = html`
  <style>
    .attach-trigger::part(button) {
      padding: 0.237rem;
    }
  </style>
`;

/**
 * @param {string} selector
 * @returns {(event: Event) => void}
 */
function createOpenHandler(selector) {
  return (event) => {
    const attachments = /** @type {HTMLElement & { open: () => void }} */ (
      /** @type {HTMLElement} */ (event.currentTarget)
        .closest("chx-message-composer")
        ?.querySelector(selector)
    );
    attachments?.open();
  };
}

/**
 * Zero JS beyond "click the button opens the file picker" — everything else
 * (default cards, drag-and-drop, remove) just works. chx-message-list is
 * included here (not just the composer) to make the drop zone's real extent
 * visible — dropping a file anywhere over the message list works too, not
 * just over the input field, since chx-chat is what registers the drop
 * target once a <chx-attachments> is connected. See attachments.spec.md's
 * "Drop target ownership".
 */
/** @type {Story} */
export const Basic = {
  render: () => html`
    ${triggerStyles}
    <chx-chat label="Write your prompt...">
      <chx-message-list></chx-message-list>
      <chx-message-composer>
        <md-icon-button
          slot="leading"
          class="attach-trigger"
          @click=${createOpenHandler("chx-attachments")}
        >
          <md-icon>${unsafeSVG(attachFileIcon)}</md-icon>
        </md-icon-button>
        <chx-attachments slot="attachments"></chx-attachments>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
};

/**
 * JS-driven — files over MAX_SIZE get a card in `chx-attachment`'s `error`
 * state (`errorLabel`) instead of being silently dropped; accepted files
 * show a loading placeholder (`loading`/`loadingLabel`) while a fake upload
 * is in flight, then reveal the real card content.
 * @param {Event} event
 */
async function handleValidatedAttach(event) {
  const customEvent = /** @type {CustomEvent<{files: File[], source: string}>} */ (event);
  customEvent.preventDefault();

  const attachments = /** @type {HTMLElement & { addAttachments: (c: DocumentFragment) => void }} */ (
    customEvent.target
  );
  const MAX_SIZE = 2 * 1024 * 1024;

  const fragment = document.createDocumentFragment();
  const cards = customEvent.detail.files.map((file) => {
    const card = /** @type {HTMLElement & {file: File, loading: boolean, error: boolean, errorLabel: string}} */ (
      document.createElement("chx-attachment")
    );
    card.file = file;
    if (file.size > MAX_SIZE) {
      card.error = true;
      card.errorLabel = "File is too large";
    } else {
      card.loading = true;
    }
    fragment.append(card);
    return card;
  });
  attachments.addAttachments(fragment);

  for (const card of cards) {
    if (card.error) continue;
    await new Promise((resolve) => setTimeout(resolve, 1200)); // stand-in for a real upload
    card.loading = false;
  }
}

/** @type {Story} */
export const JsDrivenWithLoading = {
  render: () => html`
    ${triggerStyles}
    <chx-chat label="Write your prompt...">
      <chx-message-list></chx-message-list>
      <chx-message-composer>
        <md-icon-button
          slot="leading"
          class="attach-trigger"
          @click=${createOpenHandler("chx-attachments")}
        >
          <md-icon>${unsafeSVG(attachFileIcon)}</md-icon>
        </md-icon-button>
        <chx-attachments slot="attachments" @chx-attach=${handleValidatedAttach}></chx-attachments>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
};

/** @type {Record<string, string>} */
const TYPE_ICONS = {
  "image/png": imageIcon,
  "image/jpeg": imageIcon,
};

/**
 * A richer card content (custom per-type icon, name + type/size on two
 * lines instead of the default's name-only) — still always a
 * <chx-attachment> (only that tag is ever accepted as a card, see
 * attachments.spec.md's "Design direction"), populated through its own
 * `icon` and default slots rather than substituting a foreign element.
 * Reshaping the card's own box (e.g. into a row layout) isn't possible from
 * outside it — the flex container that arranges icon/content/actions lives
 * inside chx-attachment's internal <md-card>, one shadow level past what a
 * consumer's `::part()` can reach in a single hop — customization here is
 * scoped to content, not layout.
 * @param {Event} event
 */
function handleCustomCardAttach(event) {
  const customEvent = /** @type {CustomEvent<{files: File[]}>} */ (event);
  customEvent.preventDefault();

  const attachments = /** @type {HTMLElement & { addAttachments: (c: DocumentFragment) => void }} */ (
    customEvent.target
  );
  const fragment = document.createDocumentFragment();
  for (const file of customEvent.detail.files) {
    const card = /** @type {HTMLElement & {file?: File}} */ (
      document.createElement("chx-attachment")
    );
    card.slot = "attachment";
    card.file = file;

    const icon = document.createElement("md-icon");
    icon.slot = "icon";
    icon.innerHTML = TYPE_ICONS[file.type] ?? insertDriveFileIcon;

    const text = document.createElement("div");
    text.className = "custom-file-card__text";
    text.innerHTML = `
      <span class="custom-file-card__name">${file.name}</span>
      <span class="custom-file-card__meta">${file.type || "file"} · ${Math.round(file.size / 1024)} KB</span>
    `;

    card.append(icon, text);
    fragment.append(card);
  }
  attachments.addAttachments(fragment);
}

/** @type {Story} */
export const CustomCardShape = {
  render: () => html`
    ${triggerStyles}
    <style>
      .custom-file-card__text {
        display: flex;
        flex-direction: column;
        line-height: 1.2;
      }
      .custom-file-card__name {
        overflow: hidden;
        font-size: 0.7rem;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .custom-file-card__meta {
        overflow: hidden;
        font-size: 0.6rem;
        text-overflow: ellipsis;
        white-space: nowrap;
        opacity: 0.7;
      }
    </style>
    <chx-chat label="Write your prompt...">
      <chx-message-list></chx-message-list>
      <chx-message-composer>
        <md-icon-button
          slot="leading"
          class="attach-trigger"
          @click=${createOpenHandler("chx-attachments")}
        >
          <md-icon>${unsafeSVG(attachFileIcon)}</md-icon>
        </md-icon-button>
        <chx-attachments slot="attachments" @chx-attach=${handleCustomCardAttach}></chx-attachments>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
};
