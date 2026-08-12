import path from "node:path";
import { transformAsync } from "@babel/core";
import { playwrightLauncher } from "@web/test-runner-playwright";

const babelConfigFile = path.resolve(
  import.meta.dirname,
  "./babel.config.json",
);

// Transforms Lit decorator syntax via Babel.
function babelDecoratorsPlugin() {
  return {
    name: "babel-decorators",
    async transform(context) {
      if (
        !context.path.endsWith(".js") ||
        context.path.includes("node_modules")
      ) {
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
      if (
        context.path.endsWith(".css") &&
        context.querystring.includes("inline")
      ) {
        return "js";
      }
    },
    async transform(context) {
      if (
        context.path.endsWith(".css") &&
        context.querystring.includes("inline")
      ) {
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
  plugins: [svgRawPlugin(), cssInlinePlugin(), babelDecoratorsPlugin()],
  browsers: [playwrightLauncher({ product: "chromium" })],
};
