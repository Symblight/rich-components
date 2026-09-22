import { html } from "lit";
import { ref } from "lit/directives/ref.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import "@symblight/wc-material/button";
import "@symblight/wc-material/icon";
import "@symblight/wc-material/icon-button";

import attachFileIcon from "@material-design-icons/svg/outlined/add.svg?raw";

import "../../index.js";
import "../streaming-indicator/streaming-indicator.js";
import "../scroll-to-bottom-affordance/scroll-to-bottom-affordance.js";
// The composer kit used by AgenticComposerKit at the bottom — each is standalone and registers
// itself on import, exactly like the agentic elements do.
import "../code-block/code-block.js";
import "../command-picker/command-picker.js";
import "../attachments/attachments.js";
import "../attachment/attachment.js";
import "../paste-long-text/paste-long-text.js";

import { buildChipElement, chipPartRule, createSplitOnSendHandler } from "../../index.js";
// Importing the `@symblight/chat/agent` entry registers chx-thought/chx-plan/chx-tool-call/
// chx-tool-call-diff/chx-input-mode-banner. The package ships those elements and nothing else —
// every renderer below is this story's own, which is exactly what an app writes for itself.
import { createBannerPermissionPrompt } from "../../agent.js";

/**
 * `partElements` renderer for a `type: "code"` part. Reuse `previous` instead of building a new
 * element per chunk — a fresh element each flush looks like a brand-new, never-measured row to the
 * virtualized list, and that is the one rule every renderer here follows.
 * @param {import("../../types/message.js").ChxMessagePart} part
 * @param {HTMLElement} [previous]
 * @returns {HTMLElement}
 */
function renderCodePart(part, previous) {
  const block = /** @type {any} */ (previous ?? document.createElement("chx-code-block"));
  block.code = part.text ?? "";
  block.lang = /** @type {any} */ (part).lang ?? "";
  return block;
}

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Agent",
  component: "chx-chat",
  tags: ["autodocs"],
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

const REPLY_INTRO = "Sure — here's a small helper that reads the scroll/virtualizer state:";
const REPLY_CODE = `function scrollSnapshot(scroller, virtualizer) {
  return {
    scrollTop: scroller.scrollTop,
    scrollOffset: virtualizer.scrollOffset,
    scrollHeight: scroller.scrollHeight,
    atEnd: virtualizer.isAtEnd(),
  };
}`;
const REPLY_OUTRO = "That object is enough to tell whether the view is still pinned to the bottom.";

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Streams `text` into `partId` word by word — each word its own delta chunk, matching how a real
 * token-streaming LLM API arrives (small, frequent chunks rather than one big one).
 * @param {ReadableStreamDefaultController} controller
 * @param {{messageId: string, partId: string, partType: string, text: string, extra?: Record<string, unknown>, delayMs: number, signal: AbortSignal}} options
 */
async function streamWords(
  controller,
  { messageId, partId, partType, text, extra, delayMs, signal },
) {
  const words = text.split(/(?<=\s)/);
  for (const [i, word] of words.entries()) {
    if (signal.aborted) return;
    await sleep(delayMs);
    controller.enqueue({
      messageId,
      authorId: "assistant",
      partId,
      partType,
      // `lang` rides the first chunk only — later deltas would just re-set it unchanged.
      delta: /** @type {any} */ (i === 0 && extra ? { text: word, ...extra } : { text: word }),
    });
  }
}

/**
 * Streams `code` line by line into `partId` — coarser chunks than `streamWords` since a line is
 * the natural unit code arrives in, and it's enough to make `chx-code-block` visibly grow mid-stream.
 * @param {ReadableStreamDefaultController} controller
 * @param {{messageId: string, partId: string, code: string, lang: string, delayMs: number, signal: AbortSignal}} options
 */
