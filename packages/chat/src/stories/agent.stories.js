import { html } from "lit";
import { keyed } from "lit/directives/keyed.js";
import { ref } from "lit/directives/ref.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import "@symblight/wc-material/button";
import "@symblight/wc-material/icon";
import "@symblight/wc-material/icon-button";

import attachFileIcon from "@material-design-icons/svg/outlined/add.svg?raw";

import "../index.js";
import "../components/streaming-indicator/streaming-indicator.js";
import "../components/scroll-to-bottom-affordance/scroll-to-bottom-affordance.js";
// The composer kit used by AgenticComposerKit at the bottom — each is standalone and registers
// itself on import, exactly like the agentic elements do.
import "../components/code-block/code-block.js";
import "../components/command-picker/command-picker.js";
import "../components/attachments/attachments.js";
import "../components/attachment/attachment.js";
import "../components/paste-long-text/paste-long-text.js";

import { buildChipElement, chipPartRule, splitMessageParts } from "../index.js";
import { createBannerPermissionPrompt } from "../agent.js";

import { endTurn, sleep, streamChunks } from "./shared/adapters.js";

const messageStyleOverrides = html`
  <style>
    /* An agent turn is a full-width document, not a bubble — but the user's own messages keep the
       default bubble, so this targets message-incoming rather than message. That complement name
       exists precisely because part selectors can't be negated: there is no
       ::part(message):not(own). The interior (.message__content) is two shadow roots down, reached
       through the exportparts chain chx-message-list maintains; --chx-message-* set here inherits
       into it as well. */
    chx-message-list::part(message-incoming) {
      box-sizing: border-box;
      max-width: 100%;
      width: 100%;
      --chx-message-padding: 0;
      --chx-message-background-color: transparent;
    }
    /* The one rule that can't be scoped to incoming rows: part selectors don't nest, so there's no
       way to say "the content box of an incoming message". Harmless on own rows — they carry a
       single text part, and a one-item flex column lays out exactly like the default block. */
    chx-message-list::part(message-content) {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
  </style>
`;

/**
 * `partElements` renderer for a `type: "code"` part. Reuse `previous` instead of building a new
 * element per chunk — a fresh element each flush looks like a brand-new, never-measured row to the
 * virtualized list, and that is the one rule every renderer here follows.
 * @param {import("../types/message.js").ChxMessagePart} part
 * @param {HTMLElement} [previous]
 * @returns {HTMLElement}
 */
