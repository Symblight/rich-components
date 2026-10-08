import { html } from "lit";

import "../index.js";
import { webPreset } from "../presets/index.js";

/** @typedef {import("../components/code-editor/code-editor.js").CdxCodeEditor} CdxCodeEditor */

/** The file at HEAD. */
const HEAD = `import tsParser from "@typescript-eslint/parser";

const tsRules = {
  "@typescript-eslint/no-unused-expressions": "off",
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/ban-ts-comment": "off",
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
    rules: tsRules,
  },
];
`;

/** The working copy: the developer's own edits against HEAD. */
const WORKING = `import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

const tsRules = {
  ...tsPlugin.configs.recommended.rules,
  "@typescript-eslint/no-unused-expressions": "off",
  "@typescript-eslint/no-explicit-any": "warn",
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
];
`;

/** The agent's proposal on top of the working copy: three chunks. */
const PROPOSED = WORKING.replace(`    files: ["**/*.js"],`, `    files: ["**/*.js", "**/*.ts"],`)
  .replace(
    `        sourceType: "module",
      },`,
    `        sourceType: "module",
        project: "./tsconfig.json",
      },`,
  )
  .replace(
    `    rules: tsRules,
  },
];`,
    `    rules: tsRules,
  },
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**"],
  },
];`,
  );

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Code Editor/Changes",
  component: "cdx-code-editor",
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** Review: an agent's three proposals inline, each with its header, the review bar above. Accept
 *  folds a chunk into `reviewBase` (`cdx-review-base-change`), Reject reverts it (`cdx-change`).
 *  F7 / Shift-F7 walk the chunks, Mod-Alt-Enter / Mod-Alt-Backspace decide the one under the caret.
 *  `collapse-unchanged` folds untouched stretches into a bar; click it to expand.
 *  @type {Story} */
export const Review = {
  render: () => html`
    <cdx-code-editor
      style="block-size: 34rem"
      label="eslint.config.js"
      .plugins=${webPreset}
      filename="eslint.config.js"
      .defaultValue=${PROPOSED}
      .reviewBase=${WORKING}
      @cdx-review-base-change=${(/** @type {CustomEvent} */ event) => {
        /** @type {CdxCodeEditor} */ (event.currentTarget).reviewBase = event.detail.reviewBase;
      }}
    >
      <cdx-diff slot="diff" kind="review" author="Agent" collapse-unchanged></cdx-diff>
      <cdx-footer slot="footer" encoding="UTF-8"></cdx-footer>
    </cdx-code-editor>
  `,
};

/** Baseline (HEAD): quiet gutter marks only. Click a mark to open that chunk with Revert; Escape
 *  closes it. The toggle below is a consumer's "Diff vs HEAD" status-bar button (`expanded`).
 *  @type {Story} */
export const Baseline = {
  render: () => {
    /** @param {Event} event */
    const toggle = (event) => {
      const diff = /** @type {import("../features/diff/diff.js").CdxDiff} */ (
        document.getElementById("baseline-config")
      );
      diff.expanded = !diff.expanded;
      /** @type {HTMLElement} */ (event.currentTarget).setAttribute(
        "aria-pressed",
        String(diff.expanded),
      );
    };
    /** @param {CustomEvent<import("../index.js").CdxDiffStats>} event */
    const handleStats = (event) => {
      const { added, removed } = event.detail.baseline;
      const label = document.getElementById("baseline-stats");
      if (label) label.textContent = `+${added} −${removed}`;
    };
    return html`
      <div style="display: grid; gap: 6px; font: 12px system-ui">
        <cdx-code-editor
          style="block-size: 30rem"
          label="eslint.config.js"
          .plugins=${webPreset}
          filename="eslint.config.js"
          .defaultValue=${WORKING}
          .baseline=${HEAD}
          @cdx-diff-change=${handleStats}
        >
          <cdx-diff id="baseline-config" slot="diff" kind="baseline"></cdx-diff>
          <cdx-footer slot="footer" encoding="UTF-8"></cdx-footer>
        </cdx-code-editor>
        <div style="display: flex; gap: 8px; align-items: center">
          <button type="button" aria-pressed="false" @click=${toggle}>Diff vs HEAD</button>
          <span id="baseline-stats"></span>
        </div>
      </div>
    `;
  },
};