async function streamCodeLines(controller, { messageId, partId, code, lang, delayMs, signal }) {
  const lines = code.split(/(?<=\n)/);
  for (const [i, line] of lines.entries()) {
    if (signal.aborted) return;
    await sleep(delayMs);
    controller.enqueue({
      messageId,
      authorId: "assistant",
      partId,
      partType: "code",
      delta: /** @type {any} */ (i === 0 ? { text: line, lang } : { text: line }),
    });
  }
}

/**
 * A fake `adapter.sendMessage` streaming one reply message as three parts, in order — intro text,
 * a code block, then closing text — each its own `partId` finished with a `part-end` chunk before
 * the next starts. Ignores the actual composer input, same posture `chat.stories.js`'s
 * `createSlowReplyAdapter` takes: this is about exercising the streaming/virtualization path, not
 * simulating a real model.
 */
function createStreamingCodeAgentAdapter() {
  let replyCount = 0;
  return {
    sendMessage: async (
      /** @type {any} */ message,
      /** @type {{signal: AbortSignal}} */ { signal },
    ) => {
      const replyId = `reply-${message.id}-${replyCount++}`;
      const introId = `${replyId}-intro`;
      const codeId = `${replyId}-code`;
      const outroId = `${replyId}-outro`;

      return new ReadableStream({
        async start(controller) {
          try {
            await sleep(600); // "thinking" — chx-streaming-indicator covers this window
            if (signal.aborted) return;

            await streamWords(controller, {
              messageId: replyId,
              partId: introId,
              partType: "text",
              text: REPLY_INTRO,
              delayMs: 35,
              signal,
            });
            controller.enqueue({ kind: "part-end", messageId: replyId, partId: introId });

            await streamCodeLines(controller, {
              messageId: replyId,
              partId: codeId,
              code: REPLY_CODE,
              lang: "javascript",
              delayMs: 150,
              signal,
            });
            controller.enqueue({ kind: "part-end", messageId: replyId, partId: codeId });

            await streamWords(controller, {
              messageId: replyId,
              partId: outroId,
              partType: "text",
              text: REPLY_OUTRO,
              delayMs: 35,
              signal,
            });
            controller.enqueue({ kind: "part-end", messageId: replyId, partId: outroId });
          } finally {
            // One terminator for every exit. Returning from `start()` on abort without closing would
            // leave chx-chat's read pending forever — the contract in src/docs/agentic.md: an aborted
            // turn still has to be ended, and an explicit `abort` chunk is the clean way to do it.
            controller.enqueue({
              kind: signal.aborted ? "abort" : "finish",
              messageId: replyId,
            });
            controller.close();
          }
        },
      });
    },
  };
}

/**
 * Send any message — the fake agent always replies with the same three-part stream (text, code,
 * text), landing one word/line at a time via real `sendMessage` streaming, not a mocked historical
 * message. Exercises `chx-code-block` growing while genuinely pinned to the bottom of a live,
 * virtualized, auto-following list — the exact condition the eager-language-loading fix in
 * `highlight.js` targets (see `.claude/plans/code-block.spec.md`).
 */
/** @type {Story} */
export const StreamingCodeReply = {
  render: () => html`
    <chx-chat
      .userId=${"me"}
      .partElements=${{ code: renderCodePart }}
      .adapter=${createStreamingCodeAgentAdapter()}
    >
      <chx-message-list slot="message-list" scroll-behavior="smooth">
        <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
      </chx-message-list>
      <chx-message-composer slot="message-composer" placeholder="Write your prompt...">
        <md-button slot="actions" variant="text">Send</md-button>
      </chx-message-composer>
    </chx-chat>
  `,
};

/* ------------------------------------------------------------------------------------------------
 * Agentic tool calls — see `.claude/plans/agentic-tools.spec.md` and `src/docs/agentic.md`.
 * ---------------------------------------------------------------------------------------------- */

const THOUGHT_TEXT =
  "The user wants the test suite run. Reading the list component first tells me which spec files " +
  "cover the recycling path, then running the suite confirms nothing regressed.";

