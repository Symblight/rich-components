import { expect, fixture, html } from "@open-wc/testing";

import "../../index.js";
import "../streaming-indicator/streaming-indicator.js";
import "../scroll-to-bottom-affordance/scroll-to-bottom-affordance.js";
/** @import { ChxChat } from "../base/chat.js" */

const VIEWPORT = 400;
/** px of reply per streamed character, so a test reads heights straight off the text */
const PX_PER_CHAR = 10;

/** @param {() => boolean} predicate */
async function waitFor(predicate, timeout = 3000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Resolves once `scrollTop` and `scrollHeight` have held still for `quiet` ms. @param {HTMLElement} scroller */
async function settled(scroller, quiet = 300) {
  let last = `${scroller.scrollTop}/${scroller.scrollHeight}`;
  let since = Date.now();
  const start = Date.now();
  while (Date.now() - since < quiet && Date.now() - start < 5000) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const now = `${scroller.scrollTop}/${scroller.scrollHeight}`;
    if (now !== last) {
      last = now;
      since = Date.now();
    }
  }
}

/** A fake agent: each send opens a reply stream the test writes to. */
function createAgent() {
  /** @type {ReadableStreamDefaultController<any> | undefined} */
  let stream;
  let replyId = "";
  let partText = "";
  let turn = 0;
  return {
    adapter: {
      sendMessage: async () =>
        new ReadableStream({
          start(controller) {
            stream = controller;
            replyId = `reply-${turn++}`;
            partText = "";
          },
        }),
    },
    /** Streams `px` more pixels of reply. @param {number} px */
    say(px) {
      const text = "x".repeat(px / PX_PER_CHAR);
      partText += text;
      stream?.enqueue({
        messageId: replyId,
        authorId: "assistant",
        partId: `${replyId}-t1`,
        partType: "text",
        delta: { text },
      });
    },
    finish() {
      stream?.enqueue({ kind: "finish", messageId: replyId });
      stream?.close();
    },
    get replyId() {
      return replyId;
    },
    get replyHeight() {
      return partText.length * PX_PER_CHAR;
    },
  };
}

/** A text part as a block exactly as tall as its text says. */
const partElements = {
  text: (/** @type {any} */ part, /** @type {HTMLElement | undefined} */ previous) => {
    const el = previous ?? document.createElement("div");
    el.style.height = `${part.text.length * PX_PER_CHAR}px`;
    return el;
  },
};

/** @param {number} i */
function historyMessage(i) {
  return {
    id: `h${i}`,
    own: i % 2 === 0,
    authorId: i % 2 === 0 ? "me" : "assistant",
    createdAt: i,
    status: "sent",
    parts: [{ id: `h${i}-t1`, type: "text", text: "x".repeat(15) }],
  };
}

