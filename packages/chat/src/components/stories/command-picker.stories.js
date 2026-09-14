import { html } from "lit";

import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import stop from "@material-design-icons/svg/outlined/stop.svg?raw";
import homeIcon from "@material-design-icons/svg/outlined/home.svg?raw";
import editNoteIcon from "@material-design-icons/svg/outlined/edit_note.svg?raw";
import terminalIcon from "@material-design-icons/svg/outlined/terminal.svg?raw";
import forumIcon from "@material-design-icons/svg/outlined/forum.svg?raw";
import formatColorTextIcon from "@material-design-icons/svg/outlined/format_color_text.svg?raw";
import listIcon from "@material-design-icons/svg/outlined/list.svg?raw";
import tollIcon from "@material-design-icons/svg/outlined/toll.svg?raw";
import descriptionIcon from "@material-design-icons/svg/outlined/description.svg?raw";
import folderIcon from "@material-design-icons/svg/outlined/folder.svg?raw";
import javascriptIcon from "@material-design-icons/svg/outlined/javascript.svg?raw";
import cssIcon from "@material-design-icons/svg/outlined/css.svg?raw";
import "@symblight/wc-material/button";
import "@symblight/wc-material/icon";
import "@symblight/wc-material/menu";

import "../command-picker/command-picker.js";
import "../chip/chip.js";

import { buildChipElement } from "../../editor/command-chip.js";
import { chipPartRule, createSplitOnSendHandler } from "../../utils/split-message-parts.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Command API",
  component: "chx-command-picker",
  tags: ["autodocs"],
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

const FILES = [
  "index.js",
  "message-composer.js",
  "command-field.js",
  "chat.js",
  "text-formatter.js",
  "command-picker.js",
  "chip.js",
];

const COMMANDS = ["clear", "summarize", "explain", "translate"];

const FILE_ICONS = {
  "index.js": homeIcon,
  "message-composer.js": editNoteIcon,
  "command-field.js": terminalIcon,
  "chat.js": forumIcon,
  "text-formatter.js": formatColorTextIcon,
  "command-picker.js": listIcon,
  "chip.js": tollIcon,
};

/**
 * Mocked project tree for the file-search story below — matches the shape
 * a real "@" file mention would search over (folders and files, each with
 * its own directory), not just a flat name list like FILES above.
 */
const FILE_TREE = [
  { type: "folder", name: "message-list", dir: "src/components" },
  { type: "folder", name: "message-composer", dir: "src/components" },
  { type: "folder", name: "textbox", dir: "src/components" },
  { type: "js", name: "message-composer.js", dir: "src/components/message-composer" },
  { type: "css", name: "message-composer.css", dir: "src/components/message-composer" },
  { type: "js", name: "message-list.js", dir: "src/components/message-list" },
  { type: "css", name: "message-list.css", dir: "src/components/message-list" },
  { type: "js", name: "textbox.js", dir: "src/components/textbox" },
  { type: "css", name: "textbox.css", dir: "src/components/textbox" },
  { type: "js", name: "chat.js", dir: "src/components/base" },
];

/** @type {Record<string, string>} */
const FILE_TREE_ICONS = { folder: folderIcon, js: javascriptIcon, css: cssIcon };

/**
 * Builds a `<template>` of two-line `<md-menu-item>`s — name as the
 * headline (default slot), directory as the muted `supporting-text` slot,
 * a type icon in `leading` — matching a real "@" file-mention menu. `value`
 * is set to the full path; chx-command-picker.resolve() reads that back as
 * the picked item's `value`, separate from whatever text the chip ends up
 * showing (see createFilePickedHandler below).
 * @param {typeof FILE_TREE} matches
 * @returns {HTMLTemplateElement}
 */
function buildFileMenuItems(matches) {
  const template = document.createElement("template");
  template.innerHTML = matches
    .map(
      (entry) => `
        <md-menu-item value="${entry.dir}/${entry.name}">
          <md-icon slot="leading">${FILE_TREE_ICONS[entry.type] ?? descriptionIcon}</md-icon>
          ${entry.name}
          <span slot="supporting-text">${entry.dir}</span>
        </md-menu-item>
      `,
    )
    .join("");
  return template;
}

