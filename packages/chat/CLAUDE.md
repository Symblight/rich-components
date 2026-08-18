# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

From this package directory (`packages/chat`):

```bash
pnpm sb              # Storybook dev server (port 6007)
pnpm dev             # Vite dev server
pnpm build           # Build to dist/ (clears dist/ first)
pnpm test            # Run tests with @web/test-runner + Playwright
pnpm lint            # ESLint
pnpm typecheck       # tsc --noEmit (JSDoc type-check, no emit)
pnpm format          # Prettier
```

From the monorepo root:

```bash
pnpm --filter @symblight/chat sb
pnpm --filter @symblight/chat test
pnpm --filter @symblight/chat build
```

Tests match `src/**/*.spec.js` and run in Chromium via Playwright. There is no flag to run a single test file via the npm script — pass the file pattern directly:

```bash
pnpm web-test-runner src/components/base/chat.spec.js --config web-test-runner.config.js
```

## Architecture

This is a pnpm workspace package (`packages/chat`). Source is **JavaScript with JSDoc types** — no `.ts` files. Type-checking runs via `tsc --checkJs`.

### Component tree

```
chx-chat              (src/components/base/chat.js)
├── chx-message-list  (src/components/message-list/message-list.js)
└── chx-message-composer (src/components/message-composer/message-composer.js)
```

`chx-chat` is the single public export (`src/index.js`). It orchestrates the layout: message list fills available space, composer is docked at the bottom. Slots (`leading`, `actions`, `flight-icon`, `command-field`) are forwarded from `chx-chat` down into `chx-message-composer`.

`chx-command-field` (`src/components/command-field/command-field.js`) is a sibling component, not part of the default tree — consumers slot it in via `<slot name="command-field">`. Its controller (`src/controllers/CommandFieldController.js`) is currently disconnected from the composer's input path — see "Composer input model" below.

### Composer input model

The composer's editable region is a [ProseMirror](https://prosemirror.net/) `EditorView`, wrapped by a small facade (`src/editor/Editor.js`) so `message-composer.js` never touches ProseMirror internals directly — schema (`src/editor/schema.js`), keymap (`src/editor/keymap.js`), and forced-plain-text paste (`src/editor/paste-plugin.js`) all live under `src/editor/`. Mounted into a **static, binding-free** `<div>` in the Lit template — the mount node must never sit inside a Lit conditional (`when()`/etc.), confirmed live to silently kill the view with no console error otherwise. On send, the composer dispatches a `sendMessage` CustomEvent with `{ value: string, html: string }` in `detail`. The pre-ProseMirror `ContentTextoFormatter` (`src/text-formatter/text-formatter.js`) and the commands feature's Range-based `CommandFieldController`/`CaretOffset` are still present but not wired into this path — commands are a not-yet-started migration onto the same engine (see `.claude/plans/commands.spec.md`).

### Styling conventions

- CSS files are co-located with their component and imported with `?inline` (`import styles from "./chat.css?inline"`). Vite and the test runner each have a plugin to handle this transform into a Lit `CSSResult`.
- SVG icons (`@material-design-icons/svg`) are imported with `?raw` and rendered via `unsafeSVG()`.
- Theming: components consume `--md-sys-color-*` tokens (MD3 system color scale) and expose component-level overrides as `--chx-<component>-*` custom properties.
- Custom elements are registered with the `@customElement` Lit decorator (using the 2023-11 decorator spec, transformed by Babel in both build and test).

### Build output

Vite builds with `preserveModules: true` — each source file maps 1-to-1 to a `dist/` file. `lit` and all `@symblight/wc-material` subpaths are external. `vite-plugin-dts` generates `.d.ts` files and prepends a `/// <reference path="...elements.d.ts" />` triple-slash reference to each output file. `src/elements.d.ts` extends `HTMLElementTagNameMap` with the registered tag names.

### Storybook

Storybook runs on port 6007. The preview (`storybook/preview.js`) injects a floating theme tool (color picker + light/dark select) that drives `@symblight/md-colors/client`'s `generateTheme()` to inject `--md-sys-color-*` tokens live.
