import { LanguageDescription } from "@codemirror/language";

/**
 * @typedef {import("@codemirror/state").Extension} Extension
 * @typedef {() => Extension | Promise<Extension>} CdxExtensionLoader
 * @typedef {{
 *   id: string,
 *   languages?: readonly LanguageDescription[],
 *   extensions?: Extension,
 *   forLanguage?: Readonly<Record<string, CdxExtensionLoader>>,
 * }} CdxPlugin
 * `languages` are grammars the plugin contributes; `extensions` are always on; `forLanguage` is
 * keyed by a language name or alias and loaded only while that language is active.
 */

/** Identity — gives a plain object the `CdxPlugin` type.
 * @param {CdxPlugin} plugin @returns {CdxPlugin} */
export function defineCdxPlugin(plugin) {
  return plugin;
}

/** Presets share plugins, so `[...webPreset, ...pythonPreset]` repeats some — each counts once.
 * @param {readonly CdxPlugin[]} plugins @returns {CdxPlugin[]} */
export function uniquePlugins(plugins) {
  return [...new Set(plugins)];
}

/** @param {readonly CdxPlugin[]} plugins */
export function allLanguages(plugins) {
  return uniquePlugins(plugins).flatMap((plugin) => plugin.languages ?? []);
}

/** `language` wins over `filename`; the first plugin contributing a match wins over later ones.
 * @param {readonly CdxPlugin[]} plugins
 * @param {{ language: string, filename: string }} target
 * @returns {LanguageDescription | null} */
export function resolveLanguage(plugins, { language, filename }) {
  const languages = allLanguages(plugins);
  if (language) return LanguageDescription.matchLanguageName(languages, language, false);
  if (filename) return LanguageDescription.matchFilename(languages, filename);
  return null;
}

/** The grammar plus every plugin's `forLanguage` entry for it, loaded in parallel. A failing loader
 *  drops only its own part, so one broken plugin can't take the grammar down with it.
 * @param {readonly CdxPlugin[]} plugins
 * @param {LanguageDescription} description
 * @returns {Promise<Extension[]>} */
export async function loadLanguageExtensions(plugins, description) {
  const languages = allLanguages(plugins);
  /** @type {{ source: string, load: CdxExtensionLoader }[]} */
  const loaders = [
    { source: description.name, load: () => description.support ?? description.load() },
  ];
  for (const plugin of uniquePlugins(plugins)) {
    for (const [name, load] of Object.entries(plugin.forLanguage ?? {})) {
      if (LanguageDescription.matchLanguageName(languages, name, false) === description) {
        loaders.push({ source: plugin.id, load });
      }
    }
  }
  const results = await Promise.allSettled(loaders.map(({ load }) => load()));
  return results.flatMap((result, index) => {
    if (result.status === "fulfilled") return [result.value];
    console.error(`cdx-code-editor: "${loaders[index].source}" failed to load`, result.reason);
    return [];
  });
}