/**
 * Same integration point as createQueryHandler, filtering FILE_TREE by
 * name instead of a flat string.
 * @param {typeof FILE_TREE} tree
 * @returns {(event: Event) => void}
 */
function createFileQueryHandler(tree) {
  return (event) => {
    const picker =
      /** @type {HTMLElement & { clearOptions: () => void, addOptions: (c: Element | DocumentFragment | HTMLTemplateElement) => void }} */ (
        event.target
      );
    const { value: query } = /** @type {CustomEvent} */ (event).detail;
    picker.clearOptions();
    if (query === null) return;

    const matches = tree.filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase()));
    picker.addOptions(buildFileMenuItems(matches));
  };
}

/** @param {string} name @returns {string} */
function fileTypeFromName(name) {
  return name.endsWith(".js") ? "js" : name.endsWith(".css") ? "css" : "folder";
}

/**
 * Wires chx-command-picked to build a chip showing only the file's *name*
 * (matching the menu/chip visually), while stashing the full mocked path in
 * a `data-path` attribute on the chip's own element — that's the "value for
 * handling, name for display" split: nothing in the library ever reads
 * data-path, it's purely an app convention, recoverable later via
 * readChipAttrs on the resolved chip element itself.
 * @param {string} templateId
 * @returns {(event: Event) => void}
 */
function createFilePickedHandler(templateId) {
  return (event) => {
    const { value: path, setChip } = /** @type {CustomEvent} */ (event).detail;
    const template = /** @type {HTMLTemplateElement} */ (document.getElementById(templateId));
    const fragment = /** @type {DocumentFragment} */ (template.content.cloneNode(true));
    const clone = /** @type {HTMLElement} */ (fragment.firstElementChild);

    const name = path.split("/").pop() ?? path;
    const icon = clone.querySelector('[slot="icon"]');
    if (icon) icon.innerHTML = FILE_TREE_ICONS[fileTypeFromName(name)] ?? descriptionIcon;

    clone.dataset.path = path;
    clone.append(name);
    setChip(clone);
  };
}

/**
 * Historical counterpart to `createFilePickedHandler` — same icon-from-name derivation, reading
 * `part.data.path` (the `data-path` attribute `readChipAttrs`/`chipPartRule` already captured)
 * instead of a live `chx-command-picked` event.
 * @param {import("../../types/message.js").ChxMessagePart} part
 * @returns {HTMLElement}
 */
function renderDynamicSearchChip(part) {
  const template = /** @type {HTMLTemplateElement} */ (
    document.getElementById(part.templateId ?? "")
  );
  const fragment = /** @type {DocumentFragment} */ (template.content.cloneNode(true));
  const clone = /** @type {HTMLElement | null} */ (fragment.firstElementChild);
  const icon = clone?.querySelector('[slot="icon"]');
  if (icon) icon.innerHTML = FILE_TREE_ICONS[fileTypeFromName(part.label ?? "")] ?? descriptionIcon;
  if (clone && part.data?.path) clone.dataset.path = /** @type {string} */ (part.data.path);
  clone?.append(part.label ?? "");
  return /** @type {HTMLElement} */ (clone);
}

/**
 * Builds a `<template>` of `<md-menu-item>`s from a plain string list — a `<template>` (parsed from
 * an HTML string) rather than `document.createElement` per item.
 * @param {string[]} matches
 * @returns {HTMLTemplateElement}
 */
function buildMenuItems(matches) {
  const template = document.createElement("template");
  template.innerHTML = matches
    .map((value) => `<md-menu-item value="${value}">${value}</md-menu-item>`)
    .join("");
  return template;
}

/**
 * Wires a <chx-command-picker>'s chx-command-query to a plain substring
 * filter over `items` — the only integration point the picker needs (see
 * "What moves from app code into the component" in the spec). `event.target`
 * is the picker itself.
 * @param {string[]} items
 * @returns {(event: Event) => void}
 */
function createQueryHandler(items) {
  return (event) => {
    const picker =
      /** @type {HTMLElement & { clearOptions: () => void, addOptions: (c: Element | DocumentFragment | HTMLTemplateElement) => void }} */ (
        event.target
      );
    const { value: query } = /** @type {CustomEvent} */ (event).detail;
    picker.clearOptions();
    if (query === null) return;

    const matches = items.filter((item) => item.toLowerCase().includes(query.toLowerCase()));
    picker.addOptions(buildMenuItems(matches));
  };
}