const TERMINAL_OUTPUT = `$ pnpm test
 chromium  |  message-list.spec.js  ✓ 12 passed
 chromium  |  infinity-scroll.spec.js  ✓ 9 passed
 chromium  |  stream/streamHelpers.spec.js  ✓ 25 passed

46 passing (3.1s)`;

const DIFF_TEXT = `--- a/src/components/message-list/message-list.js
+++ b/src/components/message-list/message-list.js
@@ -294,7 +294,7 @@
     this.#focusBehavior.applyToElement(message.id, el);
-      el.replaceChildren(...parts.map(renderPart));
+      reconcileChildren(el, parts.map(renderPart));
     this.#messageElementCache.set(message.id, { key: undefined, element: el });
`;

const PLAN_STEPS = [
  { content: "Read the message list component", priority: "high" },
  { content: "Run the test suite", priority: "high" },
  { content: "Apply the child-reconciliation fix", priority: "medium" },
];

/** @param {number} upTo @returns {Array<{content: string, priority: string, status: string}>} */
function planAt(upTo) {
  return PLAN_STEPS.map((step, index) => ({
    ...step,
    status: index < upTo ? "completed" : index === upTo ? "in_progress" : "pending",
  }));
}

/** Part types that render as a full-width card rather than prose — see `renderAgentMessage`. */
const CARD_PART_TYPES = new Set(["tool_call", "plan"]);

/** @param {import("../../types/message.js").ChxMessagePart} part @param {HTMLElement} [previous] */
function renderThoughtPart(part, previous) {
  const el = /** @type {any} */ (previous ?? document.createElement("chx-thought"));
  el.text = part.text ?? "";
  el.streaming = part.state === "streaming";
  return el;
}

/** @param {import("../../types/message.js").ChxMessagePart} part @param {HTMLElement} [previous] */
function renderPlanPart(part, previous) {
  const el = /** @type {any} */ (previous ?? document.createElement("chx-plan"));
  el.entries = /** @type {any} */ (part).entries ?? [];
  return el;
}

/**
 * The card's content is a plain default-slot child — chx-tool-call renders header and status and
 * never interprets ACP content blocks itself. Here a `data.diff` becomes a chx-tool-call-diff and
 * streamed `text` a terminal chx-code-block; swap either for your own element freely.
 * @param {import("../../types/message.js").ChxMessagePart} part @param {HTMLElement} [previous]
 */
function renderToolCallPart(part, previous) {
  const el = /** @type {any} */ (previous ?? document.createElement("chx-tool-call"));
  const attrs = /** @type {any} */ (part);
  el.toolCallId = part.id;
  el.label = attrs.label ?? "";
  el.kind = attrs.kind ?? "other";
  el.status = attrs.status ?? "pending";
  el.locations = attrs.locations ?? [];
  el.error = attrs.error ?? "";

  const data = /** @type {any} */ (attrs.data ?? {});
  if (data.diff) {
    const diff = /** @type {any} */ (
      el.querySelector("chx-tool-call-diff") ?? document.createElement("chx-tool-call-diff")
    );
    diff.path = data.path ?? "";
    diff.diff = data.diff;
    if (!diff.isConnected) el.replaceChildren(diff);
  } else if (part.text) {
    const block = /** @type {any} */ (
      el.querySelector("chx-code-block") ?? document.createElement("chx-code-block")
    );
    block.code = part.text;
    block.lang = "bash";
    block.label = data.command ?? "";
    if (!block.isConnected) el.replaceChildren(block);
  }
  return el;
}

/** A sent attachment arrives as a `type: "attachment"` part carrying the File — `chx-attachments`
 *  only owns the composer row, the message side is a renderer like any other.
 *  @param {import("../../types/message.js").ChxMessagePart} part @param {HTMLElement} [previous] */
function renderAttachmentPart(part, previous) {
  const card = /** @type {any} */ (
    previous?.localName === "chx-attachment" ? previous : document.createElement("chx-attachment")
  );
  card.file = /** @type {any} */ (part).attachment;
  card.removable = false;
  return card;
}

