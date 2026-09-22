import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import "@symblight/wc-material/menu";
import "../chip/chip.js";

import {
  buildChipElement,
  ensureTemplateId,
  setupChipTemplate,
  stampChipOwner,
} from "../../editor/command-chip.js";

import styles from "./command-picker.css?inline";

/** @typedef {HTMLElement & { open: boolean, toggle: (options?: {force?: boolean}) => Promise<void>, openAtPoint: (x: number, y: number) => void }} MenuElement */
/** @typedef {HTMLElement & { value: string, selected: boolean }} MenuItemElement */

/**
 * @tag chx-command-picker
 * @summary Command picker.
 */
@customElement("chx-command-picker")
export class ChxCommandPicker extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    commandCharacter: { type: String, attribute: true },
    maxQuerySpaces: { type: Number, attribute: true },
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

    /**
     * Whitespace characters the query may contain before the search ends — read by the command
     * plugin, not by this component. `0` is the ordinary mention: a space closes the search. Raise
     * it for values that legitimately contain spaces, e.g. a file path under `My Documents`.
     * @type {number}
     */
    this.maxQuerySpaces = 0;
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
    this.#chipTemplate = setupChipTemplate(this);

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
    // a closed menu must not keep a selected item — chx-command-confirm reads the selection back,
    // and canConfirm() answers for a session that may still be open behind the closed menu
    for (const item of /** @type {MenuItemElement[]} */ ([
      ...this.menuElement.querySelectorAll("md-menu-item"),
    ])) {
      item.selected = false;
    }
    this.menuElement.toggle({ force: false });
    this.#highlightedIndex = -1;
  }

  /**
   * Whether Enter should resolve an option rather than send the message — asked by the command
   * plugin before it swallows the key, so a still-open search with no visible menu doesn't block
   * sending.
   * @returns {boolean}
   */
  canConfirm() {
    return Boolean(
      this.menuElement?.open && this.menuElement.querySelector("md-menu-item[selected]"),
    );
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
    // no whitespace check here any more — when a search should end, the command plugin deactivates
    // and sends `value: null` above, so termination lives in exactly one place (see maxQuerySpaces)
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
    stampChipOwner(node, this.id);
    composer.insertAtRange(this.#activeTarget, node);
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
