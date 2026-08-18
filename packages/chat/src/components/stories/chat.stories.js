import { html } from "lit";

import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import stop from "@material-design-icons/svg/outlined/stop.svg?raw";
import "@symblight/wc-material/icon";
import "@symblight/wc-material/menu";
import "@symblight/wc-material/chips";

import "../../index.js";
import "../command-field/command-field.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Chat",
  component: "chx-chat",
  tags: ["autodocs"],
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */
/** @type {Story} */
export const Basic = {
  render: () => html`
    <chx-chat label="Write your prompt...">
      <md-button slot="actions" variant="text">Opus 4.8</md-button>
      <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      <chx-command-field commandCharacter="@" slot="command-field"></chx-command-field>
    </chx-chat>
  `,
};

/**
 * Wires a <chx-command-field>'s command-query up to a <md-menu> filtering
 * `items`, and the menu's own `select` into chatEl.insertAtCommand — see
 * src/docs/commands.md "Quick start" for the annotated version of this same
 * flow. Relies on two naming conventions the caller must follow:
 * `id="{fieldId}-menu"` on the <md-menu>, and `id="{fieldId}-chip-template"`
 * on the app-owned <template> holding the chip markup.
 *
 * Opens via `menu.openAtPoint(x, y)` (wc-material >=0.2.24) using the
 * caret coordinates command-query now carries — anchors to where the user
 * is actually typing, not the static registered <chx-command-field>.
 * `openAtPoint` sets a floating-ui virtual-element anchor internally
 * (`shift`/`flip` middleware already keep it on-screen, no manual
 * viewport-edge math needed here) and reverts to the normal `for=`
 * anchor once closed.
 *
 * Focus deliberately never leaves the composer — this is the ARIA
 * "combobox with listbox popup" pattern (real focus stays on the input,
 * the popup is driven "virtually"), not focus-transfer navigation.
 * `<md-menu-item>` doesn't have a real `aria-activedescendant`-style API,
 * but it does expose `selected` (`ListboxItemMixin`, reflects to
 * `:host([selected])`) as a visual highlight fully independent of
 * `tabindex`/real focus — command-navigate below drives that directly.
 * @param {string[]} items
 * @returns {{ handleQuery: (event: Event) => void, handleSelect: (event: Event) => void, handleConfirm: (event: Event) => void, handleNavigate: (event: Event) => void }}
 */
function createCommandHandlers(items) {
  // Opaque token from command-query's detail — held here (not on the field
  // itself) and passed back unchanged to insertAtCommand, so a resolution
  // arriving after the search closed is safely ignored.
  let activeTarget = /** @type {string | null} */ (null);
  let highlightedIndex = -1;

  /** @typedef {HTMLElement & { toggle: (options?: {source?: HTMLElement, force?: boolean}) => Promise<void>, openAtPoint: (x: number, y: number) => void, open: boolean, updateComplete: Promise<unknown> }} MenuElement */

  /** @param {MenuElement} menu */
  function getMenuItems(menu) {
    return /** @type {(HTMLElement & { selected: boolean, value: string })[]} */ ([
      ...menu.querySelectorAll("md-menu-item"),
    ]);
  }

  /**
   * Moves the visual highlight without touching real DOM focus — wraps
   * around both ends so ArrowUp/ArrowDown cycle the list.
   * @param {MenuElement} menu
   * @param {number} index
   */
  function setHighlighted(menu, index) {
    const menuItems = getMenuItems(menu);
    for (const item of menuItems) item.selected = false;
    if (menuItems.length === 0) {
      highlightedIndex = -1;
      return;
    }
    highlightedIndex = ((index % menuItems.length) + menuItems.length) % menuItems.length;
    menuItems[highlightedIndex].selected = true;
  }

  /** @param {Event} event */
  function handleQuery(event) {
    const field = /** @type {HTMLElement} */ (event.target);
    const menu = /** @type {MenuElement | null} */ (document.getElementById(`${field.id}-menu`));
    if (!menu) return;

    const { value: query, target, x, y } = /** @type {CustomEvent} */ (event).detail;
    activeTarget = target;

    if (query === null) {
      menu.toggle({ force: false }); // closed: Escape/deleted past the trigger
      highlightedIndex = -1;
      return;
    }

    const matches = items.filter((item) => item.toLowerCase().includes(query.toLowerCase()));
    menu.replaceChildren(
      ...matches.map((item) => {
        const menuItem = document.createElement("md-menu-item");
        menuItem.value = item;
        menuItem.textContent = item;
        return menuItem;
      }),
    );

    if (matches.length === 0) {
      menu.toggle({ force: false });
      highlightedIndex = -1;
      return;
    }

    menu.openAtPoint(x, y);
    // Highlight the first match — no focus move (menu.focusFirstItem()
    // used to be called here, which stole real DOM focus away from the
    // composer and broke typing while the list was open).
    setHighlighted(menu, 0);
  }

  /** @param {Event} event */
  function handleNavigate(event) {
    const field = /** @type {HTMLElement} */ (event.target);
    const menu = /** @type {MenuElement | null} */ (document.getElementById(`${field.id}-menu`));
    if (!menu || !menu.open) return;
    const { direction } = /** @type {CustomEvent} */ (event).detail;
    setHighlighted(menu, highlightedIndex + (direction === "down" ? 1 : -1));
  }

  /**
   * Shared by handleSelect/handleConfirm — resolves `value` as the chip for
   * whichever <md-menu> is currently open.
   * @param {MenuElement & { id: string }} menu
   * @param {string} value
   */
  function resolve(menu, value) {
    const fieldId = menu.id.replace(/-menu$/, "");
    const field = document.getElementById(fieldId);
    const chatEl =
      /** @type {(HTMLElement & { insertAtCommand: (target: string | null, node: Node) => void }) | null} */ (
        field?.closest("chx-chat")
      );
    const template = /** @type {HTMLTemplateElement | null} */ (
      document.getElementById(`${fieldId}-chip-template`)
    );
    if (!chatEl || !template) return;

    const node = template.content.cloneNode(true);
    const chip = /** @type {DocumentFragment} */ (node).querySelector("md-input-chip");
    if (chip) chip.textContent = value;

    chatEl.insertAtCommand(activeTarget, node);
    menu.toggle({ force: false });
    highlightedIndex = -1;
  }

  /** @param {Event} event */
  function handleSelect(event) {
    const menu = /** @type {MenuElement & { id: string }} */ (event.currentTarget);
    resolve(menu, /** @type {CustomEvent} */ (event).detail.value);
  }

  /** @param {Event} event */
  function handleConfirm(event) {
    const field = /** @type {HTMLElement} */ (event.target);
    const menu = /** @type {MenuElement & { id: string }} */ (
      document.getElementById(`${field.id}-menu`)
    );
    const highlighted = /** @type {(HTMLElement & { value: string }) | null} */ (
      menu?.querySelector("md-menu-item[selected]")
    );
    if (highlighted) resolve(menu, highlighted.value);
  }

  return { handleQuery, handleSelect, handleConfirm, handleNavigate };
}

