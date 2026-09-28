import { defineConfig } from "vite";
import postcssLit from "rollup-plugin-postcss-lit";
import { copyFileSync } from "node:fs";
import path from "node:path";
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
    rollupOptions: {
      // separate entries: a messenger importing only "." never pulls the agentic components in
      input: ["src/index.js", "src/agent.js"],
      // Vite's app build defaults this to false, which strips every entry's exports
      preserveEntrySignatures: "strict",
      external: [
        "lit",
        /^lit\/.*/,
        /^@lit\/.*/,
        /^@lit-labs\/.*/,
        /^@open-wc\/.*/,
        /^@symblight\/wc-material.*/,
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
    // `@symblight/chat/tokens.css` — the raw token layer, for an app's own shadow roots
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
      exclude: ["**/*.stories.js", "src/stories/**", "**/__tests__/**", "vite-env.d.ts"],
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
