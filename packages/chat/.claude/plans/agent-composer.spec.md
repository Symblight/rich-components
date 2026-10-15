# Agent composer — spec

**2026-10-15: §2 built (composer only, incl. §2.5 `busy-action`, user-approved). §3–§4 dropped
from the package: the user decided the pickers, menus and context ring are consumer-side; the
composer only provides slots, styles and properties (docs: `src/docs/agentic.md`, "Composer for agent
controls").** Original draft: Same conventions as the other specs (🚧 = open, ✅ = implemented
and verified). Source design: the `acp-message-composer` v2 page ("agent controls") for Brama, the ACP
client that consumes this package. Gap analysis made against `src/` at `2ac4da7`.

Scope: **this package renders, it does not speak ACP** (same rule as `agentic-tools.spec.md`). The
consumer owns the connection and hands the elements ACP data as-is; the elements fire events the
consumer turns into ACP requests. Supersedes the `chx-mode-switcher` sketch in
`.claude/plans/agentic-tools.spec.md` (repo root).

## 1. Target

Two rows inside the field, always: text on top, controls below. Under the field, a tray the consumer
fills (Brama: Local / Worktree / Docker and branch).

```
╭───────────────────────────────────────────────────────────────╮  ← composer surface
│ ╭───────────────────────────────────────────────────────────╮ │     (surface-container-high)
│ │ Describe a task, @ to mention, / for commands             │ │  ← field (surface-container-lowest,
│ │ [+] [C Codex · GPT 5.6 Terra 🧠High ▾]   [⚡Agent ▾] (◔27%) (↑)│ │     1dp outline-variant, 2dp primary on focus)
│ ╰───────────────────────────────────────────────────────────╯ │
│  [💻 Local ▾] [⑂ main ▾]                                       │  ← footer slot (consumer's)
╰───────────────────────────────────────────────────────────────╯
```

| # | Part | Who builds it |
|---|---|---|
| 1 | Field, 15/22 text | package (exists) |
| 2 | Attach button | consumer, `leading` slot (exists) |
| 3 | Agent · model · thinking button + menu | **package, new: `chx-model-picker`** |
| 4 | Permission mode chip + menu | **package, new: `chx-mode-picker`** |
| 5 | Context ring + popover | **package, new: `chx-context-usage`** |
| 6 | Send / stop | package (exists, needs changes §2.4–2.5) |
| 7 | Tray | consumer, **new `footer` slot** |

What the consumer keeps: the agent list, the tray's content, the snackbar when the agent changes a
model itself ("Codex switched to GPT 5.6 Mini after a rate limit · Undo"), voice (not planned).

## 2. Composer changes (`chx-message-composer`, `chx-textbox`)

The app can't make any of these from outside.

### 2.1 🚧 Forced two-row layout

`chx-textbox` shows one row (`simplified`) until the content wraps (`#updateLayout`, `textbox.js:275`).
The design's controls only fit when they're always below the text: a picker in `leading` would otherwise
sit left of a one-line field.