const filesHandlers = createCommandHandlers([
  "index.js",
  "message-composer.js",
  "command-field.js",
  "chat.js",
  "text-formatter.js",
]);

const commandsHandlers = createCommandHandlers(["clear", "summarize", "explain", "translate"]);

/** @type {Story} */
export const WithCommands = {
  render: () => html`
    <chx-chat label="Write your prompt...">
      <md-button slot="actions" variant="text">Opus 4.8</md-button>
      <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      <chx-command-field
        commandCharacter="@"
        id="files"
        slot="command-field"
        @chx-command-query=${filesHandlers.handleQuery}
        @chx-command-confirm=${filesHandlers.handleConfirm}
        @chx-command-navigate=${filesHandlers.handleNavigate}
      ></chx-command-field>
      <chx-command-field
        commandCharacter="/"
        id="commands"
        slot="command-field"
        @chx-command-query=${commandsHandlers.handleQuery}
        @chx-command-confirm=${commandsHandlers.handleConfirm}
        @chx-command-navigate=${commandsHandlers.handleNavigate}
      ></chx-command-field>
    </chx-chat>

    <!--
      Menus live at the app level, siblings of chx-chat, not inside it.
      for="id" is still required — it's what resolves _anchorEl for actual
      position computation (menu.toggle({source}) in handleQuery/
      handleSelect above only sets the native popover *invoker* link for
      correct light-dismiss/stacking behavior, it doesn't replace for= for
      positioning — confirmed live: removing for= entirely made the anchor
      fall back to the document root, which has no getBoundingClientRect).
    -->
    <md-menu id="files-menu" for="files" @select=${filesHandlers.handleSelect}></md-menu>
    <md-menu id="commands-menu" for="commands" @select=${commandsHandlers.handleSelect}></md-menu>

    <!--
      App-owned chip markup — chx-chat never constructs this, it only
      derives serializable attrs (templateId + label) from whatever Node
      insertAtCommand receives (see handleSelect above); the actual chip
      DOM is (re)built by CommandNodeView re-cloning this exact <template>
      every time it renders (first insert, undo/redo, reload), matched via
      data-template-id pointing back at this <template>'s own id. The
      <script> below runs once per clone+insert (real DOM insertion
      executes it, unlike innerHTML) and wires up click itself — that's
      the app's job, not chx-command-field's.
    -->
    <template id="files-chip-template">
      <md-input-chip data-template-id="files-chip-template"></md-input-chip>
      <script>
        const chip = document.currentScript.previousElementSibling;
        chip.addEventListener("click", (event) => console.log(event.target));
      </script>
    </template>
    <template id="commands-chip-template">
      <md-input-chip data-template-id="commands-chip-template"></md-input-chip>
      <script>
        const chip = document.currentScript.previousElementSibling;
        chip.addEventListener("click", (event) => console.log(event.target));
      </script>
    </template>
  `,
};
