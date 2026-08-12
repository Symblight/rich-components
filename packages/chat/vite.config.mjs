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
      input: "src/index.js",
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
        const elementsDts = path.resolve(
          import.meta.dirname,
          "dist/elements.d.ts",
        );
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
