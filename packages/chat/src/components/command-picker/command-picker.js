import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import "@symblight/wc-material/menu";
import "../chip/chip.js";

import styles from "./command-picker.css?inline";

/** @typedef {HTMLElement & { open: boolean, toggle: (options?: {force?: boolean}) => Promise<void>, openAtPoint: (x: number, y: number) => void }} MenuElement */
/** @typedef {HTMLElement & { value: string, selected: boolean }} MenuItemElement */

const WHITESPACE = /\s/; // matches U+00A0 too, not just a plain " "

/**
 * @tag chx-command-picker
 * @summary Command picker.
 */
@customElement("chx-command-picker")
export class ChxCommandPicker extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    commandCharacter: { type: String, attribute: true },
  };

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  constructor() {
    super();

    /** @type {string} */
    this.commandCharacter = "@";

    /** @type {string | null} */
    this._activeTarget = null;

    /** @type {{x: number, y: number} | null} */
    this._anchorPoint = null;

    /** @type {number} */
    this._highlightedIndex = -1;

    /** @type {HTMLTemplateElement | null} */
    this._chipTemplate = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("chx-command-query", /** @type {EventListener} */ (this.handleQuery));
    this.addEventListener(
      "chx-command-navigate",
      /** @type {EventListener} */ (this.handleNavigate),
    );
    this.addEventListener("chx-command-confirm", this.handleConfirm);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("chx-command-query", /** @type {EventListener} */ (this.handleQuery));
    this.removeEventListener(
      "chx-command-navigate",
      /** @type {EventListener} */ (this.handleNavigate),
    );
    this.removeEventListener("chx-command-confirm", this.handleConfirm);
  }

  firstUpdated() {
    this.setupChipTemplate();

    const initial = [...this.children].filter(
      (element) => !(element instanceof HTMLTemplateElement),
    );
    if (initial.length > 0) {
      const fragment = document.createDocumentFragment();
      fragment.append(...initial);
      this.addOptions(fragment);
    }
  }

  /** @returns {MenuElement} */
  get menuElement() {
    return /** @type {MenuElement} */ (this.renderRoot?.querySelector(".command-picker__menu"));
  }

  setupChipTemplate() {
    const slotted = /** @type {HTMLElement | null} */ (this.querySelector('[slot="chip"]'));

    if (slotted instanceof HTMLTemplateElement) {
      if (!slotted.id) slotted.id = `${this.id}-chip-template`;
      const root = /** @type {HTMLElement | null} */ (slotted.content.firstElementChild);
      if (root && !root.hasAttribute("data-template-id")) {
        root.setAttribute("data-template-id", slotted.id);
      }
      this._chipTemplate = slotted;
      return;
    }

    // A plain element, not a <template> — adopt it into one, so
    // CommandNodeView's document.getElementById(templateId) reclone still
    // has a real <template> to find. Lets consumers author the chip shell
    // as an ordinary element (Lit bindings and all — a <template> tag
    // can't contain bindings) instead of hand-writing a <template>.
    if (slotted) {
      const template = /** @type {HTMLTemplateElement} */ (document.createElement("template"));
      template.id = `${this.id}-chip-template`;
      if (!slotted.hasAttribute("data-template-id")) {
        slotted.setAttribute("data-template-id", template.id);
      }
      slotted.remove();
      template.content.append(slotted);
      this.appendChild(template);
      this._chipTemplate = template;
      return;
    }

    const template = /** @type {HTMLTemplateElement} */ (document.createElement("template"));
    template.id = `${this.id}-chip-template`;
    const chip = document.createElement("chx-chip");
    chip.setAttribute("data-template-id", template.id);
    template.content.append(chip);
    this.appendChild(template);
    this._chipTemplate = template;
  }

  clearOptions() {
    this.menuElement.replaceChildren();
    this._highlightedIndex = -1;
  }

  /** @param {Element | DocumentFragment | HTMLTemplateElement} container */
  addOptions(container) {
    const items =
      container instanceof HTMLTemplateElement
        ? [.../** @type {DocumentFragment} */ (container.content.cloneNode(true)).children]
        : [...container.children];

    if (items.length === 0) {
      this.closeMenu();
      return;
    }

    this.menuElement.append(...items);
    if (this._anchorPoint) {
      this.menuElement.openAtPoint(this._anchorPoint.x, this._anchorPoint.y);
    }
    this.setHighlighted(0);
  }

  closeMenu() {
    this.menuElement.toggle({ force: false });
    this._highlightedIndex = -1;
  }

  /** @param {number} index */
  setHighlighted(index) {
    const items = /** @type {MenuItemElement[]} */ ([
      ...this.menuElement.querySelectorAll("md-menu-item"),
    ]);
    for (const item of items) item.selected = false;
    if (items.length === 0) {
      this._highlightedIndex = -1;
      return;
    }
    this._highlightedIndex = ((index % items.length) + items.length) % items.length;
    items[this._highlightedIndex].selected = true;
  }

  /** @param {Event} event */
  handleQuery = (event) => {
    const { target, value, x, y } = /** @type {CustomEvent} */ (event).detail;
    this._activeTarget = target;
    if (value === null) {
      this._anchorPoint = null;
      this.closeMenu();
      return;
    }
    this._anchorPoint = { x, y };
    if (WHITESPACE.test(value)) {
      this.closeMenu();
      return;
    }
    if (this.menuElement.children.length > 0) {
      this.menuElement.openAtPoint(x, y);
      this.setHighlighted(Math.max(this._highlightedIndex, 0));
    }
  };

  /** @param {Event} event */
  handleNavigate = (event) => {
    if (!this.menuElement.open) return;
    const { direction } = /** @type {CustomEvent} */ (event).detail;
    this.setHighlighted(this._highlightedIndex + (direction === "down" ? 1 : -1));
  };

  handleConfirm = () => {
    const highlighted = /** @type {MenuItemElement | null} */ (
      this.menuElement.querySelector("md-menu-item[selected]")
    );
    if (highlighted) this.resolve(highlighted);
  };

  /** @param {Event} event */
  handleSelect = (event) => {
    const { item } = /** @type {CustomEvent<{ value: string, item: MenuItemElement }>} */ (event)
      .detail;
    this.resolve(item);
  };

  /** @param {MenuItemElement} optionElement */
  resolve(optionElement) {
    const value = optionElement.value ?? optionElement.textContent?.trim() ?? "";

    /** @type {Node | null} */
    let overrideNode = null;
    /** @param {HTMLElement} element */
    const setChip = (element) => {
      overrideNode = element;
    };

    this.dispatchEvent(
      new CustomEvent("chx-command-picked", {
        detail: { target: this._activeTarget, value, setChip },
        bubbles: true,
      }),
    );

    const chatEl =
      /** @type {(HTMLElement & { insertAtCommand: (target: string | null, node: Node) => void }) | null} */ (
        this.closest("chx-chat")
      );
    if (!chatEl) return;

    const node = overrideNode ?? this.buildDefaultChip(optionElement, value);
    chatEl.insertAtCommand(this._activeTarget, node);
  }

  /**
   * @param {MenuItemElement} optionElement
   * @param {string} value
   * @returns {DocumentFragment}
   */
  buildDefaultChip(optionElement, value) {
    const clone = /** @type {DocumentFragment} */ (
      /** @type {HTMLTemplateElement} */ (this._chipTemplate).content.cloneNode(true)
    );
    const chip = clone.querySelector("[data-template-id]");
    if (chip) chip.append(optionElement.textContent?.trim() || value);
    return clone;
  }

  render() {
    return html`
      <md-menu
        class="command-picker__menu"
        placement="top-start"
        offset="20"
        @select=${this.handleSelect}
      ></md-menu>
    `;
  }
}
