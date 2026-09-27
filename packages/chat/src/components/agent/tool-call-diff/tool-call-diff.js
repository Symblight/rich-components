import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import "../../code-block/code-block.js";

import styles from "./tool-call-diff.css?inline";

/**
 * @tag chx-tool-call-diff
 * @summary File diff inside a tool call — renders ready-made unified-diff text, never computes it.
 */
@customElement("chx-tool-call-diff")
export class ChxToolCallDiff extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    path: { type: String },
    diff: { type: String },
  };

  constructor() {
    super();

    /** Shown in the block's header after the "Diff" label. @type {string} */
    this.path = "";

    /** Unified diff text. ACP hands over `oldText`/`newText`, not a diff — computing one is the
     *  adapter's job, the same way markdown parsing is (see `src/docs/agentic.md`). @type {string} */
    this.diff = "";
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  render() {
    return html`
      <chx-code-block
        class="tool-call-diff__block"
        part="block"
        exportparts="container: block-container, header: block-header, label-group: block-label-group, label: block-label, filename: block-filename, meta: block-meta, actions: block-actions, copy: block-copy, wrap: block-wrap, body: block-body, toggle: block-toggle"
        .code=${this.diff}
        .filename=${this.path}
        lang="diff"
      >
        <slot name="actions" slot="actions"></slot>
      </chx-code-block>
    `;
  }
}