/** `chip`/`attachment` only ever fire for AgenticComposerKit below — AgenticToolCalls emits
 *  neither, so they are inert there.
 *  @type {Record<string, (part: any, previous?: HTMLElement) => HTMLElement>} */
const AGENT_PART_ELEMENTS = {
  thought: renderThoughtPart,
  plan: renderPlanPart,
  tool_call: renderToolCallPart,
  code: renderCodePart,
  chip: buildChipElement,
  attachment: renderAttachmentPart,
};

/** @param {import("../../types/message.js").ChxMessagePart} part @param {HTMLElement} [previous] */
function renderAgentPart(part, previous) {
  const renderer = AGENT_PART_ELEMENTS[part.type];
  if (renderer) return renderer(part, previous);
  const span = /** @type {HTMLElement} */ (
    previous?.localName === "span" ? previous : document.createElement("span")
  );
  span.textContent = part.text ?? "";
  return span;
}

/**
 * A `messageElement` for agent turns. Tool cards, plans and diffs are full-width card content, so a
 * message carrying one drops chx-message's bubble chrome — set on the element itself, since a
 * page-level custom-property rule can't reach a chx-message two shadow roots deep (CLAUDE.md,
 * "::part() only forwards one shadow level").
 *
 * Note `messageElement` takes over part rendering entirely: chx-message-list never consults
 * `partElements` for a message it builds, so the dispatch below is this renderer's own job.
 * @param {import("../../types/message.js").ChxMessage} message
 * @param {HTMLElement} [previousElement]
 */
function renderAgentMessage(message, previousElement) {
  const el = /** @type {any} */ (previousElement ?? document.createElement("chx-message"));
  el.own = message.own;
  el.busy = message.parts.some((part) => part.state === "streaming");
  el.ariaLabel = message.own ? "Your message" : "Message";

  const hasCard = message.parts.some((part) => CARD_PART_TYPES.has(part.type));
  for (const [property, value] of Object.entries({
    "--chx-message-background-color": "transparent",
    "--chx-message-padding": "0",
    "--chx-message-max-width": "100%",
  })) {
    if (hasCard) el.style.setProperty(property, value);
    else el.style.removeProperty(property);
  }

  const previousParts = new Map(
    [...el.children].map((child) => [/** @type {HTMLElement} */ (child).dataset.partId, child]),
  );
  el.replaceChildren(
    ...message.parts
      .filter((part) => part.id)
      .map((part) => {
        const child = renderAgentPart(
          part,
          /** @type {HTMLElement | undefined} */ (previousParts.get(part.id)),
        );
        child.dataset.partId = part.id;
        child.style.display = "block";
        child.style.marginBlockStart = "0.5rem";
        return child;
      }),
  );
  return el;
}

/**
 * A fake ACP-shaped agent: thinks, publishes a plan, reads a file, asks permission before running a
 * command, streams that command's output, then edits a file. Everything it emits goes through the
 * ordinary delta pipeline — `partId` is the tool call's id, `status` patches in place, arrays
 * replace wholesale, and the streamed terminal output rides in `text` because that is the only
 * append-capable field (see `src/docs/agentic.md`).
 */
