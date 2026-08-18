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
 * Builds a `<template>` of `<md-menu-item>`s from a plain string list — see
 * .claude/plans/command-picker.spec.md's Usage section for why a `<template>`
 * (parsed from an HTML string) rather than `document.createElement` per item.
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
      <md-button slot="actions" variant="text">Opus 4.8</md-button>
      <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      <chx-command-picker commandCharacter="@" id="picker-basic" slot="command-field">
        <md-menu-item value="index.js">index.js</md-menu-item>
        <md-menu-item value="chat.js">chat.js</md-menu-item>
        <md-menu-item value="command-field.js">command-field.js</md-menu-item>
      </chx-command-picker>
    </chx-chat>
  `,
};

/** @type {Story} */
export const DynamicSearch = {
  render: () => html`
    <chx-chat label="Write your prompt...">
      <md-button slot="actions" variant="text">Opus 4.8</md-button>
      <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      <chx-command-picker
        commandCharacter="@"
        id="picker-dynamic"
        slot="command-field"
        @chx-command-query=${createQueryHandler(FILES)}
      ></chx-command-picker>
    </chx-chat>
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
      <md-button slot="actions" variant="text">Opus 4.8</md-button>
      <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
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
      <md-button slot="actions" variant="text">Opus 4.8</md-button>
      <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      <chx-command-picker
        commandCharacter="@"
        id="picker-custom-chip"
        slot="command-field"
        @chx-command-query=${createQueryHandler(FILES)}
      >
        <chx-chip slot="chip"><md-icon slot="icon">${unsafeSVG(descriptionIcon)}</md-icon></chx-chip>
      </chx-command-picker>
    </chx-chat>
  `,
};

/** @type {Story} */
export const CustomCommands = {
  render: () => html`
    <chx-chat label="Write your prompt...">
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
    </chx-chat>
  `,
};
