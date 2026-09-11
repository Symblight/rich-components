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
    const type = name.endsWith(".js") ? "js" : name.endsWith(".css") ? "css" : "folder";
    const icon = clone.querySelector('[slot="icon"]');
    if (icon) icon.innerHTML = FILE_TREE_ICONS[type] ?? descriptionIcon;

    clone.dataset.path = path;
    clone.append(name);
    setChip(clone);
  };
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
 * on the chip element — label/value split, same idea as CustomChipPerOptionIcon
 * below.
 */
/** @type {Story} */
export const DynamicSearch = {
  render: () => html`
    <chx-chat label="Write your prompt...">
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

/** Default sent-chip rendering, no override — chx-command-picker's own renderChip rebuilds it by re-cloning the `<template slot="chip">` below, dispatched to by chx-chat once the chat's already sent. */
/** @type {Story} */
export const ChipHydratesInMessageList = {
  render: () => html`
    <chx-chat label="Write your prompt...">
      <chx-message-list></chx-message-list>
      <chx-message-composer>
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
      <chx-command-picker
        commandCharacter="@"
        id="picker-hydration"
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

/**
 * Overrides `<chx-command-picker>`'s `buildChip(attrs)` — the single draw point shared by live
 * resolution (right as you pick an option) and historical hydration (once a message with that chip
 * has been sent and re-rendered) — rather than a `slot="chip"` template. Overriding `buildChip`
 * instead of `renderChip` directly keeps both paths visually identical for free: `attrs` is
 * already parsed (`{templateId, label, icon, data}`), no manual `readChipAttrs` needed here.
 * `attrs.data.path` is the app-only breadcrumb `createFilePickedHandler`-style handlers stash on a
 * live chip — round-trips through the token the same way.
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

/** Same idea as buildFilesChip, distinct icon/color — the "commands" picker's own buildChip override. @param {{templateId: string, label: string, icon: string | null, data: Record<string, string>}} attrs @returns {HTMLElement} */
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
 * Two independently-owned pickers ("@" files, "/" commands), each customizing its chips by
 * overriding `.buildChip` (see buildFilesChip/buildCommandsChip above) instead of a `slot="chip"`
 * template — different icon and container color per picker, so the two chip "families" stay
 * visually distinct, and *identical* whether you type the trigger live or load a past message
 * containing one (try typing "@" or "/" here — the live-picked chip matches the seeded historical
 * ones exactly, unlike overriding `renderChip` directly, which only ever affects history). `chx-chat`
 * is seeded with a `messages` array whose `html` already contains resolved chip tokens — the exact
 * `<span data-template-id="…" data-command-field-id="…">` markup the `command` schema node's own
 * `toDOM` produces (see schema.js), hand-written here rather than typed live; `data-template-id`'s
 * value is irrelevant to either override (no template lookup happens) but still required for
 * chx-message-list to find the placeholder at all — it only ever looks for `[data-template-id]`.
 * Nothing runs a search or a resolve on load: chx-message-list finds each placeholder, chx-chat's
 * `renderChip` dispatches it by `data-command-field-id` to the one picker that would have minted
 * it, and that picker's default `renderChip` calls its own `buildChip` override to rebuild it.
 * Proves multi-picker routing: neither picker ever touches the other's chips, live or historical.
 */
/** @type {Story} */
export const MultiPickerHydration = {
  render: () => html`
    <chx-chat
      label="Write your prompt..."
      .messages=${[
        {
          id: "msg-1",
          authorId: "user-1",
          own: true,
          createdAt: Date.now(),
          status: "sent",
          parts: [
            {
              id: "msg-1-t1",
              type: "text",
              text: "Check chat.js and /summarize it for me",
              html:
                'Check <span data-template-id="files-chip-template" data-command-field-id="files" data-path="src/components/base/chat.js">chat.js</span>' +
                ' and <span data-template-id="commands-chip-template" data-command-field-id="commands">summarize</span> it for me',
            },
          ],
        },
        {
          id: "msg-2",
          authorId: "assistant",
          own: false,
          createdAt: Date.now(),
          status: "sent",
          parts: [
            {
              id: "msg-2-t1",
              type: "text",
              text: "On it — /explain coming up, referencing message-composer.js too.",
              html:
                'On it — <span data-template-id="commands-chip-template" data-command-field-id="commands">explain</span>' +
                ' coming up, referencing <span data-template-id="files-chip-template" data-command-field-id="files" data-path="src/components/message-composer/message-composer.js">message-composer.js</span> too.',
            },
          ],
        },
      ]}
    >
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
        .buildChip=${buildFilesChip}
      ></chx-command-picker>
      <chx-command-picker
        commandCharacter="/"
        id="commands"
        slot="command-field"
        @chx-command-query=${createQueryHandler(COMMANDS)}
        .buildChip=${buildCommandsChip}
      ></chx-command-picker>
    </chx-chat>
  `,
};