function createAgenticAdapter({ requestPermission }) {
  let replyCount = 0;

  return {
    sendMessage: async (
      /** @type {any} */ message,
      /** @type {{signal: AbortSignal}} */ { signal },
    ) => {
      const replyId = `reply-${message.id}-${replyCount++}`;
      const thoughtId = `${replyId}-thought`;
      const planId = `${replyId}-plan`;
      const readId = `${replyId}-read`;
      const runId = `${replyId}-run`;
      const editId = `${replyId}-edit`;
      const outroId = `${replyId}-outro`;

      /** @param {string} partId @param {string} partType @param {Record<string, unknown>} delta */
      const enqueue = (controller, partId, partType, delta) =>
        controller.enqueue({ messageId: replyId, authorId: "assistant", partId, partType, delta });

      return new ReadableStream({
        async start(controller) {
          try {
            await sleep(500);
            if (signal.aborted) return;

            await streamWords(controller, {
              messageId: replyId,
              partId: thoughtId,
              partType: "thought",
              text: THOUGHT_TEXT,
              delayMs: 25,
              signal,
            });
            controller.enqueue({ kind: "part-end", messageId: replyId, partId: thoughtId });

            enqueue(controller, planId, "plan", { entries: planAt(0) });
            await sleep(400);

            enqueue(controller, readId, "tool_call", {
              label: "Read message-list.js",
              kind: "read",
              status: "pending",
              locations: [{ path: "src/components/message-list/message-list.js", line: 297 }],
            });
            await sleep(300);
            enqueue(controller, readId, "tool_call", { status: "in_progress" });
            await sleep(700);
            enqueue(controller, readId, "tool_call", { status: "completed" });
            controller.enqueue({ kind: "part-end", messageId: replyId, partId: readId });
            enqueue(controller, planId, "plan", { entries: planAt(1) });
            await sleep(400);
            if (signal.aborted) return;

            // the part records that the call is blocked; the *question* is asked in the banner, which
            // lives above the composer and so can't be recycled away like a scrolled-off card can
            enqueue(controller, runId, "tool_call", {
              label: "Run the test suite",
              kind: "execute",
              status: "awaiting-permission",
              data: { command: "pnpm test" },
            });

            const optionId = await requestPermission(
              {
                requestId: `${runId}-req-1`,
                toolCallId: runId,
                label: "Allow the agent to run `pnpm test`?",
                options: [
                  { id: "allow-once", label: "Allow once", kind: "allow_once" },
                  { id: "allow-always", label: "Always allow", kind: "allow_always" },
                  { id: "reject", label: "Deny", kind: "reject_once" },
                ],
              },
              signal,
            );
            if (signal.aborted) return;

            // `null` is a cancelled request — ACP wants an answer either way
            if (optionId === null || optionId === "reject") {
              enqueue(controller, runId, "tool_call", {
                status: "failed",
                error: "Permission denied — the command was not run.",
              });
              controller.enqueue({ kind: "part-end", messageId: replyId, partId: runId });
              return; // the finally below ends the turn
            }

            enqueue(controller, runId, "tool_call", { status: "in_progress" });
            // terminal output appends, so it rides in the tool call's own `text` — a `content` array
            // re-sent in full each chunk would be O(n²) in both payload and merge cost over the turn
            for (const line of TERMINAL_OUTPUT.split(/(?<=\n)/)) {
              if (signal.aborted) return;
              await sleep(220);
              enqueue(controller, runId, "tool_call", { text: line });
            }
            enqueue(controller, runId, "tool_call", { status: "completed" });
            controller.enqueue({ kind: "part-end", messageId: replyId, partId: runId });
            enqueue(controller, planId, "plan", { entries: planAt(2) });
            await sleep(400);
            if (signal.aborted) return;

            enqueue(controller, editId, "tool_call", {
              label: "Edit message-list.js",
              kind: "edit",
              status: "in_progress",
              locations: [{ path: "src/components/message-list/message-list.js" }],
            });
            await sleep(800);
            enqueue(controller, editId, "tool_call", {
              status: "completed",
              data: { path: "src/components/message-list/message-list.js", diff: DIFF_TEXT },
            });
            controller.enqueue({ kind: "part-end", messageId: replyId, partId: editId });
            enqueue(controller, planId, "plan", { entries: planAt(3) });
            controller.enqueue({ kind: "part-end", messageId: replyId, partId: planId });

            await streamWords(controller, {
              messageId: replyId,
              partId: outroId,
              partType: "text",
              text: "All 46 tests pass, and the recycling fix is in.",
              delayMs: 35,
              signal,
            });
            controller.enqueue({ kind: "part-end", messageId: replyId, partId: outroId });
          } finally {
            // One terminator for every exit. Returning from `start()` on abort without closing would
            // leave chx-chat's read pending forever — the contract in src/docs/agentic.md: an aborted
            // turn still has to be ended, and an explicit `abort` chunk is the clean way to do it.
            controller.enqueue({
              kind: signal.aborted ? "abort" : "finish",
              messageId: replyId,
            });
            controller.close();
          }
        },
      });
    },
  };
}

