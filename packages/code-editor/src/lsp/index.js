import {
  findReferencesKeymap,
  formatKeymap,
  hoverTooltips,
  jumpToDefinitionKeymap,
  LSPClient,
  renameKeymap,
  serverCompletion,
  serverDiagnostics,
  signatureHelp,
} from "@codemirror/lsp-client";
import { keymap } from "@codemirror/view";

import { symbolProvider } from "../core/symbols.js";

/**
 * @typedef {import("@codemirror/lsp-client").Transport} Transport
 * @typedef {import("@codemirror/lsp-client").LSPClientConfig} LSPClientConfig
 * @typedef {import("../core/symbols.js").CdxSymbol} CdxSymbol
 * @typedef {import("../core/symbols.js").CdxSymbolKind} CdxSymbolKind
 */

/**
 * A client with every lsp-client feature on — completion, hover, signature help, diagnostics,
 * rename (F2), formatting, go to definition (F12), references (Shift-F12) — connected when
 * `transport` is given. The transport is the consumer's: a WebSocket, a worker, or Tauri IPC to a
 * server process. The server's completions replace the grammar's word-based ones unless
 * `completionOverride` is false — otherwise the same names show up twice.
 * @param {LSPClientConfig & { transport?: Transport, completionOverride?: boolean }} [config]
 */
export function createLspClient({ transport, completionOverride = true, ...config } = {}) {
  const extensions = [
    serverCompletion({ override: completionOverride }),
    hoverTooltips(),
    keymap.of([
      ...formatKeymap,
      ...renameKeymap,
      ...jumpToDefinitionKeymap,
      ...findReferencesKeymap,
    ]),
    signatureHelp(),
    serverDiagnostics(),
  ];
  const client = new LSPClient({ extensions, ...config });
  if (transport) client.connect(transport);
  return client;
}

/** LSP SymbolKind (1-based) → ours. */
const KINDS = /** @type {Record<number, CdxSymbolKind>} */ ({
  2: "namespace",
  3: "namespace",
  4: "namespace",
  5: "class",
  6: "method",
  7: "property",
  8: "property",
  9: "method",
  10: "type",
  11: "type",
  12: "function",
  13: "variable",
  14: "variable",
  22: "property",
  23: "class",
  26: "type",
});

/**
 * @typedef {{ line: number, character: number }} LspPosition
 * @typedef {{ start: LspPosition, end: LspPosition }} LspRange
 * @typedef {{ name: string, kind: number, range: LspRange, children?: LspDocumentSymbol[] }} LspDocumentSymbol
 * @typedef {{ name: string, kind: number, location: { range: LspRange } }} LspSymbolInformation
 */

/**
 * The outline from `textDocument/documentSymbol`, replacing the syntax-tree one — covers languages
 * without a Lezer tree (e.g. C#) and gets real semantics everywhere else.
 * @param {LSPClient} client @param {string} uri
 */
export function lspSymbols(client, uri) {
  return symbolProvider.of(async (state) => {
    client.sync();
    /** @type {(LspDocumentSymbol | LspSymbolInformation)[] | null} */
    const result = await client.request("textDocument/documentSymbol", {
      textDocument: { uri },
    });
    if (!result) return [];
    const { doc } = state;
    /** @param {LspPosition} pos */
    const offset = (pos) => {
      const line = doc.line(Math.min(Math.max(pos.line + 1, 1), doc.lines));
      return Math.min(line.from + pos.character, line.to);
    };
    /** @param {LspDocumentSymbol | LspSymbolInformation} symbol @returns {CdxSymbol} */
    const convert = (symbol) => {
      const range = "range" in symbol ? symbol.range : symbol.location.range;
      return {
        name: symbol.name,
        kind: KINDS[symbol.kind] ?? "variable",
        from: offset(range.start),
        to: offset(range.end),
        children: "children" in symbol && symbol.children ? symbol.children.map(convert) : [],
      };
    };
    return result.map(convert).sort((a, b) => a.from - b.from);
  });
}

/**
 * Binds one document to the server: open/sync, and the client's features. Goes into
 * `createState(doc, { extensions })`, since it's tied to that file's URI.
 * @param {LSPClient} client
 * @param {string} uri
 * @param {{ languageId?: string, symbols?: boolean }} [options]
 *   `languageId` defaults to the editor language's name; `symbols` (default true) also takes the
 *   outline from the server.
 */
export function lspDocument(client, uri, { languageId, symbols = true } = {}) {
  return [client.plugin(uri, languageId), symbols ? lspSymbols(client, uri) : []];
}

export { LSPClient };