/** Both layers at once, as in an IDE: HEAD marks for the developer's own edits, the agent's
 *  proposals inline on top. An accepted proposal becomes an ordinary working-copy change and shows
 *  up as a HEAD mark.
 *  @type {Story} */
export const BothLayers = {
  render: () => html`
    <cdx-code-editor
      style="block-size: 38rem"
      label="eslint.config.js"
      .plugins=${webPreset}
      filename="eslint.config.js"
      .defaultValue=${PROPOSED}
      .baseline=${HEAD}
      .reviewBase=${WORKING}
      @cdx-review-base-change=${(/** @type {CustomEvent} */ event) => {
        /** @type {CdxCodeEditor} */ (event.currentTarget).reviewBase = event.detail.reviewBase;
      }}
    >
      <cdx-diff slot="diff" kind="baseline"></cdx-diff>
      <cdx-diff slot="diff" kind="review"></cdx-diff>
      <cdx-footer slot="footer" encoding="UTF-8"></cdx-footer>
    </cdx-code-editor>
  `,
};

/** Initials on a colored disc, inline — the story needs no network. */
const avatar = (/** @type {string} */ initials, /** @type {string} */ color) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="${color}"/><text x="24" y="31" font-family="system-ui" font-size="20" font-weight="600" fill="#fff" text-anchor="middle">${initials}</text></svg>`,
  )}`;

const AUTHORS = [
  { name: "Anna K.", avatar: avatar("AK", "#8e44ad") },
  { name: "Lev M.", avatar: avatar("LM", "#1d5d78") },
];

/** Any author, not just an agent: a colleague's review, per chunk, in the primary tone, with
 *  localised labels. `getAuthor` / `getAvatarUrl` get the chunk (no argument for the review bar).
 *  @type {Story} */
export const CustomAuthor = {
  render: () => html`
    <cdx-code-editor
      style="block-size: 34rem"
      label="eslint.config.js"
      .plugins=${webPreset}
      filename="eslint.config.js"
      .defaultValue=${PROPOSED}
      .reviewBase=${WORKING}
    >
      <cdx-diff
        slot="diff"
        kind="review"
        tone="primary"
        accept-label="Принять"
        reject-label="Отклонить"
        accept-all-label="Принять все"
        reject-all-label="Отклонить все"
        .getAuthor=${(/** @type {import("../index.js").CdxChunkModel | undefined} */ chunk) =>
          chunk ? AUTHORS[chunk.index % 2].name : "Anna K. and Lev M."}
        .getAvatarUrl=${(/** @type {import("../index.js").CdxChunkModel | undefined} */ chunk) =>
          AUTHORS[(chunk?.index ?? 0) % 2].avatar}
      ></cdx-diff>
      <cdx-footer slot="footer" encoding="UTF-8"></cdx-footer>
    </cdx-code-editor>
  `,
};

/** Collapse unchanged: stretches of at least `minSize` untouched lines fold into an "N unchanged
 *  lines" bar, `margin` lines of context kept around each change; click the bar to expand it.
 *  The bare `collapse-unchanged` attribute takes merge's defaults (margin 3, minSize 4).
 *  @type {Story} */
export const CollapseUnchanged = {
  args: { margin: 2, minSize: 4 },
  argTypes: {
    margin: { control: { type: "number", min: 0 } },
    minSize: { control: { type: "number", min: 1 } },
  },
  render: ({ margin, minSize }) => html`
    <cdx-code-editor
      style="block-size: 34rem"
      label="eslint.config.js"
      .plugins=${webPreset}
      filename="eslint.config.js"
      .defaultValue=${PROPOSED}
      .reviewBase=${WORKING}
      @cdx-review-base-change=${(/** @type {CustomEvent} */ event) => {
        /** @type {CdxCodeEditor} */ (event.currentTarget).reviewBase = event.detail.reviewBase;
      }}
    >
      <cdx-diff slot="diff" kind="review" .collapseUnchanged=${{ margin, minSize }}></cdx-diff>
    </cdx-code-editor>
  `,
};