const handleChipMessagesChange = createSplitOnSendHandler([chipPartRule]);

/**
 * Default chip look, no override — `partElements.chip` rebuilds it via the same `buildChipElement`
 * the picker's own live insertion draws from, once `chx-messages-change` has re-split the sent
 * message's flat text part into a real `type: "chip"` part. Reused as-is by every story below that
 * doesn't customize the chip's look (`CustomChip`, `CustomCommands`).
 */
const defaultChipPartElements = { chip: buildChipElement };

/** @type {Story} */
export const Basic = {
  render: () => html`
    <chx-chat .partElements=${defaultChipPartElements} @chx-messages-change=${handleChipMessagesChange}>
      <chx-message-list slot="message-list"></chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
        <chx-command-picker commandCharacter="@" id="picker-basic" slot="command-field">
          <md-menu-item value="index.js">index.js</md-menu-item>
          <md-menu-item value="chat.js">chat.js</md-menu-item>
          <md-menu-item value="command-field.js">command-field.js</md-menu-item>
        </chx-command-picker>
      </chx-message-composer>
    </chx-chat>
  `,
};

/**
 * File-mention search — the menu shows a name + directory per result (a
 * folder or file icon, headline, muted supporting-text path), same shape as
 * a real "@" file picker. The resolved chip only ever shows the file's
 * name; the full mocked path travels separately as a `data-path` attribute
 * on the chip element — label/value split, same idea as CustomChipPerOptionIcon
 * below.
 */
/** @type {Story} */
export const DynamicSearch = {
  render: () => html`
    <chx-chat
      .partElements=${{ chip: renderDynamicSearchChip }}
      @chx-messages-change=${handleChipMessagesChange}
    >
      <chx-message-list slot="message-list"></chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
        <chx-command-picker
          commandCharacter="@"
          id="picker-dynamic"
          slot="command-field"
          @chx-command-query=${createFileQueryHandler(FILE_TREE)}
          @chx-command-picked=${createFilePickedHandler("picker-dynamic-chip-template")}
        ></chx-command-picker>
      </chx-message-composer>
    </chx-chat>
    <template id="picker-dynamic-chip-template">
      <chx-chip data-template-id="picker-dynamic-chip-template">
        <md-icon slot="icon"></md-icon>
      </chx-chip>
    </template>
  `,
};

/**
 * Wires <chx-command-picked> to set a different chip icon per resolved
 * option, via `setChip` — clones a stable, real <template> (never built ad
 * hoc) so the resolved chip stays reproducible later, same as the picker's
 * own default chip does.
 * @param {string} templateId
 * @param {Record<string, string>} iconMap
 * @returns {(event: Event) => void}
 */
function createPickedHandler(templateId, iconMap) {
  return (event) => {
    const { value, setChip } = /** @type {CustomEvent} */ (event).detail;
    const template = /** @type {HTMLTemplateElement} */ (document.getElementById(templateId));
    const fragment = /** @type {DocumentFragment} */ (template.content.cloneNode(true));
    const clone = /** @type {HTMLElement} */ (fragment.firstElementChild);
    const icon = clone.querySelector('[slot="icon"]');
    if (icon) icon.innerHTML = iconMap[value] ?? descriptionIcon;
    clone.append(value);
    setChip(clone);
  };
}

/**
 * Historical counterpart to `createPickedHandler` — `part.label` is exactly the `value` the live
 * handler used as its `iconMap` key (it's what got `clone.append`ed as the chip's only text), so no
 * extra `data-*` stash is needed to look the right icon back up.
 * @param {Record<string, string>} iconMap
 * @returns {(part: import("../../types/message.js").ChxMessagePart) => HTMLElement}
 */
function createHistoricalPickedRenderer(iconMap) {
  return (part) => {
    const template = /** @type {HTMLTemplateElement} */ (
      document.getElementById(part.templateId ?? "")
    );
    const fragment = /** @type {DocumentFragment} */ (template.content.cloneNode(true));
    const clone = /** @type {HTMLElement} */ (fragment.firstElementChild);
    const icon = clone.querySelector('[slot="icon"]');
    if (icon) icon.innerHTML = iconMap[part.label ?? ""] ?? descriptionIcon;
    clone.append(part.label ?? "");
    return clone;
  };
}