/**
 * Send anything — the fake agent thinks out loud, publishes a plan, reads a file, then **stops and
 * asks permission** before running a command. The question appears in `chx-input-mode-banner` above
 * the composer, not on the tool card: a virtualized list can recycle the requesting card out of the
 * DOM entirely while the turn is blocked on it, and a banner docked to the input never goes away.
 * The banner is a generic one — label, variant, `actions` slot — and this story fills it and clears
 * it itself, which is the whole contract: `chx-chat` only provides the `input-banner` slot.
 */
/** @type {Story} */
export const AgenticToolCalls = {
  render: () => {
    /** @type {any} */
    let banner;
    const adapter = createAgenticAdapter({
      requestPermission: createBannerPermissionPrompt({ getBanner: () => banner }),
    });
    return html`
      <chx-chat
        .userId=${"me"}
        .messageElement=${renderAgentMessage}
        .partElements=${AGENT_PART_ELEMENTS}
        .adapter=${adapter}
      >
        <chx-message-list slot="message-list" scroll-behavior="smooth" content-align="start">
          <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
          <chx-scroll-to-bottom-affordance
            slot="scroll-to-bottom"
          ></chx-scroll-to-bottom-affordance>
        </chx-message-list>
        <chx-input-mode-banner
          slot="input-banner"
          hidden
          ${ref((el) => (banner = el))}
        ></chx-input-mode-banner>
        <chx-message-composer
          slot="message-composer"
          placeholder="Ask the agent to run the tests..."
        >
          <md-button slot="actions" variant="text">Opus 4.8</md-button>
        </chx-message-composer>
      </chx-chat>
    `;
  },
};

/* ------------------------------------------------------------------------------------------------
 * The full composer kit on top of the same agentic adapter — `@` file picker, attachments,
 * long-paste collapsing, code blocks. Everything below is composer-side wiring; the agent itself is
 * unchanged from AgenticToolCalls above.
 * ---------------------------------------------------------------------------------------------- */

/** Mock repository the `@` picker searches. */
const AGENT_FILES = [
  "src/components/base/chat.js",
  "src/components/message-list/message-list.js",
  "src/components/message-composer/message-composer.js",
  "src/components/agent/tool-call/tool-call.js",
  "src/components/agent/plan/plan.js",
  "src/components/agent/thought/thought.js",
  "src/stream/processStream.js",
  "src/stream/streamHelpers.js",
  "src/docs/agentic.md",
  "README.md",
];

/** @param {string[]} matches @returns {HTMLTemplateElement} */
function buildFileMenuItems(matches) {
  const template = document.createElement("template");
  template.innerHTML = matches
    .map((value) => `<md-menu-item value="${value}">${value}</md-menu-item>`)
    .join("");
  return template;
}

/** Plain substring search over AGENT_FILES — the picker's only required integration point.
 *  @param {Event} event */
function handleAgentFileQuery(event) {
  const picker = /** @type {any} */ (event.target);
  const { value: query } = /** @type {CustomEvent} */ (event).detail;
  picker.clearOptions();
  if (query === null) return;
  picker.addOptions(
    buildFileMenuItems(
      AGENT_FILES.filter((file) => file.toLowerCase().includes(query.toLowerCase())),
    ),
  );
}

/** Rule for the `paste` node chx-paste-long-text collapses a detected code paste into, so it stays
 *  a `type: "code"` part after send instead of flattening back to text.
 *  @type {import("../../types/inline-part-rule.js").InlinePartRule} */
