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

export default {
  nodeResolve: true,
  files: ["src/**/*.spec.js", "!node_modules/"],
  plugins: [cssInlinePlugin(), babelDecoratorsPlugin()],
  browsers: [playwrightLauncher({ product: "chromium" })],
};
