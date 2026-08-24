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
chx-chat                   (src/components/base/chat.js)
├── chx-message-list       (src/components/message-list/message-list.js)      — consumer-authored, optional
└── chx-message-composer   (src/components/message-composer/message-composer.js) — consumer-authored, required
    └── chx-textbox        (src/components/textbox/textbox.js)
```

`chx-chat` is the single public export (`src/index.js`); `chx-message-list`/`chx-message-composer` still register globally the moment `chx-chat`'s module loads (`chat.js` keeps side-effect-importing both purely for `customElements.define()`), but **`chx-chat` no longer renders either itself** — they're plain light-DOM children the consumer places directly inside `<chx-chat>`, same as `chx-command-field` already was:

```html
<chx-chat label="Write your prompt...">
  <chx-message-list></chx-message-list>
  <!-- optional -->
  <chx-message-composer>
    <!-- required in practice -->
    <md-button slot="actions">…</md-button>
    <!-- composer's own slots, not chx-chat's -->
  </chx-message-composer>
</chx-chat>
```

`chx-chat`'s only template is a default slot (layout via `chat.css`'s `::slotted(chx-message-list)`/`::slotted(chx-message-composer)` rules — `order` + `flex: 1 1 auto` on the list, `align-self: center` on the composer, so DOM order in the consumer's markup doesn't matter) plus its own `command-field` slot (unchanged). Because the composer is no longer chx-chat's own template child, chx-chat can't bind Lit properties onto it directly — `label`/`loading`/`commandFields` are pushed onto whatever composer is currently slotted via `pushComposerProperties()`, called both reactively (`updated()`) and on the default slot's `slotchange` (covers a composer that gets (re)assigned after those props were already set). `chx-send-message`/`change` are listened for via plain `addEventListener` on the `chx-chat` host itself (both events bubble/compose, same as any DOM event) rather than a template event binding. The four old `leading`/`actions`/`flight-icon`/`attachments` passthrough slots on `chx-chat` are gone — that mechanism only worked because chx-chat used to own the composer's light DOM declaratively; consumers now target `chx-message-composer`'s own slots directly, as shown above.

`chx-command-field` (`src/components/command-field/command-field.js`) is a sibling component — consumers slot it in via `<slot name="command-field">` on `chx-chat` itself (unaffected by the above, it was never routed through the composer). It's currently a pure trigger (declares `commandCharacter`, renders nothing) — not yet wired into the composer's input path, see "Composer input model" below.

### Composer input model

`chx-message-composer` composes `chx-textbox` — a from-scratch MD3 filled-field container (replacing an earlier `md-text-field`-based implementation, which only exposed `leading`/`trailing` slots and had no room for an attachments row above the input). Unlike the original design, **`chx-textbox` now owns the ProseMirror `EditorView` directly** — it renders `.message-composer__input-content` (a **static, binding-free** `<div>`, see below) itself and constructs the `Editor` facade (`src/editor/Editor.js`) against it in `firstUpdated()`; `chx-message-composer` never touches ProseMirror or the mount div at all. `chx-textbox` is form-associated (`FormControlMixin` + `requiredValidator` from `@open-wc/form-control`, `shadowRootOptions.delegatesFocus = true`) and configured by the composer via plain properties — `label` (applied as the editor's `aria-label`), `placeholder`, `getCommandFields` (a function returning the live `Map` chx-chat tracks) — and reacts to a bubbling `chx-textbox-change` event (detail `{value, html}`, replaces the composer's own value on every doc-changing transaction) and `chx-command-selected` (dispatched by `chx-textbox` directly now, no composer pass-through needed). Public methods `getValue()`/`getHTML()`/`focus()`/`focusEnd()`/`clear()`/`insertAtCommand()` are how the composer drives it — e.g. on send: `textboxElement.getValue()`/`getHTML()`/`focus()`, then `clear()`. It exposes three slots — `leading` (e.g. a future "+" attach/upload trigger), `attachments` (attachment previews, rendered above the input), and `trailing` (the send button/actions-wrapper, composer-authored) — no default slot anymore, since the mount div is chx-textbox's own internal node, not something the composer slots in. `leading`/`attachments`/`trailing` reflow between a one-line and a stacked 3-row layout **purely via CSS** (`textbox.css`'s `:has(.textbox__attachments ::slotted(*))` rule forces the content column onto its own line once `attachments` holds anything, no JS layout state).

Schema (`src/editor/schema.js`), keymap (`src/editor/keymap.js`), forced-plain-text paste (`src/editor/paste-plugin.js`), and the placeholder decoration plugin (`src/editor/placeholder-plugin.js`) all live under `src/editor/`, consumed only by `Editor.js`/`textbox.js` now. The mount node must never sit inside a Lit conditional (`when()`/etc.) or carry a dynamic binding (e.g. a reactive `class`), confirmed live to silently kill the view with no console error otherwise. On send, the composer dispatches a `chx-send-message` CustomEvent with `{ value: string, html: string }` in `detail`. The pre-ProseMirror `ContentTextoFormatter` (`src/text-formatter/text-formatter.js`) is still present but not wired into this path — commands are a not-yet-started migration onto the same engine (see `.claude/plans/commands.spec.md`).

### Styling conventions

- CSS files are co-located with their component and imported with `?inline` (`import styles from "./chat.css?inline"`). Vite and the test runner each have a plugin to handle this transform into a Lit `CSSResult`.
- SVG icons (`@material-design-icons/svg`) are imported with `?raw` and rendered via `unsafeSVG()`.
- Theming: components consume `--md-sys-color-*` tokens (MD3 system color scale) and expose component-level overrides as `--chx-<component>-*` custom properties.
- Custom elements are registered with the `@customElement` Lit decorator (using the 2023-11 decorator spec, transformed by Babel in both build and test).

### Build output

Vite builds with `preserveModules: true` — each source file maps 1-to-1 to a `dist/` file. `lit` and all `@symblight/wc-material` subpaths are external. `vite-plugin-dts` generates `.d.ts` files and prepends a `/// <reference path="...elements.d.ts" />` triple-slash reference to each output file. `src/elements.d.ts` extends `HTMLElementTagNameMap` with the registered tag names.

### Storybook

Storybook runs on port 6007. The preview (`storybook/preview.js`) injects a floating theme tool (color picker + light/dark select) that drives `@symblight/md-colors/client`'s `generateTheme()` to inject `--md-sys-color-*` tokens live.