/** @type {Story} */
export const CustomChipPerOptionIcon = {
  render: () => html`
    <chx-chat
      .partElements=${{ chip: createHistoricalPickedRenderer(FILE_ICONS) }}
      @chx-messages-change=${handleChipMessagesChange}
    >
      <chx-message-list slot="message-list"></chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
        <chx-command-picker
          commandCharacter="@"
          id="picker-per-option-icon"
          slot="command-field"
          @chx-command-query=${createQueryHandler(FILES)}
          @chx-command-picked=${createPickedHandler("picker-per-option-icon-icon-template", FILE_ICONS)}
        ></chx-command-picker>
      </chx-message-composer>
    </chx-chat>
    <template id="picker-per-option-icon-icon-template">
      <chx-chip data-template-id="picker-per-option-icon-icon-template">
        <md-icon slot="icon"></md-icon>
      </chx-chip>
    </template>
  `,
};

/** @type {Story} */
export const CustomChip = {
  render: () => html`
    <chx-chat .partElements=${defaultChipPartElements} @chx-messages-change=${handleChipMessagesChange}>
      <chx-message-list slot="message-list"></chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
        <chx-command-picker
          commandCharacter="@"
          id="picker-custom-chip"
          slot="command-field"
          @chx-command-query=${createQueryHandler(FILES)}
        >
          <chx-chip slot="chip"
            ><md-icon slot="icon">${unsafeSVG(descriptionIcon)}</md-icon></chx-chip
          >
        </chx-command-picker>
      </chx-message-composer>
    </chx-chat>
  `,
};

/**
 * Default sent-chip rendering, no override — no `slot="chip"` template either, just the picker's
 * own auto-built `<chx-chip>`. `partElements.chip` rebuilds it via the same `buildChipElement` the
 * picker's own live insertion draws from, once `chx-messages-change` has re-split the sent
 * message's flat text part into a real `type: "chip"` part (see
 * `createSplitOnSendHandler`/`splitMessageParts`).
 */
/** @type {Story} */
export const ChipHydratesInMessageList = {
  render: () => html`
    <chx-chat .partElements=${defaultChipPartElements} @chx-messages-change=${handleChipMessagesChange}>
      <chx-message-list slot="message-list"></chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
        <chx-command-picker
          commandCharacter="@"
          id="picker-hydration"
          slot="command-field"
          @chx-command-query=${createQueryHandler(FILES)}
        ></chx-command-picker>
      </chx-message-composer>
    </chx-chat>
  `,
};

/** @type {Story} */
export const CustomCommands = {
  render: () => html`
    <chx-chat .partElements=${defaultChipPartElements} @chx-messages-change=${handleChipMessagesChange}>
      <chx-message-list slot="message-list"></chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
        <chx-command-picker
          commandCharacter="@"
          id="files"
          slot="command-field"
          @chx-command-query=${createQueryHandler(FILES)}
        ></chx-command-picker>
        <chx-command-picker
          commandCharacter="/"
          id="commands"
          slot="command-field"
          @chx-command-query=${createQueryHandler(COMMANDS)}
        ></chx-command-picker>
      </chx-message-composer>
    </chx-chat>
  `,
};

/**
 * Overrides `<chx-command-picker>`'s `buildChip(attrs)` for a JS-built look, kept in sync between
 * live and historical automatically.
 * @param {{templateId: string, label: string, icon: string | null, data: Record<string, string>}} attrs
 * @returns {HTMLElement}
 */
function buildFilesChip(attrs) {
  const chip = /** @type {import("../chip/chip.js").ChxChip} */ (document.createElement("chx-chip"));
  chip.style.setProperty("--chx-chip-container-color", "var(--md-sys-color-primary-container)");
  chip.style.setProperty("--chx-chip-label-color", "var(--md-sys-color-on-primary-container)");
  chip.style.setProperty("--chx-chip-icon-color", "var(--md-sys-color-on-primary-container)");
  const icon = document.createElement("md-icon");
  icon.slot = "icon";
  icon.innerHTML = descriptionIcon;
  if (attrs.data.path) chip.title = attrs.data.path;
  chip.append(icon, attrs.label);
  return chip;
}