- New `layout` on `chx-message-composer`: `"auto"` (default, today's behaviour) | `"stacked"`. Reflected,
  pushed down to `chx-textbox` like `compact`.
- `stacked`: `simplified` is always `false`. `#updateLayout` returns early; `setText("")` / `clear()`
  don't set it back.
- With `stacked`, the controls row holds `leading` (start) and `trailing` (end); the text row spans the
  width. That is the existing `.textbox__row` grid, so no new CSS grid.

### 2.2 🚧 `footer` slot

`chx-message-composer` renders only the suggestions and command-field slots and the `<form>`. Nothing
can go under the field.

- New `<slot name="footer">` after the `<form>`, in `<div class="message-composer__footer" part="footer">`.
- When the slot has content (`:host(:has([slot=footer]))` or a `has-footer` state set on slotchange),
  the host draws a surface around field and footer:
  - `--chx-message-composer-background` (default `transparent`; Brama sets
    `surface-container-high`),
  - `--chx-message-composer-shape` (default `var(--_chx-shape-corner-extra-large)`),
  - `--chx-message-composer-footer-padding` (default `0.125rem 0.75rem`), min height 40px.
- Without footer content, nothing changes: no background, no padding.

### 2.3 🚧 Field outline, focus and parts

`textbox.css` has background, shape and padding tokens, but no outline or focus ring. `chx-textbox`'s
parts can't be reached either: `chx-message-composer` renders it with `part="textbox"` and no
`exportparts`.

- New tokens on `chx-textbox`: `--chx-textbox-outline-color` (default `transparent`),
  `--chx-textbox-outline-width` (default `1px`), `--chx-textbox-focus-outline-color` (default
  `transparent`), `--chx-textbox-focus-outline-width` (default `2px`). Drawn with an inset
  `box-shadow` on `.textbox` (no layout shift), focus via `:focus-within`.
- Hover tint stays, but not while focused (design: hover 4%, none on focus).
- `exportparts` on the inner `chx-textbox`, prefixed so names don't clash with the composer's own:
  `box:textbox-box, row:textbox-row, content:textbox-content, leading:textbox-leading,
  trailing:textbox-trailing, action:textbox-action, attachments:textbox-attachments,
  drop-hint:textbox-drop-hint`.

### 2.4 🚧 Send button always visible

Today the button renders only when `loading || (value !== "" && !disabled)` (`textbox.js:374`). In the
stacked row the mode chip and the context ring sit beside it, so they jump ~36px on the first keystroke.

- New `send-button` on `chx-message-composer` (pushed down): `"auto"` (default, today) | `"always"`.
- `always`: an empty draft shows the button **disabled** (MD3: container on-surface 12%, icon 38%),
  not hidden. Disabled composer: disabled too.

### 2.5 🚧 Decision: what the button does while a turn runs and the draft has text

Today: `#stopping` is `loading && !value.trim()` (`textbox.js:339`), so typing during a turn turns Stop
into Send. The design shows Stop while typing ("Agent is working… you can type the next message").
ACP runs one prompt per session at a time; whether a second one is queued is the consumer's call.

Recommended: separate the button from Enter.

- New `busy-action` (pushed down): `"send"` (default, today) | `"stop"`.
- `stop`: while `loading`, the button is always Stop, whatever the draft.
- Enter still submits. `chx-send-message` is still fired and still cancelable, so the consumer queues
  the message or vetoes it (`preventDefault()` keeps the draft).

Confirm with the user before building.

### 2.6 Small fixes

- `:host([disabled])` uses `opacity: .5`. MD3 is 38% for content and an on-surface 4% container. Move to
  the MD3 values or expose `--chx-textbox-disabled-opacity`.
- `chx-suggestion-list` / `chx-suggestion` exist in `src/components/` and `chx-message-composer`
  already reads `chx-suggestion-list`, but neither element is exported. Add both to `src/composer.js`
  (and `elements.d.ts` if missing), so `@symblight/chat/composer` registers them. `dist` in Brama has
  only their `.d.ts`.

## 3. ACP data, as the elements take it

Types go in `src/types/` as JSDoc typedefs, mirroring the ACP schema 1:1. Field names checked against
agentclientprotocol.com (session config options, schema) on 2026-10-15.

```js
/**
 * @typedef {Object} ChxConfigOptionValue
 * @property {string} value
 * @property {string} name
 * @property {string} [description]
 *
 * @typedef {Object} ChxConfigOptionGroup
 * @property {string} group
 * @property {string} name
 * @property {ChxConfigOptionValue[]} options
 *
 * @typedef {Object} ChxConfigOption
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {string} [category] "mode" | "model" | "model_config" | "thought_level" | "_custom" | unknown
 * @property {"select" | "boolean" | string} type
 * @property {string | boolean} currentValue
 * @property {ChxConfigOptionValue[] | ChxConfigOptionGroup[]} [options] Flat or grouped, never mixed; absent for boolean.
 *
 * @typedef {Object} ChxAgent
 * @property {string} id
 * @property {string} name
 * @property {string} glyph 1–2 letters for the 20px badge.
 * @property {boolean} [available] false: shown, not selectable.
 *
 * @typedef {Object} ChxCost
 * @property {number} amount Cumulative for the session.
 * @property {string} currency ISO 4217.
 */
```

Rules that come from ACP and apply to every element:

- **Order is the agent's priority.** Show options in array order. When space runs out, the later ones
  go first (§4.4).
- **Unknown `type`: skip the option.** Unknown or missing `category`: treat it as "other".
- `boolean` options exist only if the consumer advertised them; render them when present (§4.1).
- **Controlled.** Elements never mutate `configOptions`. A pick fires an event; the consumer sends
  `session/set_config_option` and assigns the full list from the response, or from a later
  `config_option_update`. A model change can change the thinking levels; the new list carries that.

## 4. New elements (`@symblight/chat/agent`)

All three are registered by importing `@symblight/chat/agent`, like the other agentic elements. They're
slotted into the composer by the consumer. Menus are `md-menu` from `@symblight/wc-material` (it
already has submenus, `md-item-group` gap groups, `md-menu-group` headers and `variant="vibrant"`).

### 4.1 `chx-model-picker`: agent · model · thinking

Text button, 32px: agent badge (20px), `"<agent> · <model>"`, then the thinking level in secondary color
with a `psychology` icon, then `arrow_drop_down`. One button, one menu.

| Property | Type | Notes |
|---|---|---|
| `configOptions` | `ChxConfigOption[]` | Whole list. The picker uses `model`, `thought_level`, `model_config` and the "other" ones (not `mode`). |
| `agents` | `ChxAgent[]` | Consumer's list. |
| `agentId` | `string` | Current agent. |
| `agentLocked` | `boolean` | Session started: the agent can't change any more. |
| `condensed` | `boolean` | Reflected; see §4.4. |

| Event | Detail | Consumer does |
|---|---|---|
| `chx-config-change` | `{ configId, value }` | `session/set_config_option` (`type: "boolean"` added for booleans) |
| `chx-agent-change` | `{ agentId }` | New session with that agent (only before the first message) |

Menu (`placement` top-start):

1. **Agents** (`md-item-group`). Each agent is an item with its badge. The **current** agent's item has a
   submenu (cascade); other agents are plain items, since their models aren't known before their
   session exists. `available: false` → `aria-disabled`. With `agentLocked`, the group is one row for
   the current agent with a `lock` trailing icon. Its submenu still works.
2. **Submenu of the current agent:**
   - model options (`category: "model"`): flat → one group; grouped → one `md-menu-group` per ACP group,
     with the group's `name` as its header. `description` → supporting text.
   - `thought_level` → its own group, labelled with the option's `name`. The design draws it as a
     horizontal segmented row; `md-menu` has none (see §6), so v1 is a vertical group of radio items.
   - `model_config` and other `select` options → one item each, `name` + current value as trailing
     text, opening a submenu with its values.
   - `boolean` options → one checkable item each.
3. Menu sizing comes from wc-material's tokens. Only the items are the package's.

No `thought_level` option → no level in the button, no group. No `model` option → the button shows the
agent alone.

### 4.2 `chx-mode-picker`: permission mode chip

Assist chip, 28px: icon, mode name, `arrow_drop_down`. Uses the first option with `category: "mode"`.
None → the element renders nothing (`display: none` on the host).

| Property | Type | Notes |
|---|---|---|
| `configOptions` | `ChxConfigOption[]` | Whole list. |
| `appearance` | `(value: ChxConfigOptionValue) => { icon?: string, tone?: ChxModeTone }` | Consumer maps modes to an SVG and a tone. Not set, or `undefined` back → neutral, no icon. |
| `condensed` | `boolean` | Icon only (the name stays in `title` and the accessible name). |

`ChxModeTone` = `"neutral" | "secondary" | "tertiary" | "error"`. The tone is the chip's container:
neutral = outline only; others = `<tone>-container` / `on-<tone>-container`. Brama's mapping: Plan
secondary, Ask neutral, Agent tertiary, Full access error. The package knows nothing about risk.

Fires `chx-config-change` `{ configId, value }`. Menu: options in order, `description` as supporting
text, tone `error` options in their own `md-item-group` after the rest (the gap separates the risky
choice). With `variant`, the consumer can ask for the vibrant menu: Brama uses it only when the agent
asks for permission.

### 4.3 `chx-context-usage`: context ring

Button, 32px: determinate ring 18px (`md-progress-circular`, `value` = used / size), then the percentage
(tabular numbers). Above 70% the ring is `tertiary`, above 90% `error`. Thresholds:
`--chx-context-usage-warn` / `-critical`, or properties if CSS can't drive it.

| Property | Type | Notes |
|---|---|---|
| `used` | `number` | From `usage_update.used`. |
| `size` | `number` | From `usage_update.size`. `0` or not set → the element renders nothing. |
| `cost` | `ChxCost \| null` | Optional. |
| `condensed` | `boolean` | Ring only. |

Click opens a non-modal popover (`role="dialog"`, `aria-label="Context usage"`), not a menu: there's
nothing to pick. Content: "Context" with `53k / 200k`, a linear progress bar, "Session cost $0.05"
(`Intl.NumberFormat` with `currency`, row hidden without `cost`), then a default `slot` for the
consumer's note (Brama: "Plan limits aren't reported over ACP"). Escape and a click outside close it;
focus returns to the button.

### 4.4 Narrow composer

In a 380px column the button loses the agent name and the level (both stay in the menu and the
`title`), and the mode and context become icons only.

- `chx-message-composer` gets `container-type: inline-size; container-name: chx-message-composer`
  on the form.
- Each element switches itself with `@container chx-message-composer (width < 28rem)`. `condensed` is
  the manual override.
- 🚧 Verify that slotted content resolves the container through the flat tree in Chromium **and
  WebKit** (Brama runs in WKWebView). If not, the composer measures itself with its existing
  `ResizeObserver` path and sets `condensed` on its slotted agent elements.
- What goes first follows ACP order: the later option in `configOptions` collapses first.

### 4.5 Keyboard and a11y

From `md-menu`: ↑↓ Home End, → opens a submenu, ← closes it, Enter / Space picks, Escape closes and
returns focus to the button. Each trigger has `aria-haspopup` and `aria-expanded`. Its accessible name
spells out what's visible in condensed mode: "Model: Codex, GPT 5.6 Terra, thinking High",
"Permission mode: Agent", "Context: 27% used". Pressed and hover states follow MD3 (8% / 12%). The
open animation is off under `prefers-reduced-motion`.

## 5. Consumer wiring (Brama)

```html
<chx-message-composer slot="message-composer" layout="stacked" send-button="always" busy-action="stop">
  <md-icon-button slot="leading" aria-label="Attach">…</md-icon-button>
  <chx-model-picker slot="leading" .configOptions=${opts} .agents=${agents} agent-id="codex" ?agent-locked=${started}></chx-model-picker>
  <chx-mode-picker slot="actions" .configOptions=${opts} .appearance=${modeAppearance}></chx-mode-picker>
  <chx-context-usage slot="actions" .used=${u.used} .size=${u.size} .cost=${u.cost}>Plan limits aren't reported over ACP.</chx-context-usage>
  <div slot="footer">…Local ▾ · main ▾…</div>
</chx-message-composer>
```

`chx-config-change` → `session/set_config_option` → assign `configOptions` from the result. Agent
`config_option_update` → assign the list; if the model changed without a pick, the consumer shows its
own snackbar, and Undo fires `set_config_option` with the old value.

## 6. Outside this package

- **wc-material:** a horizontal segmented group inside `md-menu` (2px gap, full-pill selection,
  arrow keys within the row) for the thinking level. Until then, a vertical group (§4.1).
- **Brama:** an ACP host (`src-tauri/src/acp` is a stub), the agents list, the tray, snackbar actions
  (`$notices` has none).

## 7. Order

1. §2.1 `layout="stacked"`, §2.2 footer slot, §2.3 outline tokens + `exportparts`, §2.4 `send-button`,
   §2.6 fixes. Pure composer work, unblocks the layout in Brama today.
2. §3 typedefs, then `chx-mode-picker` (smallest), `chx-model-picker`, `chx-context-usage`.
3. §4.4 narrow behaviour, after checking container queries in WebKit.
4. §2.5 after the user decides.

Each step: specs in `*.spec.js` beside the element (layout flag doesn't flip back on clear; the footer
surface appears only with content; disabled send in `always`; events carry `{ configId, value }`; skips
unknown types; grouped options get headers; locked agent row; empty `size` renders nothing), a story in
`src/stories/agent.stories.js` (the full composer from §5 with mock `configOptions`, a "rate limit"
button that swaps the model, and a narrow variant), and the API in `src/docs/agentic.md` +
`src/docs/public-api.md`. `pnpm lint`, `pnpm typecheck`, `pnpm test` clean.