function renderCodePart(part, previous) {
  const block = /** @type {any} */ (previous ?? document.createElement("chx-code-block"));
  block.code = part.text ?? "";
  block.lang = /** @type {any} */ (part).lang ?? "";
  block.copyable = true;
  block.streaming = part.state === "streaming";
  return block;
}

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Agent",
  component: "chx-chat",
  tags: ["autodocs"],
  args: { compact: false },
  argTypes: {
    compact: { name: "Compact mode", control: "boolean" },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

// Only for stories that render a chx-chat. Toggling remounts it (keyed) — switching list strategies
// on a live list isn't supported.
const virtualizationControl = {
  args: { virtualization: true },
  argTypes: { virtualization: { name: "Virtualization", control: "boolean" } },
};

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

            await streamChunks(controller, {
              messageId: replyId,
              partId: introId,
              partType: "text",
              text: REPLY_INTRO,
              delayMs: 35,
              signal,
            });
            controller.enqueue({ kind: "part-end", messageId: replyId, partId: introId });

            await streamChunks(controller, {
              messageId: replyId,
              partId: codeId,
              partType: "code",
              text: REPLY_CODE,
              split: /(?<=\n)/, // a line is the natural unit code arrives in
              first: { lang: "javascript" },
              delayMs: 150,
              signal,
            });
            controller.enqueue({ kind: "part-end", messageId: replyId, partId: codeId });

            await streamChunks(controller, {
              messageId: replyId,
              partId: outroId,
              partType: "text",
              text: REPLY_OUTRO,
              delayMs: 35,
              signal,
            });
            controller.enqueue({ kind: "part-end", messageId: replyId, partId: outroId });
          } finally {
            endTurn(controller, replyId, signal);
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
 * virtualized, auto-following list — the exact condition `highlight.js`'s eager-language-loading
 * fix targets.
 */
/** @type {Story} */
export const StreamingCodeReply = {
  ...virtualizationControl,
  render: (args) => html`
    ${messageStyleOverrides}
    ${keyed(
      args.virtualization,
      html`<chx-chat
        .compact=${args.compact}
        .noVirtualization=${!args.virtualization}
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
      </chx-chat>`,
    )}
  `,
};

/* ------------------------------------------------------------------------------------------------
 * Agentic tool calls.
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

/** The same reasoning as THOUGHT_TEXT, as the discrete rows chx-thought-step renders. ACP has no
 *  step structure — an adapter that wants rows synthesizes them itself. */
const THOUGHT_STEPS = [
  { content: "Traced the channel switch handler" },
  { content: "Checked the list keys", meta: "3 components" },
  { content: "Compared against the reconciler", meta: "2 files" },
];

/** @param {number} upTo */
function thoughtStepsAt(upTo) {
  return THOUGHT_STEPS.map((step, index) => ({
    ...step,
    status: index < upTo ? "completed" : index === upTo ? "in_progress" : "pending",
  }));
}

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

/** Two shapes off the same element: prose in `text`, or `data.steps` as
 *  chx-thought-step rows in the default slot (AgenticComposerKit). `data.duration` turns the
 *  settled summary into "Thought for N seconds" — without it chx-thought self-times the streaming
 *  window, which is right until a reload.
 *  @param {import("../types/message.js").ChxMessagePart} part @param {HTMLElement} [previous] */
function renderThoughtPart(part, previous) {
  const el = /** @type {any} */ (previous ?? document.createElement("chx-thought"));
  const data = /** @type {any} */ (part).data ?? {};
  el.streaming = part.state === "streaming";
  el.duration = data.duration ?? 0;

  const steps = /** @type {any[]} */ (data.steps ?? []);
  if (steps.length === 0) {
    el.text = part.text ?? "";
    return el;
  }
  // reuse the rows for the same reason the list reuses part elements — a fresh set every chunk
  // re-measures the row it sits in
  const rows = el.querySelectorAll("chx-thought-step");
  steps.forEach((step, index) => {
    const row = /** @type {any} */ (
      rows[index] ?? el.appendChild(document.createElement("chx-thought-step"))
    );
    row.status = step.status ?? "pending";
    row.meta = step.meta ?? "";
    if (row.textContent !== step.content) row.textContent = step.content;
  });
  return el;
}

/** @param {import("../types/message.js").ChxMessagePart} part @param {HTMLElement} [previous] */
function renderPlanPart(part, previous) {
  const el = /** @type {any} */ (previous ?? document.createElement("chx-plan"));
  el.entries = /** @type {any} */ (part).entries ?? [];
  return el;
}

/**
 * The row's content is a plain default-slot child — chx-tool-call renders the row and status and
 * never interprets ACP content blocks itself. Here `text` becomes a chx-code-block: a terminal for
 * streamed output, or a syntax-colored diff when `data.diff` is set; swap it for your own element.
 * @param {import("../types/message.js").ChxMessagePart} part @param {HTMLElement} [previous]
 */
function renderToolCallPart(part, previous) {
  const el = /** @type {any} */ (previous ?? document.createElement("chx-tool-call"));
  const attrs = /** @type {any} */ (part);
  el.toolCallId = part.id;
  el.label = attrs.label ?? "";
  el.kind = attrs.kind ?? "other";
  el.status = attrs.status ?? "pending";
  el.locations = attrs.locations ?? [];
  el.meta = attrs.meta ?? "";
  el.additions = attrs.additions;
  el.deletions = attrs.deletions;
  el.error = attrs.error ?? "";

  const data = /** @type {any} */ (attrs.data ?? {});
  if (part.text) {
    const block = /** @type {any} */ (
      el.querySelector("chx-code-block") ?? document.createElement("chx-code-block")
    );
    block.code = part.text;
    block.diff = Boolean(data.diff);
    block.lang = data.lang ?? "bash";
    block.label = data.command ?? "";
    block.filename = data.path ?? "";
    block.copyable = true;
    // terminal output isn't a file — its lines have nothing to be numbered against
    block.lineNumbers = attrs.kind !== "execute";
    block.streaming = part.state === "streaming";
    block.error = attrs.status === "failed";
    if (!block.isConnected) el.replaceChildren(block);
  }
  return el;
}

/** A sent attachment arrives as a `type: "attachment"` part carrying the File — `chx-attachments`
 *  only owns the composer row, the message side is a renderer like any other.
 *  @param {import("../types/message.js").ChxMessagePart} part @param {HTMLElement} [previous] */
function renderAttachmentPart(part, previous) {
  const card = /** @type {any} */ (
    previous?.localName === "chx-attachment" ? previous : document.createElement("chx-attachment")
  );
  card.file = /** @type {any} */ (part).attachment;
  return card;
}

/** The `partElements` map AgenticComposerKit's live agent renders through.
 *  @type {Record<string, (part: any, previous?: HTMLElement) => HTMLElement>} */
const AGENT_PART_ELEMENTS = {
  thought: renderThoughtPart,
  plan: renderPlanPart,
  tool_call: renderToolCallPart,
  code: renderCodePart,
  chip: buildChipElement,
  attachment: renderAttachmentPart,
};

/**
 * A fake ACP-shaped agent: thinks, publishes a plan, reads a file, asks permission before running a
 * command, streams that command's output, then edits a file. Everything it emits goes through the
 * ordinary delta pipeline — `partId` is the tool call's id, `status` patches in place, arrays
 * replace wholesale, and the streamed terminal output rides in `text` because that is the only
 * append-capable field.
 */
/** @param {{requestPermission: Function, thoughtSteps?: boolean}} options */
function createAgenticAdapter({ requestPermission, thoughtSteps = false }) {
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

      /**
       * @param {ReadableStreamDefaultController} controller
       * @param {string} partId
       * @param {string} partType
       * @param {Record<string, unknown>} delta
       */
      const enqueue = (controller, partId, partType, delta) =>
        controller.enqueue({ messageId: replyId, authorId: "assistant", partId, partType, delta });

      return new ReadableStream({
        async start(controller) {
          try {
            await sleep(500);
            if (signal.aborted) return;

            if (thoughtSteps) {
              // Rows instead of prose. Whole array every time — `data` replaces outright, like
              // every field but `text`. The part is `streaming` from its first delta until
              // `part-end`, which is what drives chx-thought's shimmer.
              const startedAt = performance.now();
              for (let step = 0; step < THOUGHT_STEPS.length; step += 1) {
                enqueue(controller, thoughtId, "thought", {
                  data: { steps: thoughtStepsAt(step) },
                });
                await sleep(650);
                if (signal.aborted) return;
              }
              enqueue(controller, thoughtId, "thought", {
                data: {
                  steps: thoughtStepsAt(THOUGHT_STEPS.length),
                  duration: performance.now() - startedAt,
                },
              });
            } else {
              await streamChunks(controller, {
                messageId: replyId,
                partId: thoughtId,
                partType: "thought",
                text: THOUGHT_TEXT,
                delayMs: 25,
                signal,
              });
            }
            controller.enqueue({ kind: "part-end", messageId: replyId, partId: thoughtId });

            enqueue(controller, planId, "plan", { entries: planAt(0) });
            await sleep(400);

            enqueue(controller, readId, "tool_call", {
              label: "Reading",
              kind: "read",
              status: "pending",
              locations: [{ path: "src/components/message-list/message-list.js", line: 297 }],
            });
            await sleep(300);
            enqueue(controller, readId, "tool_call", { status: "in_progress" });
            await sleep(700);
            enqueue(controller, readId, "tool_call", {
              label: "Read",
              status: "completed",
              meta: "412 lines",
            });
            controller.enqueue({ kind: "part-end", messageId: replyId, partId: readId });
            enqueue(controller, planId, "plan", { entries: planAt(1) });
            await sleep(400);
            if (signal.aborted) return;

            // the part records that the call is blocked; the *question* is asked in the banner, which
            // lives above the composer and so can't be recycled away like a scrolled-off card can
            enqueue(controller, runId, "tool_call", {
              label: "Run pnpm test",
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
            // `rejected`, not `failed` — the user said no, the tool didn't break
            if (optionId === null || optionId === "reject") {
              enqueue(controller, runId, "tool_call", {
                status: "rejected",
                error: "Permission denied — the command was not run.",
              });
              controller.enqueue({ kind: "part-end", messageId: replyId, partId: runId });
              return; // the finally below ends the turn
            }

            enqueue(controller, runId, "tool_call", {
              label: "Running pnpm test",
              status: "in_progress",
            });
            // terminal output appends, so it rides in the tool call's own `text` — a `content` array
            // re-sent in full each chunk would be O(n²) in both payload and merge cost over the turn
            for (const line of TERMINAL_OUTPUT.split(/(?<=\n)/)) {
              if (signal.aborted) return;
              await sleep(220);
              enqueue(controller, runId, "tool_call", { text: line });
            }
            enqueue(controller, runId, "tool_call", {
              label: "Ran pnpm test",
              status: "completed",
              meta: "46 passed · 3.1s",
            });
            controller.enqueue({ kind: "part-end", messageId: replyId, partId: runId });
            enqueue(controller, planId, "plan", { entries: planAt(2) });
            await sleep(400);
            if (signal.aborted) return;

            enqueue(controller, editId, "tool_call", {
              label: "Editing",
              kind: "edit",
              status: "in_progress",
              locations: [{ path: "src/components/message-list/message-list.js", line: 295 }],
            });
            await sleep(800);
            enqueue(controller, editId, "tool_call", {
              label: "Edited",
              status: "completed",
              additions: 1,
              deletions: 1,
              text: DIFF_TEXT,
              data: {
                path: "src/components/message-list/message-list.js",
                lang: "javascript",
                diff: true,
              },
            });
            controller.enqueue({ kind: "part-end", messageId: replyId, partId: editId });
            enqueue(controller, planId, "plan", { entries: planAt(3) });
            controller.enqueue({ kind: "part-end", messageId: replyId, partId: planId });

            await streamChunks(controller, {
              messageId: replyId,
              partId: outroId,
              partType: "text",
              text: "All 46 tests pass, and the recycling fix is in.",
              delayMs: 35,
              signal,
            });
            controller.enqueue({ kind: "part-end", messageId: replyId, partId: outroId });
          } finally {
            endTurn(controller, replyId, signal);
          }
        },
      });
    },
  };
}

const galleryStyles = html`<style>
  .agent-states {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    max-width: 48rem;
    padding: 1rem;
  }
  .agent-states__group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .agent-states__label {
    margin-block-end: 0.25rem;
    font: 500 0.75rem/1 sans-serif;
    color: var(--md-sys-color-on-surface-variant);
    text-transform: uppercase;
  }
</style>`;

const TOOL_CALL_KINDS = [
  {
    kind: "read",
    label: "Read",
    path: "src/components/message-list/message-list.js",
    meta: "412 lines",
  },
  { kind: "edit", label: "Edited", path: "src/components/message-list/message-list.js", line: 295 },
  { kind: "delete", label: "Deleted", path: "src/legacy/scroll-behavior.js" },
  { kind: "move", label: "Moved", path: "src/components/infinity-scroll/RowMeasurer.js" },
  { kind: "search", label: "Searched for reconcileChildren", meta: "3 results" },
  { kind: "execute", label: "Ran pnpm test", meta: "46 passed · 3.1s" },
  { kind: "think", label: "Thinking" },
  { kind: "fetch", label: "Fetched lit.dev/docs", meta: "18 KB" },
  { kind: "switch_mode", label: "Switched to plan mode" },
  { kind: "other", label: "Called a custom tool" },
];

/** @param {{kind: string, path?: string, line?: number}} call */
const locationsOf = (call) => (call.path ? [{ path: call.path, line: call.line }] : []);

/**
 * Every agentic element on its own, no `chx-chat` — the `Compact mode` control flips `compact` on all
 * of them. A real turn builds these from message parts in a `partElements` renderer; see
 * AgenticComposerKit below for a live agent streaming into a chat.
 */
/** @type {Story} */
export const AgenticToolCalls = {
  render: (args) => html`
    ${galleryStyles}
    <div class="agent-states">
      <div class="agent-states__group">
        <span class="agent-states__label">Tool call — status</span>
        <chx-tool-call
          ?compact=${args.compact}
          kind="read"
          status="pending"
          label="Read"
          .locations=${[{ path: "src/components/message-list/message-list.js" }]}
        ></chx-tool-call>
        <chx-tool-call
          ?compact=${args.compact}
          kind="execute"
          status="in_progress"
          label="Running pnpm test"
        ></chx-tool-call>
        <chx-tool-call
          ?compact=${args.compact}
          kind="execute"
          status="awaiting-permission"
          label="Run pnpm test"
          meta="needs permission"
        ></chx-tool-call>
        <chx-tool-call
          ?compact=${args.compact}
          kind="edit"
          status="completed"
          label="Edited"
          .locations=${[{ path: "src/components/message-list/message-list.js", line: 295 }]}
          .additions=${1}
          .deletions=${1}
        ></chx-tool-call>
        <chx-tool-call
          ?compact=${args.compact}
          kind="execute"
          status="failed"
          label="Ran pnpm build"
          error="vite-plugin-dts: Cannot find module './elements.d.ts'"
        ></chx-tool-call>
        <chx-tool-call
          ?compact=${args.compact}
          kind="delete"
          status="rejected"
          label="Delete"
          .locations=${[{ path: "src/legacy/scroll-behavior.js" }]}
        ></chx-tool-call>
        <chx-tool-call
          ?compact=${args.compact}
          kind="fetch"
          status="cancelled"
          label="Fetch lit.dev/docs"
        ></chx-tool-call>
      </div>

      <div class="agent-states__group">
        <span class="agent-states__label">Tool call — kind</span>
        ${TOOL_CALL_KINDS.map(
          (call) =>
            html`<chx-tool-call
              ?compact=${args.compact}
              kind=${call.kind}
              status="completed"
              label=${call.label}
              meta=${call.meta ?? ""}
              .locations=${locationsOf(call)}
            ></chx-tool-call>`,
        )}
      </div>

      <div class="agent-states__group">
        <span class="agent-states__label">Tool call — content</span>
        <chx-tool-call
          ?compact=${args.compact}
          open
          kind="execute"
          status="completed"
          label="Ran pnpm test"
          meta="46 passed · 3.1s"
        >
          <chx-code-block
            .code=${TERMINAL_OUTPUT}
            lang="bash"
            label="pnpm test"
            copyable
            .lineNumbers=${false}
          ></chx-code-block>
        </chx-tool-call>
        <chx-tool-call
          ?compact=${args.compact}
          open
          kind="edit"
          status="completed"
          label="Edited"
          .locations=${[{ path: "src/components/message-list/message-list.js", line: 295 }]}
          .additions=${1}
          .deletions=${1}
        >
          <chx-tool-call-diff
            path="src/components/message-list/message-list.js"
            .diff=${DIFF_TEXT}
          ></chx-tool-call-diff>
        </chx-tool-call>
      </div>

      <div class="agent-states__group">
        <span class="agent-states__label">Thought</span>
        <chx-thought ?compact=${args.compact} streaming open .text=${THOUGHT_TEXT}></chx-thought>
        <chx-thought ?compact=${args.compact} .duration=${4000} .text=${THOUGHT_TEXT}></chx-thought>
      </div>

      <div class="agent-states__group">
        <span class="agent-states__label">Plan</span>
        <chx-plan ?compact=${args.compact} open .entries=${planAt(1)}></chx-plan>
        <chx-plan ?compact=${args.compact} .entries=${planAt(PLAN_STEPS.length)}></chx-plan>
      </div>

      <div class="agent-states__group">
        <span class="agent-states__label">Input mode banner</span>
        <chx-input-mode-banner label="Allow the agent to run pnpm test?">
          <md-button slot="actions" variant="text">Deny</md-button>
          <md-button slot="actions" variant="tonal">Allow</md-button>
        </chx-input-mode-banner>
        <chx-input-mode-banner
          variant="danger"
          label="Allow the agent to delete src/legacy/scroll-behavior.js?"
        >
          <md-button slot="actions" variant="text">Deny</md-button>
          <md-button slot="actions" variant="tonal">Delete</md-button>
        </chx-input-mode-banner>
      </div>
    </div>
  `,
};

/* ------------------------------------------------------------------------------------------------
 * The full composer kit on top of the same agentic adapter — `@` file picker, attachments,
 * long-paste collapsing, code blocks. Everything below is composer-side wiring; the agent itself is
 * the same as `createAgenticAdapter` above.
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
 *  @type {import("../types/inline-part-rule.js").InlinePartRule} */
const pasteCodePartRule = {
  type: "code",
  selector: "span[data-paste-lines]",
  toPart: (element) => ({ text: element.textContent ?? "", lang: element.dataset.lang ?? "" }),
};

/** Re-splits a sent message's leading text part into real `chip`/`code` parts, keeping any
 *  attachment parts after it — `createSplitOnSendHandler` bails on anything but a lone text part,
 *  so a send with an attachment would leave the chip and paste as flat text.
 *  @param {CustomEvent<{messages: import("../types/message.js").ChxMessage[]}>} event */
function handleComposerKitMessagesChange(event) {
  const last = event.detail.messages.at(-1);
  const [first, ...rest] = last?.parts ?? [];
  if (!last?.own || first?.type !== "text" || typeof first.html !== "string") return;

  const parts = splitMessageParts(last.id, first.html, [chipPartRule, pasteCodePartRule]);
  if (!parts) return;
  /** @type {any} */ (event.currentTarget).store.add({ ...last, parts: [...parts, ...rest] });
}

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
 * A fake agent (`createAgenticAdapter`) streaming a full turn — thought, plan, tool calls and a
 * permission request answered from `chx-input-mode-banner` — with the composer's optional features all slotted in at
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
  ...virtualizationControl,
  render: (args) => {
    /** @type {any} */
    let banner;
    const adapter = createAgenticAdapter({
      requestPermission: createBannerPermissionPrompt({ getBanner: () => banner }),
    });
    return html`
      ${attachTriggerStyles} ${messageStyleOverrides}
      ${keyed(
        args.virtualization,
        html`<chx-chat
          .compact=${args.compact}
          .noVirtualization=${!args.virtualization}
          .userId=${"me"}
          .partElements=${AGENT_PART_ELEMENTS}
          .adapter=${adapter}
          @chx-messages-change=${handleComposerKitMessagesChange}
        >
          <chx-message-list
            slot="message-list"
            scroll-behavior="smooth"
            content-align="start"
            scroll-mode="pin-top"
          >
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
            <chx-paste-long-text paste-threshold="200"></chx-paste-long-text>
            <chx-command-picker
              commandCharacter="@"
              maxQuerySpaces="1"
              id="agent-file-picker"
              slot="command-field"
              @chx-command-query=${handleAgentFileQuery}
            ></chx-command-picker>
          </chx-message-composer>
        </chx-chat>`,
      )}
    `;
  },
};
