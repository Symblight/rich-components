import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, placeholder } from "@codemirror/view";

import {
  activeLineFeature,
  autocompleteFeature,
  bracketMatchingFeature,
  foldingFeature,
  indentGuidesFeature,
  lineNumbersFeature,
  wrapFeature,
} from "../core/features.js";
import { searchFeature } from "../core/search.js";

/** @typedef {import("../components/code-editor/code-editor.js").CdxCodeEditor} CdxCodeEditor */
/** @typedef {import("@codemirror/state").Extension} Extension */

/**
 * Host property → the extension it stands for. One compartment each, so a property change is a
 * single `reconfigure`, never a new view. Listed in gutter order: line numbers before folding.
 * @type {{ [K in keyof CdxCodeEditor]?: (host: CdxCodeEditor) => Extension }}
 */
const OPTIONS = {
  // on by default, so each is an opt-out `no-*` attribute that plain HTML can set
  noLineNumbers: (host) => (host.noLineNumbers ? [] : lineNumbersFeature()),
  noFolding: (host) => (host.noFolding ? [] : foldingFeature()),
  noActiveLine: (host) => (host.noActiveLine ? [] : activeLineFeature()),
  noBracketMatching: (host) => (host.noBracketMatching ? [] : bracketMatchingFeature()),
  noIndentGuides: (host) => (host.noIndentGuides ? [] : indentGuidesFeature()),
  noAutocomplete: (host) => (host.noAutocomplete ? [] : autocompleteFeature()),
  noSearch: (host) => (host.noSearch ? [] : searchFeature()),
  wrap: (host) => (host.wrap ? wrapFeature() : []),
  tabSize: (host) => EditorState.tabSize.of(host.tabSize),
  readOnly: (host) =>
    host.readOnly
      ? [
          EditorState.readOnly.of(true),
          EditorView.contentAttributes.of({ "aria-readonly": "true" }),
        ]
      : [],
  placeholder: (host) => (host.placeholder ? placeholder(host.placeholder) : []),
  label: (host) =>
    host.label ? EditorView.contentAttributes.of({ "aria-label": host.label }) : [],
  // last, after every built-in
  extensions: (host) => host.extensions,
};

export class ConfigController {
  /** @type {CdxCodeEditor} */
  #host;
  /** @type {import("./EditorViewController.js").EditorViewController} */
  #editor;
  /** @type {Map<string, Compartment>} */
  #compartments = new Map(Object.keys(OPTIONS).map((key) => [key, new Compartment()]));

  /**
   * @param {CdxCodeEditor} host
   * @param {import("./EditorViewController.js").EditorViewController} editor
   */
  constructor(host, editor) {
    this.#host = host;
    this.#editor = editor;
  }

  /** Empty compartments for the initial state — the first `update` sees every property as changed
   *  and fills them. */
  get extension() {
    return [...this.#compartments.values()].map((compartment) => compartment.of([]));
  }

  /** Reconfigure effects for the changed properties; `ALL` rebuilds every compartment, e.g. to
   *  bring a tab's stored state up to the editor's current settings.
   * @param {Pick<import("lit").PropertyValues, "has">} changed */
  effects(changed) {
    const effects = [];
    for (const [key, compartment] of this.#compartments) {
      if (!changed.has(key)) continue;
      const build = /** @type {(host: CdxCodeEditor) => Extension} */ (
        OPTIONS[/** @type {keyof CdxCodeEditor} */ (key)]
      );
      effects.push(compartment.reconfigure(build(this.#host)));
    }
    return effects;
  }

  /** @param {import("lit").PropertyValues} changed */
  update(changed) {
    const effects = this.effects(changed);
    if (effects.length) this.#editor.dispatch({ effects });
  }

  /** Whether `state` carries this editor's compartments — i.e. came from its `createState`.
   * @param {import("@codemirror/state").EditorState} state */
  owns(state) {
    const [first] = this.#compartments.values();
    return first.get(state) !== undefined;
  }
}

/** Stands in for PropertyValues when every property should count as changed. */
export const ALL = { has: () => true };
