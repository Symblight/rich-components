import { indentUnit, LanguageDescription } from "@codemirror/language";
import { languages as languageData } from "@codemirror/language-data";

import { defineCdxPlugin } from "../core/plugin.js";

/** @typedef {import("../core/plugin.js").CdxPlugin} CdxPlugin */

/** Short names common in code fences and chat that language-data doesn't alias. */
const EXTRA_ALIASES = /** @type {Record<string, string[]>} */ ({
  Python: ["py"],
  Rust: ["rs"],
  Kotlin: ["kt"],
  Dockerfile: ["docker"],
});

/** language-data's Markdown highlights no fenced code; this one resolves fences against the whole
 *  catalog, each grammar still loaded only when a fence uses it. */
const markdown = LanguageDescription.of({
  name: "Markdown",
  alias: ["markdown", "md"],
  extensions: ["md", "markdown", "mkd"],
  load: () =>
    import("@codemirror/lang-markdown").then((m) => m.markdown({ codeLanguages: catalog })),
});

/** language-data's descriptions are shared module state, so extra aliases go on a copy. */
const catalog = languageData.map((description) => {
  if (description.name === "Markdown") return markdown;
  const extra = EXTRA_ALIASES[description.name];
  if (!extra) return description;
  return LanguageDescription.of({
    name: description.name,
    alias: [...description.alias, ...extra],
    extensions: description.extensions,
    filename: description.filename,
    load: () => description.load(),
  });
});

/** @param {string} name */
function byName(name) {
  const description = catalog.find((entry) => entry.name === name);
  if (!description) throw new Error(`cdx-code-editor presets: no language named "${name}"`);
  return description;
}

/** Indentation from each language's own style guide (PEP 8, rustfmt, gofmt, …); anything not
 *  listed keeps CodeMirror's 2-space default. */
const INDENT = /** @type {Record<string, string>} */ ({
  Python: "    ",
  Cython: "    ",
  Rust: "    ",
  Go: "\t",
  "C#": "    ",
  "F#": "    ",
  "VB.NET": "    ",
  Java: "    ",
  Kotlin: "    ",
  Groovy: "    ",
  PHP: "    ",
  Swift: "    ",
});

/**
 * A plugin contributing language-data grammars by name, e.g. `["Python", "Cython"]`.
 * @param {string} id
 * @param {string[]} names
 * @returns {CdxPlugin}
 */
export function createLanguagePlugin(id, names) {
  const languages = names.map(byName);
  /** @type {Record<string, () => import("@codemirror/state").Extension>} */
  const forLanguage = {};
  for (const { name } of languages) {
    const unit = INDENT[name];
    if (unit) forLanguage[name] = () => indentUnit.of(unit);
  }
  return defineCdxPlugin({ id, languages, forLanguage });
}

export const javascriptPlugin = createLanguagePlugin("javascript", [
  "JavaScript",
  "TypeScript",
  "JSX",
  "TSX",
]);
export const htmlPlugin = createLanguagePlugin("html", ["HTML", "Vue", "Angular Template"]);
export const cssPlugin = createLanguagePlugin("css", ["CSS", "SCSS", "Sass", "LESS"]);
export const jsonPlugin = createLanguagePlugin("json", ["JSON", "JSON-LD"]);
export const markdownPlugin = createLanguagePlugin("markdown", ["Markdown"]);
export const yamlPlugin = createLanguagePlugin("yaml", ["YAML"]);
export const tomlPlugin = createLanguagePlugin("toml", ["TOML"]);
export const xmlPlugin = createLanguagePlugin("xml", ["XML", "DTD"]);
export const shellPlugin = createLanguagePlugin("shell", ["Shell", "PowerShell", "Dockerfile"]);
export const diffPlugin = createLanguagePlugin("diff", ["diff"]);
export const sqlPlugin = createLanguagePlugin("sql", [
  "SQL",
  "PostgreSQL",
  "MySQL",
  "MariaDB SQL",
  "SQLite",
  "MS SQL",
  "PLSQL",
  "CQL",
]);
export const pythonPlugin = createLanguagePlugin("python", ["Python", "Cython"]);
export const rustPlugin = createLanguagePlugin("rust", ["Rust"]);
export const goPlugin = createLanguagePlugin("go", ["Go"]);
export const cppPlugin = createLanguagePlugin("cpp", [
  "C",
  "C++",
  "Objective-C",
  "Objective-C++",
  "CMake",
]);
export const csharpPlugin = createLanguagePlugin("csharp", ["C#", "F#", "VB.NET"]);
export const jvmPlugin = createLanguagePlugin("jvm", [
  "Java",
  "Kotlin",
  "Groovy",
  "Scala",
  "Properties files",
]);
export const phpPlugin = createLanguagePlugin("php", ["PHP"]);
export const rubyPlugin = createLanguagePlugin("ruby", ["Ruby"]);
export const swiftPlugin = createLanguagePlugin("swift", ["Swift"]);

/** Every language-data grammar in one plugin — for a generic editor that opens any file. */
export const allLanguagesPlugin = createLanguagePlugin(
  "all",
  catalog.map(({ name }) => name),
);

/** Shared by every preset: the files any project carries next to its code. */
const common = [jsonPlugin, yamlPlugin, markdownPlugin, shellPlugin, diffPlugin];

/** WebStorm */
export const webPreset = [javascriptPlugin, htmlPlugin, cssPlugin, xmlPlugin, ...common];
/** PyCharm */
export const pythonPreset = [pythonPlugin, tomlPlugin, sqlPlugin, ...common];
/** RustRover */
export const rustPreset = [rustPlugin, tomlPlugin, ...common];
/** GoLand */
export const goPreset = [goPlugin, sqlPlugin, ...common];
/** CLion */
export const cppPreset = [cppPlugin, ...common];
/** Rider */
export const dotnetPreset = [csharpPlugin, xmlPlugin, sqlPlugin, ...common];
/** IntelliJ IDEA */
export const jvmPreset = [jvmPlugin, xmlPlugin, sqlPlugin, ...common];
/** DataGrip */
export const sqlPreset = [sqlPlugin, ...common];
/** Every language-data grammar, plus the per-language indentation. */
export const allPreset = [allLanguagesPlugin];
