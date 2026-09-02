import { defineConfig } from "vite";
import postcssLit from "rollup-plugin-postcss-lit";
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
      // `src/core/index-tree.js` is a second entry, not just reachable via `src/index.js`'s
      // re-export — found live: its exports are pure functions with no module-eval side effect
      // (unlike `tree-view.js`/`tree-item.js`, kept alive by their own `@customElement` side
      // effect), so Rollup's tree-shaking silently dropped the whole file from `dist/` even
      // though `vite-plugin-dts` still (correctly, separately) emitted its `.d.ts` — the published
      // types promised `import { buildIndexTree } from "@symblight/tree-view"` would work, the
      // actual bundle didn't ship it. Declaring it as its own entry makes Rollup treat its exports
      // as used regardless of internal call sites, the same guarantee `src/index.js` itself gets.
      input: ["src/index.js", "src/core/index-tree.js"],
      // Without this, Rollup still tree-shakes away index-tree.js's exports even as their own
      // entry: `preserveModules` preserves file *structure*, not individual bindings, and pure
      // functions with zero call sites anywhere in the graph read as fully dead code otherwise —
      // "strict" tells Rollup an entry's own exports are the public contract, not optional.
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