/** @param {{ virtualization: boolean }} options */
async function agentChat({ virtualization }) {
  const agent = createAgent();
  const el = /** @type {ChxChat} */ (
    await fixture(html`
      <chx-chat
        style="display: flex; flex-direction: column; height: ${VIEWPORT}px; width: 600px;"
        .userId=${"me"}
        .chunkBatchIntervalMs=${5}
        .noVirtualization=${!virtualization}
        .partElements=${partElements}
        .adapter=${agent.adapter}
        .messages=${Array.from({ length: 12 }, (_, i) => historyMessage(i))}
      >
        <chx-message-list
          slot="message-list"
          content-align="start"
          scroll-mode="pin-top"
          style="height: ${VIEWPORT}px"
        >
          <chx-streaming-indicator slot="streaming"></chx-streaming-indicator>
          <chx-scroll-to-bottom-affordance
            slot="scroll-to-bottom"
          ></chx-scroll-to-bottom-affordance>
        </chx-message-list>
      </chx-chat>
    `)
  );
  const list = /** @type {HTMLElement} */ (el.querySelector("chx-message-list"));
  const infinityScroll = /** @type {HTMLElement} */ (
    list.shadowRoot?.querySelector("chx-infinity-scroll")
  );
  const scroller = /** @type {HTMLElement} */ (
    infinityScroll.shadowRoot?.querySelector(".infinity-scroll__scroller")
  );
  await waitFor(() => scroller.scrollHeight > VIEWPORT * 2);
  await settled(scroller);

  /** @param {string} id */
  const row = (id) =>
    /** @type {HTMLElement | null} */ (
      infinityScroll.shadowRoot?.querySelector(`[data-message-id="${id}"]`) ?? null
    );
  const top = () => scroller.getBoundingClientRect().top;
  const bottom = () => scroller.getBoundingClientRect().bottom;

  return {
    el,
    list,
    agent,
    scroller,
    row,
    /** The last own message's id. */
    get sentId() {
      return /** @type {any} */ (el).store.getMessages().findLast((/** @type {any} */ m) => m.own)
        .id;
    },
    /** @param {string} id Whether `id`'s row sits at the top of the viewport. */
    isPinned(id) {
      const rect = row(id)?.getBoundingClientRect();
      return !!rect && rect.top >= top() - 1 && rect.top - top() < 24;
    },
    /** @param {string} id */
    isAboveView(id) {
      const rect = row(id)?.getBoundingClientRect();
      return !rect || rect.bottom <= top() + 1;
    },
    distanceToBottom() {
      return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    },
    streamingIndicator() {
      return /** @type {HTMLElement} */ (el.querySelector("chx-streaming-indicator"));
    },
    affordance() {
      return /** @type {HTMLElement} */ (el.querySelector("chx-scroll-to-bottom-affordance"));
    },
    /** Whether the scroll-to-bottom affordance shows. */
    affordanceShown() {
      const slot = list.shadowRoot?.querySelector('slot[name="scroll-to-bottom"]');
      return (
        !!slot &&
        !slot.hasAttribute("hidden") &&
        this.affordance().getBoundingClientRect().height > 0
      );
    },
    bottom,
    /** @param {string} text */
    async send(text = "question") {
      el.dispatchEvent(
        new CustomEvent("chx-send-message", {
          detail: { value: text, html: text, attachments: [], commands: [] },
        }),
      );
      await settled(scroller);
    },
    /** @param {number} px */
    async say(px) {
      agent.say(px);
      await waitFor(
        () => (row(agent.replyId)?.getBoundingClientRect().height ?? 0) >= agent.replyHeight,
      );
      await settled(scroller);
    },
    async finish() {
      agent.finish();
      await settled(scroller);
    },
    /** A wheel scroll up by `px`. @param {number} px */
    async userScrollUp(px) {
      scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -px }));
      scroller.scrollTop -= px;
      scroller.dispatchEvent(new Event("scroll"));
      await settled(scroller);
    },
    async userScrollToBottom() {
      scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: 10000 }));
      scroller.scrollTop = scroller.scrollHeight;
      scroller.dispatchEvent(new Event("scroll"));
      await settled(scroller);
    },
  };
}

