import { defineConfig } from "vite";
import path from "node:path";
import litcss from "rollup-plugin-postcss-lit";
import babel from "vite-plugin-babel";

export default defineConfig({
  assetsInclude: ["/sb-preview/runtime.js"],
  esbuild: {
    target: "esnext",
    supported: {
      decorators: false,
    },
  },
  plugins: [
    litcss({
      include: [path.join(import.meta.dirname, "../src/**/*.css?*")],
    }),
    babel({
      filter: /\.js$/,
      babelConfig: {
        babelrc: false,
        configFile: path.resolve(import.meta.dirname, "../babel.config.json"),
      },
    }),
  ],
});
