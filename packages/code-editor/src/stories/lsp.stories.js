import { html } from "lit";

import "../index.js";
import { createLspClient, lspDocument } from "../lsp/index.js";
import { webPreset } from "../presets/index.js";

/** @typedef {import("../components/code-editor/code-editor.js").CdxCodeEditor} CdxCodeEditor */

const URI = "file:///project/greet.ts";

const SOURCE = `// TODO: localise the greeting
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export class Greeter {
  constructor(private prefix: any) {}

  greetAll(names: string[]) {
    return names.map((n) => greet(n));
  }
}

greet("world");
`;

/**
 * A toy language server living in the page, speaking JSON-RPC over the same `Transport` shape a
 * real one would use — in a Tauri app `send` goes to the backend over IPC and `subscribe` listens
 * for its replies. It knows just enough to show every client feature working.
 * @returns {import("@codemirror/lsp-client").Transport}
 */
function mockLanguageServer() {
  /** @type {Set<(message: string) => void>} */
  const listeners = new Set();
  let text = "";
  /** @param {object} message */
  const post = (message) =>
    setTimeout(() => {
      for (const listener of listeners) listener(JSON.stringify({ jsonrpc: "2.0", ...message }));
    }, 20);
  /** @param {number} id @param {unknown} result */
  const respond = (id, result) => post({ id, result });

  /** @param {number} offset */
  const position = (offset) => {
    const before = text.slice(0, offset).split("\n");
    return { line: before.length - 1, character: before.at(-1)?.length ?? 0 };
  };
  /** @param {{ line: number, character: number }} pos */
  const offsetOf = (pos) => {
    const lines = text.split("\n");
    return lines.slice(0, pos.line).reduce((sum, line) => sum + line.length + 1, 0) + pos.character;
  };
  /** @param {number} from @param {number} to */
  const range = (from, to) => ({ start: position(from), end: position(to) });

  const publishDiagnostics = () => {
    const diagnostics = [];
    for (const match of text.matchAll(/TODO[^\n]*/g)) {
      const from = match.index ?? 0;
      diagnostics.push({
        range: range(from, from + match[0].length),
        severity: 2,
        message: "Unresolved TODO",
        source: "mock-ls",
      });
    }
    for (const match of text.matchAll(/:\s*any\b/g)) {
      const from = (match.index ?? 0) + match[0].indexOf("any");
      diagnostics.push({
        range: range(from, from + 3),
        severity: 3,
        message: "Avoid `any` — give `prefix` a real type",
        source: "mock-ls",
      });
    }
    post({ method: "textDocument/publishDiagnostics", params: { uri: URI, diagnostics } });
  };

  /** Top-level functions and classes, with methods nested — a real documentSymbol shape. */
  const documentSymbols = () => {
    const symbols = [];
    for (const match of text.matchAll(/(function|class)\s+(\w+)/g)) {
      const from = match.index ?? 0;
      const open = text.indexOf("{", from);
      let depth = 0;
      let to = open;
      for (let i = open; i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}" && --depth === 0) {
          to = i + 1;
          break;
        }
      }
      const children = [];
      if (match[1] === "class") {
        for (const method of text.slice(open, to).matchAll(/\n\s+(\w+)\s*\(/g)) {
          const start = open + (method.index ?? 0) + method[0].indexOf(method[1]);
          const body = text.indexOf("{", start);
          let level = 0;
          let end = body;
          for (let k = body; k < to; k++) {
            if (text[k] === "{") level++;
            else if (text[k] === "}" && --level === 0) {
              end = k + 1;
              break;
            }
          }
          const nameRange = range(start, start + method[1].length);
          children.push({
            name: method[1],
            kind: 6,
            range: range(start, end),
            selectionRange: nameRange,
          });
        }
      }
      symbols.push({
        name: match[2],
        kind: match[1] === "class" ? 5 : 12,
        range: range(from, to),
        selectionRange: range(from, from + match[0].length),
        children,
      });
    }
    return symbols;
  };

  /** @param {{ id?: number, method: string, params?: any }} message */
  const handle = (message) => {
    const { id, method, params } = message;
    switch (method) {
      case "initialize":
        return respond(/** @type {number} */ (id), {
          capabilities: {
            textDocumentSync: 1,
            hoverProvider: true,
            completionProvider: { triggerCharacters: ["."] },
            signatureHelpProvider: { triggerCharacters: ["(", ","] },
            documentSymbolProvider: true,
          },
        });
      case "textDocument/didOpen":
        text = params.textDocument.text;
        return publishDiagnostics();
      case "textDocument/didChange":
        text = params.contentChanges.at(-1).text;
        return publishDiagnostics();
      case "textDocument/hover": {
        const offset = offsetOf(params.position);
        const word =
          /\w+$/.exec(text.slice(0, offset))?.[0] + (/^\w+/.exec(text.slice(offset))?.[0] ?? "");
        if (word !== "greet") return respond(/** @type {number} */ (id), null);
        return respond(/** @type {number} */ (id), {
          contents: {
            kind: "markdown",
            value:
              "```typescript\nfunction greet(name: string): string\n```\nBuilds the greeting shown to `name`.",
          },
        });
      }
      case "textDocument/completion":
        return respond(/** @type {number} */ (id), {
          isIncomplete: false,
          items: [
            { label: "greet", kind: 3, detail: "(name: string) => string" },
            { label: "Greeter", kind: 7, detail: "class" },
            { label: "greetAll", kind: 2, detail: "(names: string[]) => string[]" },
          ],
        });
      case "textDocument/signatureHelp":
        return respond(/** @type {number} */ (id), {
          signatures: [
            {
              label: "greet(name: string): string",
              documentation: "Builds the greeting shown to `name`.",
              parameters: [{ label: "name: string" }],
            },
          ],
          activeSignature: 0,
          activeParameter: 0,
        });
      case "textDocument/documentSymbol":
        return respond(/** @type {number} */ (id), documentSymbols());
      default:
        if (id !== undefined) respond(id, null);
    }
  };

  return {
    send: (message) => handle(JSON.parse(message)),
    subscribe: (listener) => listeners.add(listener),
    unsubscribe: (listener) => listeners.delete(listener),
  };
}

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Code Editor/LSP",
  component: "cdx-code-editor",
};
export default meta;

