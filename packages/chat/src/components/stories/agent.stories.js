import { html } from "lit";

import "@symblight/wc-material/button";

import "../../index.js";
import "../code-block/code-block.js";
import "../streaming-indicator/streaming-indicator.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Agent",
  component: "chx-chat",
  tags: ["autodocs"],
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/**
 * `partElements` renderer for a `type: "code"` part — reuses `previous` across re-renders instead
 * of building a new `chx-code-block` on every streamed chunk, same "reuse across streaming/edits"
 * contract `messageElement`/other custom renderers follow (see `chat.stories.js`'s
 * `renderCustomMessage`). Reusing the element also matters for the virtualized list: a fresh element
 * per chunk would look like a brand-new, never-measured row every time.
 * @param {import("../../types/message.js").ChxMessagePart} part
 * @param {HTMLElement} [previous]
 * @returns {HTMLElement}
 */
function renderCodePart(part, previous) {
  const block = /** @type {HTMLElement & {code: string, lang: string}} */ (
    previous ?? document.createElement("chx-code-block")
  );
  block.code = part.text ?? "";
  block.lang = /** @type {any} */ (part).lang ?? "";
  return block;
}

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
async function streamWords(controller, { messageId, partId, partType, text, extra, delayMs, signal }) {
  const words = text.split(/(?<=\s)/);
  for (const [i, word] of words.entries()) {
    if (signal.aborted) return;
    await sleep(delayMs);
    controller.enqueue({
      messageId,
      authorId: "assistant",
      partId,
      partType,
      // `lang` only matters on the chunk that creates the part — applyChunkToParts drops unknown
      // delta fields on every later chunk for the same part, keeping only text/html.
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
    sendMessage: async (/** @type {any} */ message, /** @type {{signal: AbortSignal}} */ { signal }) => {
      const replyId = `reply-${message.id}-${replyCount++}`;
      const introId = `${replyId}-intro`;
      const codeId = `${replyId}-code`;
      const outroId = `${replyId}-outro`;

      return new ReadableStream({
        async start(controller) {
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

          controller.enqueue({ kind: "finish", messageId: replyId });
          controller.close();
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
      label="Write your prompt..."
      .userId=${"me"}
      .partElements=${{ code: renderCodePart }}
      .adapter=${createStreamingCodeAgentAdapter()}
    >
      <chx-message-list scroll-behavior="smooth">
        <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
      </chx-message-list>
      <chx-message-composer>
        <md-button slot="actions" variant="text">Send</md-button>
      </chx-message-composer>
    </chx-chat>
  `,
};
