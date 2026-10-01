import { defineConfig } from "vite";
import postcssLit from "rollup-plugin-postcss-lit";
import path from "node:path";
import { copyFileSync } from "node:fs";
import { rimrafSync } from "rimraf";
import dts from "vite-plugin-dts";
import babel from "vite-plugin-babel";

rimrafSync(path.resolve(import.meta.dirname, "./dist"));

export default defineConfig({
  esbuild: {
    target: "esnext",
    minifyIdentifiers: false,
    minifySyntax: true,
  },
  build: {
    target: "esnext",
    // library mode: Vite skips its __vitePreload wrapper, which would otherwise wrap the presets'
    // lazy grammar imports and dispatch vite:preloadError on the consumer's window
    lib: {
      entry: ["src/index.js", "src/presets/index.js", "src/lsp/index.js"],
      formats: ["es"],
    },
    rollupOptions: {
      // @codemirror/* and @lezer/* must stay a single instance shared with the consumer's own
      // extensions — CodeMirror recognizes extensions by instanceof
      external: [
        /^lit$/,
        /^lit\/.*/,
        /^@lit\/.*/,
        /^@lit-labs\/.*/,
        /^@symblight\/wc-material.*/,
        /^@codemirror\/.*/,
        /^@lezer\/.*/,
        /^@replit\/.*/,
      ],
      output: {
        format: "es",
        preserveModules: true,
        preserveModulesRoot: "src",
        entryFileNames: "[name].js",
        dir: "dist",
      },
    },
  },
  plugins: [
    postcssLit(),
    // `@symblight/code-editor/tokens.css` — the raw token layer, for an app's own shadow roots
    {
      name: "copy-tokens-css",
      closeBundle() {
        copyFileSync(
          path.resolve(import.meta.dirname, "src/styles/tokens.css"),
          path.resolve(import.meta.dirname, "dist/tokens.css"),
        );
      },
    },
    babel({
      filter: /\.js$/,
      babelConfig: {
        babelrc: false,
        configFile: path.resolve(import.meta.dirname, "./babel.config.json"),
      },
    }),
    dts({
      entryRoot: "src",
      outDir: "dist",
      copyDtsFiles: true,
      exclude: ["**/*.stories.js", "**/__tests__/**", "vite-env.d.ts"],
      beforeWriteFile(filePath, content) {
        const elementsDts = path.resolve(import.meta.dirname, "dist/elements.d.ts");
        if (filePath === elementsDts || filePath.includes("/stories/")) {
          return;
        }
        const reference = path.relative(path.dirname(filePath), elementsDts);
        return {
          content: `/// <reference path="${reference}" />\n${content}`,
        };
      },
    }),
  ],
});
