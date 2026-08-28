import path from "node:path";
import { transformAsync } from "@babel/core";
import { playwrightLauncher } from "@web/test-runner-playwright";

const babelConfigFile = path.resolve(import.meta.dirname, "./babel.config.json");

// Transforms Lit decorator syntax via Babel.
function babelDecoratorsPlugin() {
  return {
    name: "babel-decorators",
    async transform(context) {
      if (!context.path.endsWith(".js") || context.path.includes("node_modules")) {
        return;
      }
      const result = await transformAsync(context.body, {
        filename: context.path,
        babelrc: false,
        configFile: babelConfigFile,
      });
      if (result?.code) {
        return { body: result.code };
      }
    },
  };
}

// Transforms `import icon from "./foo.svg?raw"` → plain string default export
// Note: nodeResolve strips ?raw from NPM package paths, so we match on .svg extension alone
function svgRawPlugin() {
  return {
    name: "svg-raw",
    resolveMimeType(context) {
      if (context.path.endsWith(".svg")) {
        return "js";
      }
    },
    async transform(context) {
      if (context.path.endsWith(".svg")) {
        const escaped = context.body
          .replace(/\\/g, "\\\\")
          .replace(/`/g, "\\`")
          .replace(/\$\{/g, "\\${");
        return { body: `export default \`${escaped}\`;` };
      }
    },
  };
}

// Transforms `import styles from "./foo.css?inline"` → Lit CSSResult module
function cssInlinePlugin() {
  return {
    name: "css-inline",
    resolveMimeType(context) {
      if (context.path.endsWith(".css") && context.querystring.includes("inline")) {
        return "js";
      }
    },
    async transform(context) {
      if (context.path.endsWith(".css") && context.querystring.includes("inline")) {
        const escaped = context.body
          .replace(/\\/g, "\\\\")
          .replace(/`/g, "\\`")
          .replace(/\$\{/g, "\\${");
        return {
          body: `import { css } from "lit";\nexport default css\`${escaped}\`;`,
        };
      }
    },
  };
}

// bind-event-listener (pulled in transitively via @atlaskit/pragmatic-drag-and-drop, used by
// DropTargetController) ships pure CJS with no ESM build and no `export` statements at all — the
// dev server serves its source as-is, so the browser's own static ESM export analysis sees zero
// exports regardless of what `exports.foo = ...` does at runtime (`nodeResolve: true` alone
// doesn't transform CJS→ESM). A faithful, hand-translated ESM equivalent of dist/index.js's two
// tiny functions (checked against the installed 3.0.0 source) sidesteps needing a general
// CJS-interop plugin for this one dependency.
function bindEventListenerShimPlugin() {
  return {
    name: "bind-event-listener-shim",
    transform(context) {
      if (context.path.endsWith("/bind-event-listener/dist/index.js")) {
        return {
          body: `
            export function bind(target, { type, listener, options }) {
              target.addEventListener(type, listener, options);
              return function unbind() {
                target.removeEventListener(type, listener, options);
              };
            }

            function toOptions(value) {
              return typeof value === "boolean" ? { capture: value } : value;
            }

            export function bindAll(target, bindings, sharedOptions) {
              const unbinds = bindings.map((original) => {
                const binding =
                  sharedOptions == null
                    ? original
                    : {
                        ...original,
                        options: { ...toOptions(sharedOptions), ...toOptions(original.options) },
                      };
                return bind(target, binding);
              });
              return function unbindAll() {
                unbinds.forEach((unbind) => unbind());
              };
            }
          `,
        };
      }
    },
  };
}

export default {
  nodeResolve: true,
  coverage: true,
  coverageConfig: {
    include: ["src/**/*.js"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.spec.js", "**/*.stories.js"],
    threshold: {
      statements: 70,
      branches: 70,
      // Babel's standard-decorators transform inlines a generic runtime
      // helper per file with several branches unused by simple usages like
      // @customElement-only classes, inflating the uncovered-function count
      // independent of actual test coverage.
      functions: 55,
      lines: 70,
    },
  },
  files: ["src/**/*.spec.js", "!node_modules/"],
  plugins: [svgRawPlugin(), cssInlinePlugin(), babelDecoratorsPlugin(), bindEventListenerShimPlugin()],
  browsers: [playwrightLauncher({ product: "chromium" })],
  // @atlaskit/pragmatic-drag-and-drop (used by DropTargetController) reads `process.env` at
  // module scope in its own ESM build — a Node global with no browser equivalent. Minimal shim,
  // injected before any test module loads.
  testRunnerHtml: (testFramework) => `
    <html>
      <body>
        <script>globalThis.process = { env: {} };</script>
        <script>
          // "ResizeObserver loop completed with undelivered notifications" is a benign browser
          // warning (the spec's own recommended way of saying "a RO callback caused more layout
          // work than fit in one frame — deferred to the next") — @tanstack/lit-virtual's
          // measureElement relies on a ResizeObserver and can trigger this under fast test-driven
          // DOM churn. Not a real error; without this it surfaces as an uncaught window "error"
          // event and fails whatever test happened to be running at the time.
          window.addEventListener("error", (event) => {
            if (event.message?.includes("ResizeObserver loop")) event.stopImmediatePropagation();
          });
        </script>
        <script type="module" src="${testFramework}"></script>
      </body>
    </html>
  `,
};