/** Same idea as buildFilesChip, distinct icon/color. @param {{templateId: string, label: string, icon: string | null, data: Record<string, string>}} attrs @returns {HTMLElement} */
function buildCommandsChip(attrs) {
  const chip = /** @type {import("../chip/chip.js").ChxChip} */ (document.createElement("chx-chip"));
  chip.style.setProperty("--chx-chip-container-color", "var(--md-sys-color-tertiary-container)");
  chip.style.setProperty("--chx-chip-label-color", "var(--md-sys-color-on-tertiary-container)");
  chip.style.setProperty("--chx-chip-icon-color", "var(--md-sys-color-on-tertiary-container)");
  const icon = document.createElement("md-icon");
  icon.slot = "icon";
  icon.innerHTML = terminalIcon;
  chip.append(icon, attrs.label);
  return chip;
}

/**
 * Routes a `type: "chip"` part to whichever picker's own chip look owns it, via
 * `part.data.chipOwnerId` — the same id `#stampOwner` tags the live-inserted node with, now purely
 * informational data on the part rather than a dispatch key the library resolves for you.
 * @param {import("../../types/message.js").ChxMessagePart} part
 * @returns {HTMLElement}
 */
function renderMultiPickerChip(part) {
  const build = part.data?.chipOwnerId === "commands" ? buildCommandsChip : buildFilesChip;
  return build(/** @type {any} */ (part));
}

/**
 * Two independently-owned pickers ("@" files, "/" commands), each with its own `.buildChip` look.
 * Seeded with historical messages already split into `text`/`chip` parts (what `splitMessageParts`
 * would produce from a real send) to demonstrate multi-picker routing purely through
 * `partElements.chip` — try typing "@" or "/" too, the live-sent chip matches the seeded ones
 * exactly.
 */
/** @type {Story} */
export const MultiPickerHydration = {
  render: () => html`
    <chx-chat
      .partElements=${{ chip: renderMultiPickerChip }}
      @chx-messages-change=${handleChipMessagesChange}
      .messages=${[
        {
          id: "msg-1",
          authorId: "user-1",
          own: true,
          createdAt: Date.now(),
          status: "sent",
          parts: [
            { id: "msg-1-p1", type: "text", text: "Check " },
            {
              id: "msg-1-p2",
              type: "chip",
              templateId: "files-chip-template",
              label: "chat.js",
              icon: null,
              data: { chipOwnerId: "files", path: "src/components/base/chat.js" },
            },
            { id: "msg-1-p3", type: "text", text: " and " },
            {
              id: "msg-1-p4",
              type: "chip",
              templateId: "commands-chip-template",
              label: "summarize",
              icon: null,
              data: { chipOwnerId: "commands" },
            },
            { id: "msg-1-p5", type: "text", text: " it for me" },
          ],
        },
        {
          id: "msg-2",
          authorId: "assistant",
          own: false,
          createdAt: Date.now(),
          status: "sent",
          parts: [
            { id: "msg-2-p1", type: "text", text: "On it — " },
            {
              id: "msg-2-p2",
              type: "chip",
              templateId: "commands-chip-template",
              label: "explain",
              icon: null,
              data: { chipOwnerId: "commands" },
            },
            { id: "msg-2-p3", type: "text", text: " coming up, referencing " },
            {
              id: "msg-2-p4",
              type: "chip",
              templateId: "files-chip-template",
              label: "message-composer.js",
              icon: null,
              data: { chipOwnerId: "files", path: "src/components/message-composer/message-composer.js" },
            },
            { id: "msg-2-p5", type: "text", text: " too." },
          ],
        },
      ]}
    >
      <chx-message-list slot="message-list"></chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
        <chx-command-picker
          commandCharacter="@"
          id="files"
          slot="command-field"
          @chx-command-query=${createQueryHandler(FILES)}
          .buildChip=${buildFilesChip}
        ></chx-command-picker>
        <chx-command-picker
          commandCharacter="/"
          id="commands"
          slot="command-field"
          @chx-command-query=${createQueryHandler(COMMANDS)}
          .buildChip=${buildCommandsChip}
        ></chx-command-picker>
      </chx-message-composer>
    </chx-chat>
  `,
};
