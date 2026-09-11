import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import "@symblight/wc-material/menu";
import "../chip/chip.js";

import {
  readChipAttrs,
  buildChipElement,
  findChipElement,
  ensureTemplateId,
} from "../../editor/command-chip.js";

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

  // real private fields must be declared here, in the class body — a bare `this.#foo = ...`
  // inside the constructor alone isn't enough
  /** @type {string | null} */
  #activeTarget = null;
  /** @type {{x: number, y: number} | null} */
  #anchorPoint = null;
  /** @type {number} */
  #highlightedIndex = -1;
  /** @type {HTMLTemplateElement | null} */
  #chipTemplate = null;

  constructor() {
    super();

    /** @type {string} */
    this.commandCharacter = "@";
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
      this.#chipTemplate = slotted;
      return;
    }

    // A plain element, not a <template> — adopt it into one, so
    // ChipNodeView's document.getElementById(templateId) reclone still
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
      this.#chipTemplate = template;
      return;
    }

    const template = /** @type {HTMLTemplateElement} */ (document.createElement("template"));
    template.id = `${this.id}-chip-template`;
    const chip = document.createElement("chx-chip");
    chip.setAttribute("data-template-id", template.id);
    template.content.append(chip);
    this.appendChild(template);
    this.#chipTemplate = template;
  }

  clearOptions() {
    this.menuElement.replaceChildren();
    this.#highlightedIndex = -1;
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
    if (this.#anchorPoint) {
      this.menuElement.openAtPoint(this.#anchorPoint.x, this.#anchorPoint.y);
    }
    this.setHighlighted(0);
  }

  closeMenu() {
    this.menuElement.toggle({ force: false });
    this.#highlightedIndex = -1;
  }

  /** @param {number} index */
  setHighlighted(index) {
    const items = /** @type {MenuItemElement[]} */ ([
      ...this.menuElement.querySelectorAll("md-menu-item"),
    ]);
    for (const item of items) item.selected = false;
    if (items.length === 0) {
      this.#highlightedIndex = -1;
      return;
    }
    this.#highlightedIndex = ((index % items.length) + items.length) % items.length;
    items[this.#highlightedIndex].selected = true;
  }

  /** @param {Event} event */
  handleQuery = (event) => {
    const { target, value, x, y } = /** @type {CustomEvent} */ (event).detail;
    this.#activeTarget = target;
    if (value === null) {
      this.#anchorPoint = null;
      this.closeMenu();
      return;
    }
    this.#anchorPoint = { x, y };
    if (WHITESPACE.test(value)) {
      this.closeMenu();
      return;
    }
    if (this.menuElement.children.length > 0) {
      this.menuElement.openAtPoint(x, y);
      this.setHighlighted(Math.max(this.#highlightedIndex, 0));
    }
  };

  /** @param {Event} event */
  handleNavigate = (event) => {
    if (!this.menuElement.open) return;
    const { direction } = /** @type {CustomEvent} */ (event).detail;
    this.setHighlighted(this.#highlightedIndex + (direction === "down" ? 1 : -1));
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
        detail: { target: this.#activeTarget, value, setChip },
        bubbles: true,
      }),
    );

    const composer =
      /** @type {(HTMLElement & { insertAtRange: (target: string | null, node: Node) => void }) | null | undefined} */ (
        /** @type {any} */ (this.closest("chx-chat"))?.messageComposerElement
      );
    if (!composer) return;

    const node = overrideNode ?? this.buildDefaultChip(optionElement, value);
    this.#stampOwner(node);
    composer.insertAtRange(this.#activeTarget, node);
  }

  /** Tags the node about to be inserted with this picker's own id, for renderChip to find later. @param {Node} node */
  #stampOwner(node) {
    const chip = findChipElement(node);
    if (chip) chip.dataset.chipOwnerId = this.id;
  }

  /**
   * Rebuilds a historical chip — called by chx-chat's renderChip dispatch. Delegates to
   * `buildChip` so live and historical stay in sync.
   * @param {HTMLElement} placeholder
   * @returns {Node | null}
   */
  renderChip(placeholder) {
    const attrs = readChipAttrs(placeholder);
    if (attrs.data.chipOwnerId !== this.id) return null;
    return ensureTemplateId(this.buildChip(attrs, "message"), attrs.templateId);
  }

  /**
   * Draws a chip — the single place both live resolution and historical hydration draw from.
   * Override to customize the look everywhere at once. `source` is `"composer"` (live pick) or
   * `"message"` (historical) in case the two need to differ.
   * @param {{templateId: string, label: string, icon: string | null, data: Record<string, string>}} attrs
   * @param {"composer" | "message"} _source
   * @returns {HTMLElement}
   */
  buildChip(attrs, _source) {
    return buildChipElement(attrs);
  }

  /**
   * @param {MenuItemElement} optionElement
   * @param {string} value
   * @returns {HTMLElement}
   */
  buildDefaultChip(optionElement, value) {
    const attrs = {
      templateId: /** @type {HTMLTemplateElement} */ (this.#chipTemplate).id,
      label: optionElement.textContent?.trim() || value,
      icon: null,
      data: {},
    };
    return ensureTemplateId(this.buildChip(attrs, "composer"), attrs.templateId);
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
