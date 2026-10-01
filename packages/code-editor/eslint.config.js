import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

const tsRules = {
  ...tsPlugin.configs.recommended.rules,
  "@typescript-eslint/no-unused-expressions": "off",
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    },
  ],
};

export default [
  {
    // Parsed with @typescript-eslint/parser (not the default espree) because
    // Lit decorator syntax isn't valid plain ECMAScript.
    files: ["**/*.js"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: tsRules,
  },
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "storybook-static/**",
      "coverage/**",
      "**/*.stories.js",
    ],
  },
];
