import { LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import styles from "./command-field.css?inline";

/**
 * @tag chx-command-field
 * @summary Trigger for a command search — declares which character opens it. Renders nothing itself.
 */
@customElement("chx-command-field")
export class ChxCommandField extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    commandCharacter: { type: String, attribute: true },
    maxQuerySpaces: { type: Number, attribute: true },
  };

  constructor() {
    super();
    /** @type {string} */
    this.commandCharacter = "@";

    /** Whitespace characters the query may contain before the search ends — see
     * chx-command-picker's own property. @type {number} */
    this.maxQuerySpaces = 0;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }
}