describe("agent chat scrolling (scroll-mode=pin-top)", function () {
  this.timeout(20000);

  for (const virtualization of [true, false]) {
    describe(virtualization ? "virtualized" : "without virtualization", () => {
      const setup = () => agentChat({ virtualization });

      it("1. pins a sent message to the top, the thinking indicator right below it, the rest empty", async () => {
        const chat = await setup();

        await chat.send();

        const sent = /** @type {HTMLElement} */ (chat.row(chat.sentId));
        expect(chat.isPinned(chat.sentId), "sent message pinned").to.be.true;
        const indicator = chat.streamingIndicator().getBoundingClientRect();
        expect(indicator.height, "thinking indicator shown").to.be.greaterThan(0);
        expect(indicator.top - sent.getBoundingClientRect().bottom).to.be.within(-1, 24);
        expect(
          chat.bottom() - indicator.bottom,
          "empty space down to the composer",
        ).to.be.greaterThan(150);
      });

      it("1. the reply fills the space below the sent message from the top", async () => {
        const chat = await setup();
        await chat.send();

        await chat.say(100);

        const sent = /** @type {HTMLElement} */ (chat.row(chat.sentId)).getBoundingClientRect();
        const reply = /** @type {HTMLElement} */ (
          chat.row(chat.agent.replyId)
        ).getBoundingClientRect();
        expect(chat.isPinned(chat.sentId)).to.be.true;
        expect(reply.top - sent.bottom).to.be.within(-1, 24);
        expect(chat.bottom() - reply.bottom, "space still empty below the reply").to.be.greaterThan(
          150,
        );
      });

      it("2./5. keeps the sent message pinned until the reply reaches the composer, then follows its end", async () => {
        const chat = await setup();
        await chat.send();
        const sentId = chat.sentId;

        await chat.say(200);
        expect(chat.isPinned(sentId), "pinned while the reply is short").to.be.true;

        for (let i = 0; i < 4; i++) await chat.say(200);

        expect(chat.distanceToBottom(), "view at the newest content").to.be.at.most(1);
        expect(chat.isAboveView(sentId), "sent message scrolled out above").to.be.true;
      });

      it("3. stops following once the user scrolls: new content leaves the position alone", async () => {
        const chat = await setup();
        await chat.send();
        await chat.say(600);
        await chat.userScrollUp(150);
        const scrollTop = chat.scroller.scrollTop;

        await chat.say(300);
        await chat.say(300);

        expect(chat.scroller.scrollTop).to.be.closeTo(scrollTop, 1);
      });

      it("4. follows again once the user scrolls back to the bottom", async () => {
        const chat = await setup();
        await chat.send();
        await chat.say(600);
        await chat.userScrollUp(150);
        await chat.say(200);

        await chat.userScrollToBottom();
        await chat.say(300);

        expect(chat.distanceToBottom()).to.be.at.most(1);
      });

      it("4. a new send pins the new message and follows its reply, even after scrolling up", async () => {
        const chat = await setup();
        await chat.send();
        await chat.say(600);
        await chat.userScrollUp(300);
        await chat.finish();

        await chat.send("next");
        const sentId = chat.sentId;
        expect(chat.isPinned(sentId), "new message pinned").to.be.true;
        for (let i = 0; i < 4; i++) await chat.say(200);

        expect(chat.distanceToBottom(), "following the new reply").to.be.at.most(1);
      });

      it("6. keeps the empty space and the pin after a short reply completes", async () => {
        const chat = await setup();
        await chat.send();
        await chat.say(100);
        const scrollTop = chat.scroller.scrollTop;

        await chat.finish();

        expect(chat.scroller.scrollTop).to.be.closeTo(scrollTop, 1);
        expect(chat.isPinned(chat.sentId)).to.be.true;
        const reply = /** @type {HTMLElement} */ (
          chat.row(chat.agent.replyId)
        ).getBoundingClientRect();
        expect(chat.bottom() - reply.bottom).to.be.greaterThan(150);
      });

      it("7. shows a scroll-to-bottom button while new content is out of view, hidden at the bottom", async () => {
        const chat = await setup();
        await chat.send();
        await chat.say(800);
        await chat.userScrollToBottom();
        expect(chat.affordanceShown(), "hidden at the bottom").to.be.false;

        await chat.userScrollUp(400);
        await chat.say(200);

        expect(chat.affordanceShown(), "shown once scrolled up").to.be.true;
      });

      it("7. clicking the button scrolls to the bottom, hides it, and follows again", async () => {
        const chat = await setup();
        await chat.send();
        await chat.say(800);
        await chat.userScrollUp(400);

        /** @type {HTMLElement} */ (
          chat.affordance().shadowRoot?.querySelector(".scroll-to-bottom-affordance__button")
        ).click();
        await settled(chat.scroller, 600);
        expect(chat.distanceToBottom(), "at the bottom").to.be.at.most(1);
        expect(chat.affordanceShown(), "hidden at the bottom").to.be.false;
        await chat.say(300);

        expect(chat.distanceToBottom(), "following again").to.be.at.most(1);
      });
    });
  }
});