const pasteCodePartRule = {
  type: "code",
  selector: "span[data-paste-lines]",
  toPart: (element) => ({ text: element.textContent ?? "", lang: element.dataset.lang ?? "" }),
};

/** Re-splits a sent message's flat text into real `chip`/`code` parts — without this the resolved
 *  `@` chip and the collapsed paste survive only as plain text in the sent message. */
const handleComposerKitMessagesChange = createSplitOnSendHandler([chipPartRule, pasteCodePartRule]);

/** @param {Event} event */
function openAttachmentPicker(event) {
  /** @type {any} */ (
    /** @type {HTMLElement} */ (event.currentTarget)
      .closest("chx-message-composer")
      ?.querySelector("chx-attachments")
  )?.open();
}

/** chx-textbox's own ::slotted() rule reaches the font-size custom property but not ::part(button)
 *  padding — that parity has to come from page level. */
const attachTriggerStyles = html`
  <style>
    .attach-trigger::part(button) {
      padding: 0.237rem;
    }
  </style>
`;

/**
 * The same fake agent as `AgenticToolCalls`, with the composer's optional features all slotted in at
 * once, to see how they sit together above an agent turn:
 *
 * - **`@` file picker** — `<chx-command-picker commandCharacter="@">` searching `AGENT_FILES`.
 *   Type `@chat`, pick a result, and the resolved chip lands in the field; `chipPartRule` keeps it a
 *   real chip in the sent message rather than plain text.
 * - **Attachments** — the `+` button opens the picker, OS drag-and-drop over the whole chat works
 *   too, and a sent file renders through `renderAttachmentPart`.
 * - **Long paste** — `paste-threshold="200"` (the attribute's real name), so a paste of 200+ lines
 *   collapses to a "N lines" chip. Under that, chx-paste-long-text's built-in code detection still
 *   runs, so pasting a snippet collapses into a `<chx-code-block>` instead.
 * - **Code blocks** — both from that paste path and from the agent's own streamed `code` parts.
 */
/** @type {Story} */
export const AgenticComposerKit = {
  render: () => {
    /** @type {any} */
    let banner;
    const adapter = createAgenticAdapter({
      requestPermission: createBannerPermissionPrompt({ getBanner: () => banner }),
    });
    return html`
      ${attachTriggerStyles}
      <chx-chat
        .userId=${"me"}
        .messageElement=${renderAgentMessage}
        .partElements=${AGENT_PART_ELEMENTS}
        .adapter=${adapter}
        @chx-messages-change=${handleComposerKitMessagesChange}
      >
        <chx-message-list slot="message-list" scroll-behavior="smooth" content-align="start">
          <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
          <chx-scroll-to-bottom-affordance
            slot="scroll-to-bottom"
          ></chx-scroll-to-bottom-affordance>
        </chx-message-list>
        <chx-input-mode-banner
          slot="input-banner"
          hidden
          ${ref((el) => (banner = el))}
        ></chx-input-mode-banner>
        <chx-message-composer
          slot="message-composer"
          placeholder="Type @ to mention a file, or paste a snippet..."
        >
          <md-icon-button slot="leading" class="attach-trigger" @click=${openAttachmentPicker}>
            <md-icon>${unsafeSVG(attachFileIcon)}</md-icon>
          </md-icon-button>
          <md-button slot="actions" variant="text">Opus 4.8</md-button>
          <chx-attachments slot="attachments"></chx-attachments>
          <chx-paste-long-text slot="paste-long-text" paste-threshold="200"></chx-paste-long-text>
          <chx-command-picker
            commandCharacter="@"
            maxQuerySpaces="1"
            id="agent-file-picker"
            slot="command-field"
            @chx-command-query=${handleAgentFileQuery}
          ></chx-command-picker>
        </chx-message-composer>
      </chx-chat>
    `;
  },
};
