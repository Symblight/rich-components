import { Compartment } from "@codemirror/state";
import { language as languageFacet } from "@codemirror/language";

import {
  allLanguages,
  loadLanguageExtensions,
  resolveLanguage,
  uniquePlugins,
} from "../core/plugin.js";

/** @typedef {import("../components/code-editor/code-editor.js").CdxCodeEditor} CdxCodeEditor */

/**
 * Applies `plugins`: their always-on extensions, and the language picked by `language` or
 * `filename` together with every plugin's `forLanguage` extensions for it, loaded lazily.
 */
export class LanguageController {
  /** @type {CdxCodeEditor} */
  #host;
  /** @type {import("./EditorViewController.js").EditorViewController} */
  #editor;
  #plugins = new Compartment();
  #language = new Compartment();
  #request = 0;

  /**
   * @param {CdxCodeEditor} host
   * @param {import("./EditorViewController.js").EditorViewController} editor
   */
  constructor(host, editor) {
    this.#host = host;
    this.#editor = editor;
  }

  get extension() {
    return [this.#plugins.of([]), this.#language.of([])];
  }

  /** The language the current state is highlighted with — read from the state, so it follows a
   *  tab switch, and matched back to the plugin description that provided it. */
  get active() {
    const state = this.#editor.state;
    const current = state?.facet(languageFacet);
    if (!current) return null;
    return (
      allLanguages(this.#host.plugins).find(
        (description) => description.support?.language === current,
      ) ?? null
    );
  }

  /** The plugins' always-on extensions — editor-level, so re-applied to every tab's state. */
  pluginEffects() {
    const extensions = uniquePlugins(this.#host.plugins).map((plugin) => plugin.extensions ?? []);
    return [this.#plugins.reconfigure(extensions)];
  }

  /** @param {import("lit").PropertyValues} changed */
  update(changed) {
    if (changed.has("plugins")) this.#editor.dispatch({ effects: this.pluginEffects() });
    if (changed.has("language") || changed.has("filename") || changed.has("plugins")) {
      this.#load();
    }
  }

  /** The language effect for a document that isn't on screen yet — a tab being prepared.
   * @param {{ language?: string, filename?: string }} target */
  async effectFor({ language = "", filename = "" }) {
    const { extensions } = await this.#resolve(language, filename);
    return this.#language.reconfigure(extensions);
  }

  /** @param {string} language @param {string} filename */
  async #resolve(language, filename) {
    const plugins = this.#host.plugins;
    const description = resolveLanguage(plugins, { language, filename });
    const extensions = description ? await loadLanguageExtensions(plugins, description) : [];
    return { extensions };
  }

  /** A stale load resolving late is dropped — only the latest request gets applied. */
  async #load() {
    const request = ++this.#request;
    const { extensions } = await this.#resolve(this.#host.language, this.#host.filename);
    if (request !== this.#request) return;
    this.#editor.dispatch({ effects: this.#language.reconfigure(extensions) });
  }
}
