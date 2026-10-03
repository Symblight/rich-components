# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

From this package directory (`packages/code-editor`):

```bash
pnpm sb              # Storybook dev server (port 6009)
pnpm dev             # Vite dev server
pnpm build           # Build to dist/ (clears dist/ first)
pnpm test            # Run tests with @web/test-runner + Playwright
pnpm lint            # ESLint
pnpm typecheck       # tsc --noEmit (JSDoc type-check, no emit)
pnpm format          # Prettier
```

From the monorepo root:

```bash
pnpm --filter @symblight/code-editor sb
pnpm --filter @symblight/code-editor test
pnpm --filter @symblight/code-editor build
```

Tests match `src/**/*.spec.js` and run in Chromium via Playwright. There is no flag to run a single test file via the npm script — pass the file pattern directly:

```bash
pnpm web-test-runner src/__tests__/code-editor.spec.js --config web-test-runner.config.js
```

## Architecture

This is a pnpm workspace package (`packages/code-editor`, `@symblight/code-editor`). Source is **JavaScript with JSDoc types** — no `.ts` files. Type-checking runs via `tsc --checkJs`.

`cdx-code-editor` (`src/components/code-editor/`) is a Lit shell around a CodeMirror 6 `EditorView` mounted into its shadow root. `src/elements.d.ts` extends `HTMLElementTagNameMap` and `HTMLElementEventMap`.

Layout, like packages/chat — one folder per element, `<name>.js` + `<name>.css`:

- `src/components/` — every rendering element: `code-editor/` plus the pieces it renders in its shadow root: `review-bar/` (`cdx-review-bar`), `status-bar/` (`cdx-status-bar`), `problems-indicator/` (`cdx-problems-indicator`), `quick-fix/` (`cdx-quick-fix`), `go-to-line/` (`cdx-go-to-line`). They take data as properties and report back with plain (non-composed) events the editor listens to in its own template.
- `src/features/diff/` — everything diff: `cdx-diff` (config), `DiffController`, the CodeMirror pieces (`baseline.js`, `review.js`, `gutter.js`, `shared.js`), and `diff.css` (adopted by the editor: chunk headers are CodeMirror DOM in the editor's shadow root). Behavior lives here; the review bar's UI is a component.
- `src/features/footer/` — the opt-in status bar: `cdx-footer` (config, `slot="footer"`), `FooterController` (builds the bar's model from the caret, symbols, diff and language; re-renders the host at most once a frame) and `footer.css` (its tokens, on the editor host). The UI is `components/status-bar/` (`cdx-status-bar`); file-level clicks leave the editor as `cdx-status-click`, editor ones (position, diff toggle, symbol menu) are handled inside.
- `src/controllers/`, `src/core/` (incl. `icons.js`, shared by the components and the diff widgets).
- `src/types/api.js` — the public namespace typedefs.
- **Tokens stay on the editor host** (`code-editor.css`, `diff.css`): internal components only read them, never redeclare them, so a consumer's override on `cdx-code-editor` reaches inside by inheritance. Public part names are kept through `exportparts` on each internal element (`review-label`, `problems-button`, `quick-fix-bulb`, …). A state goes in the part name (`part="bar done"` → `review-done`), since `::part()` can't take attribute selectors.

The element only declares properties, delegates its public API and renders; all logic lives in controllers, one concern each:

- `EditorViewController` — owns the view: mount, destroy on disconnect while keeping the state, remount on reconnect, `replaceState` for tab switches. The others touch CodeMirror only through its `state`, `dispatch`, `subscribe(before, after, transactions)` and `onReplace(state)` (a swapped-in state comes with no transaction).
- `ValueController` (`value`/`defaultValue`, `cdx-change`), `SelectionController` (`setSelection`, `cdx-selection-change`), `ConfigController` (feature/readOnly/placeholder/label/`extensions` compartments), `LanguageController` (`plugins`, `language`, `filename`), `DiagnosticsController` (`diagnostics`, problem counts), `DiffController` (`src/features/diff/`, `baseline`/`reviewBase`, `<cdx-diff>` configs, review bar, `cdx-review-base-change`/`cdx-diff-change`/`cdx-review-complete`, F7), `QuickFixController` (lightbulb + `md-rich-tooltip`, Mod-.), `SymbolsController` (`outline`, `symbolPath`, `cdx-symbols-change`), `GoToLineController` (Ctrl-G card, `goTo`), `DocController` (`doc` namespace: `replace`, undo/redo, line ↔ offset), `SearchController` (`search` namespace over `@codemirror/search`).

- **Public API** (spec: `.claude/plans/code-editor-public-api.spec.md`): seven namespaces — `doc`, `selection`, `navigation`, `search`, `diff`, `problems`, `comments` — built once as a frozen `#api` in `code-editor.js` (typed `CdxCodeEditorApi`, so tsc checks the names), delegating to the controllers. No registry and no reactive consumer controller — state changes are observed through `cdx-*` events. Kept on the element: `value`, `state`/`createState`, `view`, `focus()`, getters `activeLanguage`/`outline`/`symbolPath`/`diffStats` (not duplicated in namespaces). Actions never move focus except `open*`. `doc.replace` ignores `readOnly` but runs `cdx-before-change` with `userEvent: "api"`; CodeMirror's undo/redo/replace commands refuse under `readOnly`.
- Property-driven controllers expose `update(changed)`, called from the host's `updated()`, and an `extension` of empty compartments for the initial state. Base extensions that no property controls are `baseSetup()` in `src/core/setup.js`.
- **Tabs:** properties are either editor-level (features, readOnly, placeholder, label, `extensions`, `plugins`) or document-level (text, history, language, `baseline`/`reviewBase`, diagnostics, `createState`'s `extensions`). `createState()` builds a state with every compartment; the `state` setter only accepts those (`ConfigController.owns`) and re-applies editor-level settings via `ConfigController.effects(ALL)` + `LanguageController.pluginEffects()`. `activeLanguage` is read from the state's `language` facet, so it follows a tab switch.
- **`cdx-before-change`** is an `EditorState.changeFilter`: it runs while the transaction is built, so listeners must not dispatch.

- **Every configurable property is a `Compartment`**, filled by the first `updated()` (which sees every property as changed) and reconfigured on change — never recreate the view for a property.
- **Value:** `defaultValue` (uncontrolled) or `value` (controlled). A set `value` is diffed against the doc (`src/core/diff-text.js`) and dispatched with the `external` annotation, outside undo history, so it isn't echoed as `cdx-change`. `doc.toString()` is cached by `Text` identity — keep it off any per-keystroke path. Events fire from `dispatchTransactions` _after_ `view.update`, so a listener may set `value` synchronously.
- **Language-agnostic core:** the main entry imports no grammar. Consumers pass `plugins` (`CdxPlugin`, `src/core/plugin.js`): `languages` (lazy `LanguageDescription`s), always-on `extensions`, and `forLanguage` extensions loaded only while that language is active. `language` wins over `filename` (matched by extension). Repeated plugins (overlapping presets) count once.
- **`@symblight/code-editor/presets`** (`src/presets/index.js`, a second build entry) builds per-language plugins and JetBrains-style presets (`webPreset`, `pythonPreset`, `rustPreset`, `dotnetPreset`, …, `allPreset`) from `@codemirror/language-data` by name. It adds style-guide indentation (`INDENT`), short aliases language-data lacks (`EXTRA_ALIASES`, e.g. `py`, `rs`), and a Markdown that highlights fenced code. Nothing in `src/` outside `presets/` may import it, or the main entry would pull the grammar catalog in.
- **Library-mode build** (`build.lib`): without it Vite wraps the presets' lazy `import()` in `__vitePreload`, which dispatches `vite:preloadError` on the consumer's `window`.
- **`@symblight/code-editor/lsp`** (`src/lsp/index.js`, third build entry): `createLspClient`, `lspDocument` (per-document, goes into `createState`), `lspSymbols`. `@codemirror/lsp-client` is an _optional_ peer — nothing outside `src/lsp/` may import it.
- **`@codemirror/*` and `@lezer/*` are external peer deps**; a second copy of `@codemirror/state` breaks every extension with "Unrecognized extension value". After bumping CodeMirror here or in `packages/chat`, run `pnpm dedupe` at the root.
- **Features** (`src/core/features.js`): line numbers, folding, active line, bracket matching and indent guides are on by default, so each is an opt-out `no-*` attribute (`OPTIONS` in `ConfigController`); `wrap`, `tab-size`, `density` are opt-in. `OPTIONS` order is compartment order: line numbers before folding keeps the gutters in that order, consumer `extensions` last. Indent guides come from `@replit/codemirror-indentation-markers` (external dependency — without the `external` entry Vite copies it into `dist/node_modules`).
- **Diagnostics:** `diagnostics` (pushed, e.g. from an LSP) goes through `setDiagnostics`; plugin linters work too. The problems pill recounts only on `setDiagnosticsEffect`, and stays hidden while `diagnostics` is `null` and nothing reported any. The lint _hover_ tooltip stays CodeMirror's own (restyled); only the quick-fix menu is `md-rich-tooltip`, anchored to a real button in the shadow root — CodeMirror decorations have no stable element to anchor to.
- **Diff** (`src/features/diff/`, spec §8 "Diff и ревью"): two fixed layers, never N sources. `baseline.js` — HEAD: a `StateField` of `Chunk`s updated with `Chunk.updateB`, marks only, one chunk peeked on a mark click (or all with `expanded`), Revert. `review.js` — proposals: `unifiedMergeView` with `mergeControls: false`; our `ChunkHeaderWidget` sits at `side: -2`, above merge's own deleted block at `side: -1`; accept/reject-all are one transaction each. `gutter.js` — the one change column both layers share (review marks win). `shared.js` — header/ghost widgets, `gutterWidgetClass` tints so fills run through every gutter (merge's deletion widget isn't exported — recognised by its `buildDOM` shape), the sticky-header geometry (`--cdx-gutters-width`, `--cdx-text-width`), the accept flash. Configuration is `<cdx-diff slot="diff" kind>` (`features/diff/diff.js`, a chx-divider-style light-DOM config carrier that fires `cdx-diff-config`); data is the host's `baseline`/`reviewBase` or `createState`'s. The active line is a `background-image` layer so diff fills survive under it. Tone colors come from per-tone public tokens (`--cdx-diff-tone-<tone>-*`) mapped to private `--_accent`/`--_surface`/… by tone classes — never redeclare a public token on an inner element.
- **`md-avatar`'s `--md-avatar-size` is a radius**: 10px renders 20px.
- **Symbols** (`src/core/symbols.js`): `symbolProvider` facet (last wins; may be async), default `syntaxTreeSymbols` walks declaration node names across grammars. The outline is rebuilt debounced and only when the tree/provider changed.
- **Search** (`src/core/search.js`): own MD3 panel via `search({ createPanel })`; panel inputs forward non-Enter keys with `runScopeHandlers(view, event, "search-panel")`, or Escape/F3 stop working there.
- **`@symblight/md-colors` omits `--md-sys-color-surface-container`** — `tokens.css` falls back to a low/high mix, and `md-rich-tooltip` gets its container color through `--md-rich-tooltip-container-color`.
- **Theme:** `src/core/theme.js` (`EditorView.theme`, reads only `--cdx-*` component tokens) plus `tok-*` classes from `classHighlighter`, colored by `--cdx-syntax-*` in `code-editor.css`.

### Styling conventions

- CSS files are co-located with their component and imported with `?inline` (`import styles from "./code-editor.css?inline"`). Vite and the test runner each have a plugin to handle this transform into a Lit `CSSResult`.
- Custom elements are registered with the `@customElement` Lit decorator (2023-11 decorator spec, transformed by Babel in both build and test).
- **Theming is three tiers:** `--md-sys-*` → `--cdx-code-editor-*` → `--cdx-<component>-*`.
  - `src/styles/tokens.css` is adopted **first** in every rendering component's `styles` (`static styles = [tokens, styles]`). It resolves each public `--cdx-code-editor-*` (typography, MD3 color roles, shape) into a private `--_cdx-*` on that host, falling back to `--md-sys-*`.
  - Component tokens and rules read **only** `--_cdx-*`, never `--md-sys-*` directly.
  - **Never declare a `--cdx-code-editor-*` in any component, `cdx-code-editor` included** — a declaration on a nested host would hide the value a consumer set on an ancestor. Declaring only the private resolver on every host keeps ancestor overrides and standalone defaults both working.
  - Component tokens are `--cdx-<component>-*` (e.g. `--cdx-content-padding`), declared on `:host` in that component's CSS with a default mapped from `--_cdx-*`. Because the root component is itself named `code-editor`, its own tokens must not use the `--cdx-code-editor-*` prefix — that namespace is the public theme.
  - `tokens.css` bridges `--md-sys-typescale-*-font` (only the `*-font` roles — bridging a size or color would create a cycle with the resolver) so `md-*` children follow `--cdx-code-editor-font-family`.
  - To add a token: add the `--_cdx-<name>: var(--cdx-code-editor-<name>, <md-sys fallback>)` line to `tokens.css`, then consume `--_cdx-<name>`.
- **Overriding, from most to least broad:** `--md-sys-*` on any ancestor (retunes everything, including `md-*` children) → `--cdx-code-editor-*` on `cdx-code-editor` or an ancestor (retunes this package only) → `--cdx-<component>-*` on one component → `::part()` for anything else.
- `::part()` only forwards one shadow level — nested components need an `exportparts` chain at every intermediate host.

### Build output

Vite builds with `preserveModules: true` — each source file maps 1-to-1 to a `dist/` file. `src/styles/tokens.css` is copied verbatim to `dist/tokens.css` (`@symblight/code-editor/tokens.css`) by a small `closeBundle` plugin in `vite.config.mjs`, for apps that want the token layer in their own shadow roots. `lit` and all `@symblight/wc-material` subpaths are external. `vite-plugin-dts` generates `.d.ts` files and prepends a `/// <reference path="...elements.d.ts" />` triple-slash reference to each output file.

### Code comments

Keep JSDoc and comments minimal. A custom element's class-level JSDoc is just `@tag`/`@summary`, one short line each — no prose paragraphs, no `@param`/`@returns` walkthroughs, no restating what the code already says. Comment only what isn't obvious from reading the code itself (a non-obvious constraint, a workaround, a gotcha).

### Storybook

Storybook runs on port 6009. The preview (`.storybook/preview.js`) injects a floating theme tool (color picker + light/dark select) that drives `@symblight/md-colors/client`'s `generateTheme()` to inject `--md-sys-color-*` tokens live.
