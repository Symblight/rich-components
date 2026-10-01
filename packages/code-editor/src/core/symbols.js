import { Facet } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

/**
 * @typedef {"function" | "method" | "class" | "type" | "variable" | "property" | "namespace" | "selector"} CdxSymbolKind
 * @typedef {{
 *   name: string,
 *   kind: CdxSymbolKind,
 *   from: number,
 *   to: number,
 *   children: CdxSymbol[],
 * }} CdxSymbol
 * @typedef {(state: import("@codemirror/state").EditorState) => CdxSymbol[] | Promise<CdxSymbol[]>} CdxSymbolProvider
 * Returns the document outline, outermost symbols first. May be async, e.g. an LSP documentSymbol.
 */

/** The last provider registered wins, so a plugin (or an LSP bridge) replaces the default. */
export const symbolProvider = /** @type {Facet<CdxSymbolProvider, CdxSymbolProvider | null>} */ (
  Facet.define({ combine: (providers) => providers.at(-1) ?? null })
);

/** Declaration node names across the bundled Lezer grammars → symbol kind. */
const DECLARATIONS = /** @type {Record<string, CdxSymbolKind>} */ ({
  // JavaScript / TypeScript
  FunctionDeclaration: "function",
  ClassDeclaration: "class",
  MethodDeclaration: "method",
  PropertyDeclaration: "property",
  InterfaceDeclaration: "type",
  TypeAliasDeclaration: "type",
  EnumDeclaration: "type",
  VariableDeclaration: "variable",
  Property: "property",
  // Python
  FunctionDefinition: "function",
  ClassDefinition: "class",
  // Rust
  FunctionItem: "function",
  StructItem: "class",
  EnumItem: "type",
  TraitItem: "type",
  ImplItem: "class",
  ModItem: "namespace",
  ConstItem: "variable",
  StaticItem: "variable",
  TypeItem: "type",
  // Go
  FunctionDecl: "function",
  MethodDecl: "method",
  TypeSpec: "type",
  // Java
  ConstructorDeclaration: "method",
  // C / C++
  ClassSpecifier: "class",
  StructSpecifier: "class",
  NamespaceDefinition: "namespace",
  // CSS
  RuleSet: "selector",
});

/** Node names that carry a declaration's name, in the order they're preferred. */
const NAME_NODES = new Set([
  "VariableDefinition",
  "PropertyDefinition",
  "PropertyName",
  "Definition",
  "DefName",
  "TypeDefinition",
  "TypeIdentifier",
  "TypeName",
  "BoundIdentifier",
  "VariableName",
  "FieldIdentifier",
  "NamespaceIdentifier",
  "Identifier",
  "String",
]);

/** Single-line variables and properties are noise in a breadcrumb path; only blocks count. */
const MULTILINE_ONLY = new Set(["variable", "property"]);

/** @param {import("@lezer/common").SyntaxNode} node @param {import("@codemirror/state").Text} doc */
function nameOf(node, doc) {
  if (node.name === "RuleSet") {
    const selector = node.firstChild;
    return selector ? doc.sliceString(selector.from, selector.to).trim() : null;
  }
  // direct children first, then one level down (C++ FunctionDefinition → FunctionDeclarator → Identifier)
  for (const depth of [0, 1]) {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      const candidates = depth === 0 ? [child] : childrenOf(child);
      for (const candidate of candidates) {
        if (NAME_NODES.has(candidate.name)) {
          return doc.sliceString(candidate.from, candidate.to).replace(/^["']|["']$/g, "");
        }
      }
    }
  }
  return null;
}

/** @param {import("@lezer/common").SyntaxNode} node */
function childrenOf(node) {
  const children = [];
  for (let child = node.firstChild; child; child = child.nextSibling) children.push(child);
  return children;
}

/** Outline from the syntax tree — the fallback when no provider is registered. Grammars without a
 *  tree (legacy stream modes, e.g. C#) yield nothing; an LSP provider covers those.
 * @type {CdxSymbolProvider} */
export function syntaxTreeSymbols(state) {
  const { doc } = state;
  /** @type {CdxSymbol[]} */
  const root = [];
  /** @type {CdxSymbol[]} */
  const stack = [];
  syntaxTree(state).iterate({
    enter(ref) {
      const kind = DECLARATIONS[ref.name];
      if (!kind) return;
      if (MULTILINE_ONLY.has(kind) && doc.lineAt(ref.from).number === doc.lineAt(ref.to).number) {
        return;
      }
      const name = nameOf(ref.node, doc);
      if (!name) return;
      while (stack.length && stack[stack.length - 1].to <= ref.from) stack.pop();
      const parent = stack.at(-1);
      // grammars like Python's use one node for functions and methods; the enclosing symbol decides
      const resolved = kind === "function" && parent?.kind === "class" ? "method" : kind;
      /** @type {CdxSymbol} */
      const symbol = {
        name: ref.name === "ImplItem" ? `impl ${name}` : name,
        kind: resolved,
        from: ref.from,
        to: ref.to,
        children: [],
      };
      (parent ? parent.children : root).push(symbol);
      stack.push(symbol);
    },
  });
  return root;
}

/** Outermost first: every symbol whose range holds `pos`.
 * @param {CdxSymbol[]} outline @param {number} pos */
export function symbolPathAt(outline, pos) {
  /** @type {CdxSymbol[]} */
  const path = [];
  let level = outline;
  for (;;) {
    const hit = level.find((symbol) => symbol.from <= pos && pos <= symbol.to);
    if (!hit) return path;
    path.push(hit);
    level = hit.children;
  }
}
