import { LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import styles from "./command-field.css?inline";

/**
 * @tag chx-command-field
 * @summary  Command field.
 *
 * Pure trigger/config, nothing more — declares which character opens a
 * command search and gives chx-chat a stable, laid-out element for
 * `<md-menu for="id">` to anchor to. Renders nothing itself. The resolved
 * chip is an app-owned Node inserted via chx-chat.insertAtCommand, not an
 * instance of this component.
 */
@customElement("chx-command-field")
export class ChxCommandField extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    commandCharacter: { type: String, attribute: true },
  };

  constructor() {
    super();
    /** @type {String} */
    this.commandCharacter = "@";
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }
}
