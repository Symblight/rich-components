import { LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import styles from "./command-field.css?inline";

/**
 * @tag chx-command-field
 * @summary Trigger for a command search — declares which character opens
 * it. Renders nothing itself.
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
