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
import "@symblight/wc-material/icon";
import "@symblight/wc-material/menu";

import "../../index.js";
import "../command-picker/command-picker.js";
import "../chip/chip.js";

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

/**
 * Wires chx-command-picked to build a chip showing only the file's *name*
 * (matching the menu/chip visually), while stashing the full mocked path in
 * a `data-path` attribute on the chip's own element — that's the "value for
 * handling, name for display" split: nothing in the library ever reads
 * data-path, it's purely an app convention read back later off
 * `chx-textbox.getCommands()`'s `element` (see chx-change/chx-send-message
 * below).
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
    const type = name.endsWith(".js") ? "js" : name.endsWith(".css") ? "css" : "folder";
    const icon = clone.querySelector('[slot="icon"]');
    if (icon) icon.innerHTML = FILE_TREE_ICONS[type] ?? descriptionIcon;

    clone.dataset.path = path;
    clone.append(name);
    setChip(clone);
  };
}

/**
 * Reads chx-change/chx-send-message's `commands` detail back — each entry's
 * `element` is the live chip DOM node inserted by createFilePickedHandler
 * above, so `.dataset.path` recovers the full mocked path even though the
 * chip and the menu only ever displayed the file's name.
 * @param {Event} event
 */
function logCommands(event) {
  const { commands } =
    /** @type {CustomEvent<{commands: Array<{label: string, element: HTMLElement}>}>} */ (event)
      .detail;
  console.log(
    commands.map((command) => ({ label: command.label, path: command.element.dataset.path })),
  );
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

/** @type {Story} */
export const Basic = {
  render: () => html`
    <chx-chat label="Write your prompt...">
      <chx-message-list></chx-message-list>
      <chx-message-composer>
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
      <chx-command-picker commandCharacter="@" id="picker-basic" slot="command-field">
        <md-menu-item value="index.js">index.js</md-menu-item>
        <md-menu-item value="chat.js">chat.js</md-menu-item>
        <md-menu-item value="command-field.js">command-field.js</md-menu-item>
      </chx-command-picker>
    </chx-chat>
  `,
};

/**
 * File-mention search — the menu shows a name + directory per result (a
 * folder or file icon, headline, muted supporting-text path), same shape as
 * a real "@" file picker. The resolved chip only ever shows the file's
 * name; the full mocked path travels separately as a `data-path` attribute
 * on the chip element, recoverable later via chx-textbox.getCommands()'s
 * `element` — logged here on every chx-change/chx-send-message via
 * logCommands so the label/value split is visible in the console: label
 * stays "chat.js", path is the full mocked "src/components/base/chat.js".
 */
/** @type {Story} */
export const DynamicSearch = {
  render: () => html`
    <chx-chat
      label="Write your prompt..."
      @chx-change=${logCommands}
      @chx-send-message=${logCommands}
    >
      <chx-message-list></chx-message-list>
      <chx-message-composer>
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
      <chx-command-picker
        commandCharacter="@"
        id="picker-dynamic"
        slot="command-field"
        @chx-command-query=${createFileQueryHandler(FILE_TREE)}
        @chx-command-picked=${createFilePickedHandler("picker-dynamic-chip-template")}
      ></chx-command-picker>
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

/** @type {Story} */
export const CustomChipPerOptionIcon = {
  render: () => html`
    <chx-chat label="Write your prompt...">
      <chx-message-list></chx-message-list>
      <chx-message-composer>
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
      <chx-command-picker
        commandCharacter="@"
        id="picker-per-option-icon"
        slot="command-field"
        @chx-command-query=${createQueryHandler(FILES)}
        @chx-command-picked=${createPickedHandler("picker-per-option-icon-icon-template", FILE_ICONS)}
      ></chx-command-picker>
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
    <chx-chat label="Write your prompt...">
      <chx-message-list></chx-message-list>
      <chx-message-composer>
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
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
    </chx-chat>
  `,
};

/** @type {Story} */
export const CustomCommands = {
  render: () => html`
    <chx-chat label="Write your prompt...">
      <chx-message-list></chx-message-list>
      <chx-message-composer>
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
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
    </chx-chat>
  `,
};