/** `@symblight/code-editor/lsp` against a mock server: hover `greet`, type `gre` for completions,
 *  type `greet(` for signature help, see the TODO warning, and watch the breadcrumbs come from
 *  `textDocument/documentSymbol`. The document binding goes in through `createState`.
 *  @type {import("@storybook/web-components").StoryObj} */
export const MockServer = {
  render: () => {
    const client = createLspClient({ rootUri: "file:///project", transport: mockLanguageServer() });
    const editor = () => /** @type {CdxCodeEditor} */ (document.getElementById("lsp-editor"));
    queueMicrotask(async () => {
      await customElements.whenDefined("cdx-code-editor");
      const el = editor();
      await el.updateComplete;
      el.filename = "greet.ts";
      el.state = await el.createState(SOURCE, {
        filename: "greet.ts",
        extensions: lspDocument(client, URI, { languageId: "typescript" }),
      });
    });
    /** @param {CustomEvent<import("../index.js").CdxSymbolsChangeDetail>} event */
    const handleSymbols = (event) => {
      const crumbs = document.getElementById("lsp-crumbs");
      if (crumbs) {
        crumbs.textContent = ["greet.ts", ...event.detail.path.map((s) => s.name)].join(" › ");
      }
    };
    return html`
      <div style="display: grid; gap: 6px; font: 12px system-ui">
        <cdx-code-editor
          id="lsp-editor"
          style="block-size: 22rem"
          label="greet.ts"
          .plugins=${webPreset}
          @cdx-symbols-change=${handleSymbols}
          ><cdx-footer slot="footer" encoding="UTF-8"></cdx-footer>
        </cdx-code-editor>
        <span id="lsp-crumbs" style="opacity: 0.75">greet.ts</span>
      </div>
    `;
  },
};
