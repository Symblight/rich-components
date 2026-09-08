# Verify — @symblight/chat

Surface is pixels/DOM via Storybook. This package's components (`chx-chat`,
`chx-message-composer`, `chx-command-field`, ...) are deeply nested custom elements with real
shadow DOM at every level — driving them correctly needs shadow-piercing, not plain
`document.querySelector`. The composer's editable region is a ProseMirror `EditorView`
(`src/editor/Editor.js`) as of the ProseMirror migration — see the updated "Minimal working
pattern" below; the old raw-Range/Selection approach no longer applies to it.

## Launch

Check for an already-running instance first — `pnpm sb` binds port 6007 and prompts
interactively ("Port not available, use 6008?") if one's already up, which hangs a
non-interactive/backgrounded shell:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:6007/ --max-time 5
```

`200` → reuse it (don't start a second one). Otherwise:

```bash
cd packages/chat && pnpm sb   # foreground or backgrounded with output redirected to a file you tail
```

## Drive it

Playwright is already a devDependency — run scripts with `node` **from inside `packages/chat`**
(bare `import { chromium } from "playwright"` needs to resolve against that package's
`node_modules`; a script in `/tmp` or a scratchpad dir won't resolve it).

Target a specific story directly via the iframe URL, not the outer Storybook UI:

```
http://localhost:6007/iframe.html?id=<story-kebab-id>--<export-name-kebab>&viewMode=story
```

e.g. `chat--basic` for `title: "Chat"` / `export const Basic`.

### Shadow DOM gotchas (all found by actually doing this, not guessed)

- **Every level needs `.shadowRoot.querySelector(...)` explicitly** —
  `document.querySelector("chx-chat").querySelector("chx-message-composer")` returns `null`;
  `chx-message-composer` is in `chx-chat`'s _shadow_ DOM, not light DOM.
- **The actual editable node is ProseMirror's own `.ProseMirror` element, one level deeper than
  the Lit-rendered mount `<div>`.** `.message-composer__input-content` is just a static wrapper
  (must stay binding-free — see CLAUDE.md's "Composer input model"); PM creates its own
  `contenteditable` child inside it at `.message-composer__input-content .ProseMirror`. Query
  and click/focus _that_, not the wrapper.
- **Drive it with a real mouse click + `page.keyboard.type(...)`, not manual Range/Selection
  construction.** PM owns its DOM and internal `EditorState` — splicing a `Range` into it
  directly (the pre-migration pattern) doesn't reliably reflect back into PM's own selection
  model. A real `page.mouse.click(x, y)` on the `.ProseMirror` element followed by
  `page.keyboard.type(...)` is what's actually been verified working.
- **Read state back through the composer's own properties/facade, not raw DOM.** `composer.value`
  (plain text) is kept in sync via `Editor`'s `onChange`; for the full `{value, html}` shape,
  either listen for the `change`/`sendMessage` event or read `composer.editor.getValue()` /
  `composer.editor.getHTML()` directly (the `Editor` facade at `src/editor/Editor.js`).
- **`slot.assignedElements()` vs `{ flatten: true }` matters whenever a slot forwards through
  more than one level** (e.g. `chx-chat` forwarding `slot="command-field"` into
  `chx-message-composer`'s own same-named slot) — non-flattened resolves to the intermediate
  `<slot>` element itself, not the real assigned content. Silent failure, no error — this cost
  a full debug cycle once already.
- **The commands feature (`chx-command-field`/`CommandFieldController`) is currently
  disconnected** from the ProseMirror-based composer (Phase 2 of the migration, not started —
  see `.claude/plans/commands.spec.md`) — a `WithCommands`-style story typing a trigger
  character is _expected_ to do nothing (no `command-query` fires, no menu opens), not a bug to
  chase until that migration lands.
- **Lit reactivity around the PM mount node**: the mount `<div>` must never sit inside a Lit
  conditional (`when()`/etc.) — confirmed live that violating this silently kills the
  `EditorView` with zero console errors (Lit tears the div down with no lifecycle hook warning
  PM). When verifying a change near the composer's template, a good regression check is forcing
  several reactive re-renders of _sibling_ content (e.g. toggling `.loading`) while the editor
  is focused with text in it, then confirming it's still interactive.

### Minimal working pattern

```js
const chat = document.querySelector("chx-chat");
const composer = chat.shadowRoot.querySelector("chx-message-composer");
const editable = composer.shadowRoot
  .querySelector("md-text-field")
  .querySelector(".message-composer__input-content")
  .querySelector(".ProseMirror");

const rect = editable.getBoundingClientRect();
await page.mouse.click(rect.x + 10, rect.y + 10);
await page.keyboard.type("hello world");
// composer.value / composer.editor.getHTML() now reflect the typed content
```

### Custom events crossing shadow boundaries

Listen at `document` level with `bubbles: true` events (`sendMessage` is
`{ bubbles: true, composed: true }`) — `composed: true` is what lets them cross shadow
boundaries at all; without it a listener outside the dispatching element's shadow tree never
sees them.

## Cleanup

Scratch driver scripts need to live inside `packages/chat/` for module resolution (see
Launch) — remove them (`rm .verify-*.tmp.mjs` or similar) after the run; don't leave stray
`.mjs` files in the package source tree.
