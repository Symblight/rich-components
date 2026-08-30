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
chx-chat                    (src/components/base/chat.js)
├── chx-message-list        (src/components/message-list/message-list.js)      — consumer-authored, optional
│   ├── chx-infinity-scroll (src/components/infinity-scroll/infinity-scroll.js) — generic virtualized list, see below
│   │   └── chx-message      (src/components/message/message.js)               — built-in, or swap via `messageElement`
│   ├── chx-typing-indicator    (src/components/typing-indicator/…)            — standalone, consumer slots it in, see below
│   └── chx-streaming-indicator (src/components/streaming-indicator/…)         — standalone, consumer slots it in, see below
└── chx-message-composer    (src/components/message-composer/message-composer.js) — consumer-authored, required
    └── chx-textbox         (src/components/textbox/textbox.js)
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

### Message list internals — virtualization moved out to `chx-infinity-scroll`

`chx-message-list` no longer owns virtualization, scroll-position management, or load-more detection itself — that's `chx-infinity-scroll`, a generic, message-agnostic component (`.data`/`.itemKey`/`.renderItem`/`.scrollBehavior` in, `chx-load-more` event out, `scrollToIndex()`/`scrollToBottom()` methods). `chx-message-list`'s own `#renderItem` builds a `<chx-message>` (or calls the consumer's `messageElement`) and hands it to infinity-scroll's `.renderItem` — infinity-scroll never knows what a "message" is. `ScrollBehaviorController` (stick-to-bottom + history-anchor preservation across a pagination prepend, *and* the sentinel-watching/`IntersectionObserver` load-more trigger — merged into one controller, directly requested) and `IntersectionController`/`ResizeController` all live under `src/components/infinity-scroll/`, not `src/controllers/` — they're infinity-scroll's own concern now, not shared chx-chat-level controllers. `chx-message-list`'s `scroll-behavior="auto" | "smooth"` attribute (forwarded straight through to infinity-scroll) governs `scrollToBottom()`'s animation, for both the explicit public method and the automatic stick-to-bottom follow.

`FocusBehaviorController` (roving tabindex over messages) stayed in `src/controllers/` — it's message-specific UI, not generic list mechanics — but a real cross-component update-cascade bug was found and fixed live: calling `this.#host.requestUpdate()` (host = `chx-message-list`) does **not** re-render `chx-infinity-scroll`, since none of the properties passed to it change by reference on a plain host re-render — Lit's `PropertyPart` skips re-setting them. `FocusBehaviorController` now takes an injected `requestRerender` callback that also calls `infinityScrollElement.requestUpdate()` directly. Likewise, focus-follow after `scrollToIndex()` can't rely on the host's own `hostUpdated()` firing again once the scrolled-to item mounts (infinity-scroll's own internal settling renders never cascade back up) — it polls via a capped `requestAnimationFrame` loop instead.

### Typing / streaming indicators — opt-in, no default content, ever

`chx-message-list` exposes two slots, `typing` and `streaming`, each gated by a boolean property (`typing`/`streaming`) pushed down from `chx-chat`. **Neither has default/fallback content, and `chx-message-list` does not import or auto-register the components that fill them** — same connection as `<chx-command-field>`/`<chx-command-picker>` already establish: a standalone component the app imports and slots in itself (`<chx-typing-indicator slot="typing">` inside `<chx-message-list>`), or nothing renders, full stop, regardless of what the boolean says. An earlier pass of this bundled a default `<chx-typing-indicator>` as the slot's native fallback content — reverted, directly requested, to match the command-field precedent exactly rather than half-matching it.

- **`typing`** — `chx-chat.setTyping(isTyping)` (public method) or `adapter.subscribe`'s optional `onTyping` handler, both funnel into `TypingController` (`src/controllers/TypingController.js`, a plain stateful helper, not a real `ReactiveController` — no lifecycle hook to hang off). A plain boolean, not per-conversation/per-user — this package has neither concept. Fires `chx-typing-change` when the value actually changes (latched, no re-fire for a repeated call with the same value).
- **`streaming`** — fully automatic, no public method: `chx-chat`'s `#isWaitingForReply()` derives it fresh each render from `#activeDeliveries` (a delivery is in flight) vs. whether `#internalMessages` already has a reply shell for it (`replyToId` match) — true from the instant a send starts until the first chunk lands, `false` once a message exists even while its parts are still `state: "streaming"` (that in-message case is a deliberately different, unimplemented concern, see below).
- `chx-typing-indicator` (text label, `value` prop, default `"Typing…"`, `aria-live="polite"`) and `chx-streaming-indicator` (a decorative dots bubble, `aria-hidden`, styled like an incoming not-own message) are deliberately different shapes — grounded in MUI X Chat's own real `TypingIndicator`/`StreamingIndicator` split (their real source was read, not guessed): presence gets an announced label, "response in flight" gets silent decorative dots because streaming start/finish is already announced by `chx-message-list`'s own `role="status"` region. MUI's in-message "dots inside the streaming bubble" phase (their `StreamingIndicator` mounted *inside* a message) has no equivalent here — would need a per-message/per-part hook, not a list-level slot; not built.

### `chx-message` — avatar / meta / content / actions slots

`chx-message` (`src/components/message/message.js`) exposes four slots: `avatar`, the default slot (message content/parts), `meta` (author label, timestamp, etc.), and `actions` (per-message actions like copy/retry). `:host([own])` now also sets `flex-direction: row-reverse` (on top of its existing `align-self: flex-end`) so avatar/body order flips for own messages too. `--chx-message-*` custom properties (`padding`, `border-radius`, `background-color`, `own-background-color`, `avatar-gap`, `meta-gap`, `actions-gap`) are the public theming surface, defaulting to `--md-sys-color-*` tokens.

`avatar`/`meta`/`actions` cost zero space when nothing's slotted — via `.message__avatar ::slotted(*) { margin-inline-end: … }` etc., **not** a `:has(::slotted(*))` gate on the wrapper. `:has()` combined with `::slotted()` was tried first and confirmed live, in isolation, to never match in this package's tested Chromium build — not a syntax mistake, an actual unsupported combination right now. `::slotted(*)` alone doesn't need the `:has()` gate at all: it only ever matches when something is genuinely assigned, so the margin naturally costs nothing when the slot is empty.

### Styling conventions

- CSS files are co-located with their component and imported with `?inline` (`import styles from "./chat.css?inline"`). Vite and the test runner each have a plugin to handle this transform into a Lit `CSSResult`.
- SVG icons (`@material-design-icons/svg`) are imported with `?raw` and rendered via `unsafeSVG()`.
- Theming: components consume `--md-sys-color-*` tokens (MD3 system color scale) and expose component-level overrides as `--chx-<component>-*` custom properties.
- Custom elements are registered with the `@customElement` Lit decorator (using the 2023-11 decorator spec, transformed by Babel in both build and test).
- **`::part()` only forwards one shadow level.** A page-level (or even a grandparent component's) `::part()` rule cannot reach an element nested two-or-more shadow roots deep — e.g. `<chx-message>`, which lives inside `chx-infinity-scroll`'s shadow root, itself inside `chx-message-list`'s — without an `exportparts` chain at *every* intermediate host. Confirmed live: a page-level `chx-message::part(actions)` rule silently matches nothing at that depth. **The same is true for a CSS custom property set via a selector**, not `element.style.setProperty()` — a page-level `chx-message { --chx-message-background-color: … }` rule doesn't reach that deep either, for the same "a rule is scoped to the tree it's defined in" reason; only the initial assumption that custom properties are somehow exempt from this was wrong. For deeply-nested customization (see `chat.stories.js`'s `renderCustomMessage`, and its hover/focus action-button reveal), the reliable mechanism is setting properties directly on the actual DOM node via `element.style.setProperty(...)`/plain DOM event listeners, or writing the CSS inside the target component's own shadow-scoped stylesheet.

### Build output

Vite builds with `preserveModules: true` — each source file maps 1-to-1 to a `dist/` file. `lit` and all `@symblight/wc-material` subpaths are external. `vite-plugin-dts` generates `.d.ts` files and prepends a `/// <reference path="...elements.d.ts" />` triple-slash reference to each output file. `src/elements.d.ts` extends `HTMLElementTagNameMap` with the registered tag names.

### Code comments

Keep JSDoc and comments minimal. A custom element's class-level JSDoc is just `@tag`/`@summary`, one
short line each (see any component under `src/components/`) — no prose paragraphs, no `@param`/
`@returns` walkthroughs above every method, no restating what the code already says. Comment only what
isn't obvious from reading the code itself (a non-obvious constraint, a workaround, a gotcha).

### Storybook

Storybook runs on port 6007. The preview (`storybook/preview.js`) injects a floating theme tool (color picker + light/dark select) that drives `@symblight/md-colors/client`'s `generateTheme()` to inject `--md-sys-color-*` tokens live.
