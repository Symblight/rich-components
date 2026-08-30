import { expect, fixture, html } from "@open-wc/testing";

import "../../index.js";
import "../message-list/message-list.js";
/** @import { ChxChat } from "./chat.js" */
/** @import { ChxMessageList } from "../message-list/message-list.js" */

describe("chx-chat", () => {
  describe("messages", () => {
    it("sending a message updates the internal store and fires chx-messages-change synchronously", async () => {
      const el = /** @type {ChxChat} */ (
        await fixture(html`<chx-chat><chx-message-list></chx-message-list></chx-chat>`)
      );
      el.userId = "me"; // userId's default Lit attribute name is lowercased, not kebab-cased —
      //   "user-id" as a plain attribute never binds, so this is set as a property instead
      await el.updateComplete;

      /** @type {CustomEvent | undefined} */
      let changeEvent;
      el.addEventListener("chx-messages-change", (event) => {
        changeEvent = /** @type {CustomEvent} */ (event);
      });

      el.dispatchEvent(
        new CustomEvent("chx-send-message", {
          detail: { value: "hello", html: "hello", attachments: [], commands: [] },
        }),
      );

      expect(changeEvent).to.exist;
      const messages = /** @type {CustomEvent} */ (changeEvent).detail.messages;
      expect(messages).to.have.lengthOf(1);
      expect(messages[0].own).to.be.true;
      expect(messages[0].authorId).to.equal("me");
      expect(messages[0].status).to.equal("sending");
      expect(messages[0].parts[0]).to.include({ type: "text", text: "hello", html: "hello" });

      await el.updateComplete;
      const list = /** @type {ChxMessageList} */ (el.querySelector("chx-message-list"));
      expect(list.messages).to.have.lengthOf(1);
      expect(list.messages[0].id).to.equal(messages[0].id);
    });

    it("assigning a new messages array externally replaces internal state", async () => {
      const el = /** @type {ChxChat} */ (
        await fixture(html`<chx-chat><chx-message-list></chx-message-list></chx-chat>`)
      );
      await el.updateComplete;

      const externalMessages = [
        { id: "ext-1", own: false, createdAt: Date.now(), parts: [{ id: "ext-1-t1", type: "text", text: "hi" }] },
      ];
      el.messages = externalMessages;
      await el.updateComplete;

      const list = /** @type {ChxMessageList} */ (el.querySelector("chx-message-list"));
      expect(list.messages).to.equal(externalMessages);
    });

    it("reassigning the same messages reference never re-enters the external-sync/validate branch", async () => {
      // Mutating an array in place and reassigning the *same* reference means #internalMessages
      // (which holds that exact reference) trivially reflects the mutation too — arrays are
      // pass-by-reference, chx-chat can't shield against that (this is precisely the "hand in a
      // new reference" gotcha the spec warns about). What chx-chat *does* guarantee is that Lit's
      // default reference-equality check means willUpdate's own external-sync branch (which calls
      // validateMessages) never re-runs for a same-reference reassignment — observable via
      // validateMessages' console.error, since the mutation below introduces an id-less message
      // that would otherwise be flagged.
      const el = /** @type {ChxChat} */ (
        await fixture(html`<chx-chat><chx-message-list></chx-message-list></chx-chat>`)
      );
      await el.updateComplete;

      const externalMessages = [
        { id: "ext-1", own: false, createdAt: Date.now(), parts: [{ id: "ext-1-t1", type: "text", text: "hi" }] },
      ];
      el.messages = externalMessages;
      await el.updateComplete;

      const originalError = console.error;
      /** @type {unknown[][]} */
      const errorCalls = [];
      console.error = (...args) => errorCalls.push(args);
      try {
        externalMessages.push(/** @type {any} */ ({ own: false, createdAt: Date.now(), parts: [] }));
        el.messages = externalMessages;
        await el.updateComplete;
      } finally {
        console.error = originalError;
      }

      expect(errorCalls).to.have.lengthOf(0);
    });
  });

  describe("streaming", () => {
    /**
     * @param {ChxChat} el
     * @param {(message: import("../../types/message.js").ChxMessage) => boolean} predicate
     */
    function waitForMessage(el, predicate, timeout = 2000) {
      return /** @type {Promise<import("../../types/message.js").ChxMessage>} */ (
        new Promise((resolve, reject) => {
          const handler = (/** @type {CustomEvent} */ event) => {
            const found = event.detail.messages.find(predicate);
            if (!found) return;
            cleanup();
            resolve(found);
          };
          const timer = setTimeout(() => {
            cleanup();
            reject(new Error("timed out waiting for message"));
          }, timeout);
          function cleanup() {
            el.removeEventListener("chx-messages-change", /** @type {EventListener} */ (handler));
            clearTimeout(timer);
          }
          el.addEventListener("chx-messages-change", /** @type {EventListener} */ (handler));
        })
      );
    }

    /** @param {unknown[]} items */
    function streamOf(items) {
      return new ReadableStream({
        start(controller) {
          for (const item of items) controller.enqueue(item);
          controller.close();
        },
      });
    }

    /** @param {() => ReadableStream} makeStream */
    async function setupChat(makeStream) {
      const el = /** @type {ChxChat} */ (await fixture(html`<chx-chat></chx-chat>`));
      el.userId = "me";
      el.chunkBatchIntervalMs = 5;
      el.adapter = { sendMessage: async () => makeStream() };
      await el.updateComplete;
      return el;
    }

    it("processes delta chunks into the right final state, batched at the configured interval", async () => {
      const el = await setupChat(() =>
        streamOf([
          { messageId: "reply-1", authorId: "assistant", partId: "reply-1-t1", delta: { text: "Hel" } },
          { messageId: "reply-1", authorId: "assistant", partId: "reply-1-t1", delta: { text: "lo" } },
          { kind: "finish", messageId: "reply-1" },
        ]),
      );

      const sent = waitForMessage(el, (m) => m.id === "reply-1" && m.status === "sent");
      el.dispatchEvent(
        new CustomEvent("chx-send-message", {
          detail: { value: "hi", html: "hi", attachments: [], commands: [] },
        }),
      );
      const reply = await sent;

      expect(reply.own).to.be.false;
      expect(reply.authorId).to.equal("assistant");
      expect(reply.parts).to.have.lengthOf(1);
      expect(reply.parts[0].text).to.equal("Hello"); // both deltas landed in one flushed batch
      expect(reply.parts[0].state).to.equal("done");
    });

    it("an abort chunk sets the reply's status to cancelled", async () => {
      const el = await setupChat(() =>
        streamOf([
          { messageId: "reply-1", authorId: "assistant", partId: "reply-1-t1", delta: { text: "wait" } },
          { kind: "abort", messageId: "reply-1" },
        ]),
      );

      const cancelled = waitForMessage(el, (m) => m.id === "reply-1" && m.status === "cancelled");
      el.dispatchEvent(
        new CustomEvent("chx-send-message", {
          detail: { value: "hi", html: "hi", attachments: [], commands: [] },
        }),
      );
      await cancelled;
    });

    it("a stream ending without a finish/abort chunk fails the origin message", async () => {
      const el = await setupChat(() =>
        streamOf([{ messageId: "reply-1", partId: "reply-1-t1", delta: { text: "partial" } }]),
      );

      /** @type {CustomEvent | undefined} */
      let errorEvent;
      el.addEventListener(
        "chx-send-error",
        /** @type {EventListener} */ ((event) => (errorEvent = /** @type {CustomEvent} */ (event))),
      );

      const failed = waitForMessage(el, (m) => m.own === true && m.status === "failed");
      el.dispatchEvent(
        new CustomEvent("chx-send-message", {
          detail: { value: "hi", html: "hi", attachments: [], commands: [] },
        }),
      );
      const origin = await failed;

      expect(origin.error?.message).to.include("disconnect");
      expect(errorEvent).to.exist;
      expect(errorEvent?.detail.messageId).to.equal(origin.id);
    });

    it("also finalizes an orphaned reply left mid-stream when the origin send fails", async () => {
      const el = await setupChat(() =>
        streamOf([{ messageId: "reply-1", partId: "reply-1-t1", delta: { text: "partial" } }]),
      );

      /** @type {any[]} */
      let lastSnapshot = [];
      el.addEventListener(
        "chx-messages-change",
        /** @type {EventListener} */ ((e) => (lastSnapshot = /** @type {CustomEvent} */ (e).detail.messages)),
      );

      const failed = waitForMessage(el, (m) => m.own === true && m.status === "failed");
      el.dispatchEvent(
        new CustomEvent("chx-send-message", {
          detail: { value: "hi", html: "hi", attachments: [], commands: [] },
        }),
      );
      const origin = await failed;

      // reply-1 was already committed (buffer.flushAll() runs before processStream's own throw,
      // see processStream.js) with status "sending" and its one part still "streaming" — left that
      // way forever unless #deliver's catch closes it out too, not just the origin send. Both land
      // in the very same chx-messages-change as the origin's own "failed" — one #applyMessages call.
      const reply = lastSnapshot.find((m) => m.id === "reply-1");
      expect(reply.status).to.equal("failed");
      expect(reply.parts[0].state).to.equal("done");
      expect(reply.replyToId).to.equal(origin.id);
    });

    it("drops a duplicate eventId chunk", async () => {
      const el = await setupChat(() =>
        streamOf([
          { eventId: "e1", chunk: { messageId: "reply-1", partId: "reply-1-t1", delta: { text: "Hi" } } },
          { eventId: "e1", chunk: { messageId: "reply-1", partId: "reply-1-t1", delta: { text: "Hi" } } },
          { kind: "finish", messageId: "reply-1" },
        ]),
      );

      const sent = waitForMessage(el, (m) => m.id === "reply-1" && m.status === "sent");
      el.dispatchEvent(
        new CustomEvent("chx-send-message", {
          detail: { value: "hi", html: "hi", attachments: [], commands: [] },
        }),
      );
      const reply = await sent;

      expect(reply.parts[0].text).to.equal("Hi"); // not "HiHi" — the duplicate was dropped
    });
  });

  describe("retry / regenerate / cancel", () => {
    /**
     * @param {ChxChat} el
     * @param {(message: any) => boolean} predicate
     */
    function waitForMessage(el, predicate, timeout = 2000) {
      return /** @type {Promise<any>} */ (
        new Promise((resolve, reject) => {
          const handler = (/** @type {CustomEvent} */ event) => {
            const found = event.detail.messages.find(predicate);
            if (!found) return;
            cleanup();
            resolve(found);
          };
          const timer = setTimeout(() => {
            cleanup();
            reject(new Error("timed out waiting for message"));
          }, timeout);
          function cleanup() {
            el.removeEventListener("chx-messages-change", /** @type {EventListener} */ (handler));
            clearTimeout(timer);
          }
          el.addEventListener("chx-messages-change", /** @type {EventListener} */ (handler));
        })
      );
    }

    /** @param {unknown[]} items */
    function streamOf(items) {
      return new ReadableStream({
        start(controller) {
          for (const item of items) controller.enqueue(item);
          controller.close();
        },
      });
    }

    it("retry on a message that isn't 'failed' is a no-op", async () => {
      let sendCalled = false;
      const el = /** @type {ChxChat} */ (await fixture(html`<chx-chat></chx-chat>`));
      el.adapter = {
        sendMessage: async () => {
          sendCalled = true;
        },
      };
      el.messages = [
        /** @type {any} */ ({ id: "m1", own: true, createdAt: Date.now(), status: "sending", parts: [] }),
      ];
      await el.updateComplete;

      let changeFired = false;
      el.addEventListener("chx-messages-change", () => (changeFired = true));

      el.retry("m1");
      await el.updateComplete;

      expect(changeFired).to.be.false;
      expect(sendCalled).to.be.false;
    });

    it("retry on a failed message resets status to sending, clears error, and re-delivers", async () => {
      let sendCalled = false;
      const el = /** @type {ChxChat} */ (await fixture(html`<chx-chat></chx-chat>`));
      el.userId = "me";
      el.adapter = {
        sendMessage: async () => {
          sendCalled = true;
          return streamOf([{ kind: "finish", messageId: "reply-1" }]);
        },
      };
      el.messages = [
        /** @type {any} */ ({
          id: "m1",
          own: true,
          authorId: "me",
          createdAt: Date.now(),
          status: "failed",
          error: { message: "boom" },
          parts: [{ id: "m1-t1", type: "text", text: "hi" }],
        }),
      ];
      await el.updateComplete;

      const resent = waitForMessage(el, (m) => m.id === "m1" && m.status === "sending");
      el.retry("m1");
      const resetMessage = await resent;

      expect(resetMessage.error).to.be.undefined;
      expect(sendCalled).to.be.true;
    });

    it("retry drops a stale reply anchored to the failed send, so a successful retry doesn't leave two replies", async () => {
      const el = /** @type {ChxChat} */ (await fixture(html`<chx-chat></chx-chat>`));
      el.userId = "me";
      el.adapter = {
        sendMessage: async () => streamOf([{ kind: "finish", messageId: "reply-2" }]),
      };
      el.messages = [
        /** @type {any} */ ({
          id: "m1",
          own: true,
          authorId: "me",
          createdAt: Date.now(),
          status: "failed",
          error: { message: "boom" },
          parts: [{ id: "m1-t1", type: "text", text: "hi" }],
        }),
        // left behind by a previous attempt — some parts reached "done" before the send itself
        // failed, then finalized to status "failed" too (see #deliver's own catch)
        /** @type {any} */ ({
          id: "reply-1",
          own: false,
          authorId: "assistant",
          createdAt: Date.now(),
          status: "failed",
          replyToId: "m1",
          parts: [{ id: "reply-1-t1", type: "text", text: "partial", state: "done" }],
        }),
      ];
      await el.updateComplete;

      /** @type {any[]} */
      let lastSnapshot = [];
      el.addEventListener(
        "chx-messages-change",
        /** @type {EventListener} */ ((e) => (lastSnapshot = /** @type {CustomEvent} */ (e).detail.messages)),
      );

      const resent = waitForMessage(el, (m) => m.id === "m1" && m.status === "sending");
      el.retry("m1");
      await resent;

      // the very first chx-messages-change after retry() already has the stale reply gone — same
      // no-round-trip-gap guarantee regenerate() already has, see the test right below
      expect(lastSnapshot.some((m) => m.id === "reply-1")).to.be.false;
      expect(lastSnapshot.some((m) => m.id === "m1")).to.be.true;
    });

    it("regenerate removes the old reply before the new one's first chunk lands", async () => {
      const el = /** @type {ChxChat} */ (await fixture(html`<chx-chat></chx-chat>`));
      el.userId = "me";
      el.adapter = {
        regenerate: async () =>
          streamOf([
            { messageId: "reply-2", authorId: "assistant", partId: "reply-2-t1", delta: { text: "new" } },
            { kind: "finish", messageId: "reply-2" },
          ]),
      };
      el.messages = [
        /** @type {any} */ ({ id: "user-1", own: true, authorId: "me", createdAt: Date.now(), status: "sent", parts: [] }),
        /** @type {any} */ ({
          id: "reply-1",
          own: false,
          authorId: "assistant",
          createdAt: Date.now(),
          status: "sent",
          replyToId: "user-1",
          parts: [{ id: "reply-1-t1", type: "text", text: "old", state: "done" }],
        }),
      ];
      await el.updateComplete;

      /** @type {any[][]} */
      const snapshots = [];
      el.addEventListener(
        "chx-messages-change",
        /** @type {EventListener} */ ((e) => snapshots.push(/** @type {CustomEvent} */ (e).detail.messages)),
      );

      const done = waitForMessage(el, (m) => m.id === "reply-2" && m.status === "sent");
      el.regenerate("reply-1"); // by the reply's own id
      await done;

      // the very first chx-messages-change after regenerate() already has the old reply gone —
      // no round-trip gap before the fresh reply's first chunk lands
      const afterRemoval = snapshots[0];
      expect(afterRemoval.some((m) => m.id === "reply-1")).to.be.false;
      expect(afterRemoval.some((m) => m.id === "user-1")).to.be.true;
    });

    it("regenerate is a no-op when adapter.regenerate is unset", async () => {
      const el = /** @type {ChxChat} */ (await fixture(html`<chx-chat></chx-chat>`));
      el.messages = [
        /** @type {any} */ ({ id: "user-1", own: true, createdAt: Date.now(), status: "sent", parts: [] }),
        /** @type {any} */ ({
          id: "reply-1",
          own: false,
          createdAt: Date.now(),
          status: "sent",
          replyToId: "user-1",
          parts: [],
        }),
      ];
      await el.updateComplete;

      let changeFired = false;
      el.addEventListener("chx-messages-change", () => (changeFired = true));
      el.regenerate("reply-1");
      await el.updateComplete;

      expect(changeFired).to.be.false;
    });

    it("cancel aborts the in-flight delivery — status ends up cancelled, not failed, and skips chx-send-error", async () => {
      const el = /** @type {ChxChat} */ (await fixture(html`<chx-chat></chx-chat>`));
      el.userId = "me";
      el.adapter = {
        sendMessage: (_message, { signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      };
      await el.updateComplete;

      let errorFired = false;
      el.addEventListener("chx-send-error", () => (errorFired = true));

      let sentId = "";
      el.addEventListener(
        "chx-messages-change",
        /** @type {EventListener} */ ((e) => {
          if (!sentId) sentId = /** @type {CustomEvent} */ (e).detail.messages[0].id;
        }),
        { once: true },
      );

      const cancelled = waitForMessage(el, (m) => m.status === "cancelled");
      el.dispatchEvent(
        new CustomEvent("chx-send-message", {
          detail: { value: "hi", html: "hi", attachments: [], commands: [] },
        }),
      );
      el.cancel(sentId);
      const cancelledMessage = await cancelled;

      expect(cancelledMessage.id).to.equal(sentId);
      expect(errorFired).to.be.false;
    });

    it("cancel during an in-flight regenerate finalizes the fresh reply it already started, instead of losing it silently", async () => {
      const el = /** @type {ChxChat} */ (await fixture(html`<chx-chat></chx-chat>`));
      el.userId = "me";
      el.chunkBatchIntervalMs = 5;
      el.adapter = {
        regenerate: (_replyId, { signal }) =>
          Promise.resolve(
            new ReadableStream({
              start(controller) {
                // delivered as soon as a reader attaches — the delta below lands, reply-2's shell
                // gets created and flushed, well before cancel() below ever fires
                controller.enqueue({
                  messageId: "reply-2",
                  authorId: "assistant",
                  partId: "reply-2-t1",
                  delta: { text: "new" },
                });
              },
              pull(controller) {
                // the *next* read after that — stays pending until cancel() aborts the signal,
                // simulating a real fetch/EventSource that only notices cancellation mid-read
                return new Promise((_resolve, reject) => {
                  signal.addEventListener("abort", () => {
                    controller.error(new DOMException("aborted", "AbortError"));
                    reject(new DOMException("aborted", "AbortError"));
                  });
                });
              },
            }),
          ),
      };
      el.messages = [
        /** @type {any} */ ({ id: "user-1", own: true, authorId: "me", createdAt: Date.now(), status: "sent", parts: [] }),
        /** @type {any} */ ({
          id: "reply-1",
          own: false,
          authorId: "assistant",
          createdAt: Date.now(),
          status: "sent",
          replyToId: "user-1",
          parts: [{ id: "reply-1-t1", type: "text", text: "old", state: "done" }],
        }),
      ];
      await el.updateComplete;

      let errorFired = false;
      el.addEventListener("chx-send-error", () => (errorFired = true));

      const streaming = waitForMessage(el, (m) => m.id === "reply-2" && m.status === "sending");
      el.regenerate("reply-1");
      await streaming; // the fresh reply has landed — only now cancel it mid-flight

      const cancelled = waitForMessage(el, (m) => m.id === "reply-2" && m.status === "cancelled");
      el.cancel("reply-1"); // #activeDeliveries is still keyed by the old reply's id, see #deliverRegenerate
      const reply = await cancelled;

      expect(reply.replyToId).to.equal("user-1");
      expect(reply.parts[0].state).to.equal("done"); // the one part it had started was finalized too
      expect(errorFired).to.be.false; // a user-initiated cancellation, not a genuine failure
    });

    it("disconnecting the host aborts any still in-flight delivery", async () => {
      const el = /** @type {ChxChat} */ (await fixture(html`<chx-chat></chx-chat>`));
      el.userId = "me";
      let aborted = false;
      el.adapter = {
        sendMessage: (_message, { signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              aborted = true;
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      };
      await el.updateComplete;

      el.dispatchEvent(
        new CustomEvent("chx-send-message", {
          detail: { value: "hi", html: "hi", attachments: [], commands: [] },
        }),
      );
      await el.updateComplete;

      el.remove(); // same reasoning as PaginationController's own hostDisconnected() — a torn-down
      //   host must not leave a fetch running past teardown

      expect(aborted).to.be.true;
    });
  });

  describe("subscribe / getMessages / connectionState", () => {
    /**
     * @param {ChxChat} el
     * @param {(message: any) => boolean} predicate
     */
    function waitForMessage(el, predicate, timeout = 2000) {
      return /** @type {Promise<any>} */ (
        new Promise((resolve, reject) => {
          const handler = (/** @type {CustomEvent} */ event) => {
            const found = event.detail.messages.find(predicate);
            if (!found) return;
            cleanup();
            resolve(found);
          };
          const timer = setTimeout(() => {
            cleanup();
            reject(new Error("timed out waiting for message"));
          }, timeout);
          function cleanup() {
            el.removeEventListener("chx-messages-change", /** @type {EventListener} */ (handler));
            clearTimeout(timer);
          }
          el.addEventListener("chx-messages-change", /** @type {EventListener} */ (handler));
        })
      );
    }

    it("calls adapter.subscribe once on connect, and its returned unsubscribe on disconnect", async () => {
      let unsubscribeCalled = false;
      /** @type {any} */
      let handlersReceived;
      let subscribeCallCount = 0;
      const el = /** @type {ChxChat} */ (document.createElement("chx-chat"));
      el.adapter = {
        subscribe: (handlers) => {
          subscribeCallCount++;
          handlersReceived = handlers;
          return () => (unsubscribeCalled = true);
        },
      };

      try {
        document.body.append(el);
        await el.updateComplete;

        expect(subscribeCallCount).to.equal(1);
        expect(handlersReceived.onMessage).to.be.a("function");
        expect(handlersReceived.onChunk).to.be.a("function");
        expect(handlersReceived.onTyping).to.be.a("function");
        expect(handlersReceived.onConnectionChange).to.be.a("function");
        expect(unsubscribeCalled).to.be.false;

        el.remove();
        expect(unsubscribeCalled).to.be.true;
      } finally {
        el.remove();
      }
    });

    it("subscribe's onMessage adds an ingested message via addMessage", async () => {
      /** @type {any} */
      let handlers;
      const el = /** @type {ChxChat} */ (document.createElement("chx-chat"));
      el.userId = "me";
      el.adapter = {
        subscribe: (h) => {
          handlers = h;
          return () => {};
        },
      };

      try {
        document.body.append(el);
        await el.updateComplete;

        const changed = waitForMessage(el, (m) => m.id === "incoming-1");
        handlers.onMessage({ id: "incoming-1", authorId: "them", createdAt: Date.now(), parts: [] });
        const message = await changed;

        expect(message.own).to.be.false; // authorId "them" !== userId "me"
      } finally {
        el.remove();
      }
    });

    it("subscribe's onChunk feeds StreamController.applyChunk", async () => {
      /** @type {any} */
      let handlers;
      const el = /** @type {ChxChat} */ (document.createElement("chx-chat"));
      el.adapter = {
        subscribe: (h) => {
          handlers = h;
          return () => {};
        },
      };

      try {
        document.body.append(el);
        await el.updateComplete;

        const sent = waitForMessage(el, (m) => m.id === "r1" && m.status === "sent");
        handlers.onChunk({ messageId: "r1", partId: "r1-t1", delta: { text: "hi" } });
        handlers.onChunk({ kind: "finish", messageId: "r1" });
        await sent;
      } finally {
        el.remove();
      }
    });

    it("calls adapter.listMessages once on connect and applies the result directly", async () => {
      let callCount = 0;
      const el = /** @type {ChxChat} */ (document.createElement("chx-chat"));
      el.adapter = {
        listMessages: async () => {
          callCount++;
          return {
            messages: /** @type {any} */ ([
              { id: "hist-1", own: false, createdAt: Date.now(), parts: [] },
            ]),
          };
        },
      };

      try {
        const changed = waitForMessage(el, (m) => m.id === "hist-1");
        document.body.append(el);
        await changed;

        expect(callCount).to.equal(1);
      } finally {
        el.remove();
      }
    });

    it("onConnectionChange updates connectionState (reflected) and fires chx-connection-change", async () => {
      /** @type {any} */
      let handlers;
      const el = /** @type {ChxChat} */ (document.createElement("chx-chat"));
      el.adapter = {
        subscribe: (h) => {
          handlers = h;
          return () => {};
        },
      };

      try {
        document.body.append(el);
        await el.updateComplete;

        /** @type {CustomEvent | undefined} */
        let event;
        el.addEventListener(
          "chx-connection-change",
          /** @type {EventListener} */ ((e) => (event = /** @type {CustomEvent} */ (e))),
        );

        handlers.onConnectionChange("connecting");
        await el.updateComplete;
        expect(el.connectionState).to.equal("connecting");
        expect(el.getAttribute("connection-state")).to.equal("connecting");
        expect(event?.detail).to.deep.equal({ state: "connecting" });

        const error = new Error("boom");
        handlers.onConnectionChange("error", error);
        await el.updateComplete;
        expect(el.connectionState).to.equal("error");
        expect(event?.detail.state).to.equal("error");
        expect(event?.detail.error).to.equal(error);
      } finally {
        el.remove();
      }
    });
  });

  describe("loadMoreHistory", () => {
    it("prepends the result and no-ops without a matching adapter/in-flight/hasMore state", async () => {
      const el = /** @type {ChxChat} */ (await fixture(html`<chx-chat></chx-chat>`));
      el.messages = [/** @type {any} */ ({ id: "m2", own: false, createdAt: Date.now(), parts: [] })];
      await el.updateComplete;

      // no adapter.listMessages at all — a no-op, not an error
      await el.loadMoreHistory();
      expect(el.messages).to.have.lengthOf(1);

      let calls = 0;
      el.adapter = {
        listMessages: async ({ cursor, direction }) => {
          calls++;
          expect(direction).to.equal("backward");
          expect(cursor).to.be.undefined; // first call — nothing cursored yet
          return {
            messages: /** @type {any} */ ([
              { id: "m1", own: false, createdAt: Date.now(), parts: [] },
            ]),
            cursor: "cursor-2",
            hasMore: false,
          };
        },
      };

      const changed = new Promise((resolve) =>
        el.addEventListener("chx-messages-change", (e) => resolve(/** @type {CustomEvent} */ (e).detail.messages), {
          once: true,
        }),
      );
      await el.loadMoreHistory();
      const messages = /** @type {any[]} */ (await changed);

      expect(calls).to.equal(1);
      expect(messages.map((m) => m.id)).to.deep.equal(["m1", "m2"]); // prepended, not replaced

      // hasMore: false from the previous call — a further call is a no-op
      await el.loadMoreHistory();
      expect(calls).to.equal(1);
    });

    it("doesn't call listMessages again while a call is already in flight", async () => {
      let calls = 0;
      /** @type {(value: any) => void} */
      let resolveFirst = () => {};
      const el = /** @type {ChxChat} */ (await fixture(html`<chx-chat></chx-chat>`));
      el.adapter = {
        listMessages: () =>
          new Promise((resolve) => {
            calls++;
            resolveFirst = resolve;
          }),
      };
      await el.updateComplete;

      const first = el.loadMoreHistory();
      const second = el.loadMoreHistory(); // fired before the first resolves
      resolveFirst({ messages: [] });
      await Promise.all([first, second]);

      expect(calls).to.equal(1);
    });

    it("chx-load-more (dispatched by chx-message-list) triggers loadMoreHistory", async () => {
      let calls = 0;
      const el = /** @type {ChxChat} */ (
        await fixture(html`<chx-chat><chx-message-list></chx-message-list></chx-chat>`)
      );
      el.adapter = {
        listMessages: async () => {
          calls++;
          return { messages: [] };
        },
      };
      await el.updateComplete;

      el.dispatchEvent(new CustomEvent("chx-load-more", { bubbles: true, composed: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(calls).to.be.greaterThan(0);
    });
  });

  describe("setTyping", () => {
    it("pushes typing down to chx-message-list and fires chx-typing-change", async () => {
      const el = /** @type {ChxChat} */ (
        await fixture(html`<chx-chat><chx-message-list></chx-message-list></chx-chat>`)
      );
      const list = /** @type {ChxMessageList} */ (el.messageListElement);
      expect(list.typing).to.be.false;

      /** @type {CustomEvent | undefined} */
      let changeEvent;
      el.addEventListener("chx-typing-change", (event) => {
        changeEvent = /** @type {CustomEvent} */ (event);
      });

      el.setTyping(true);
      await el.updateComplete;

      expect(list.typing).to.be.true;
      expect(changeEvent?.detail).to.deep.equal({ typing: true });
    });

    it("is a no-op (no re-fired event) when called with the value already in effect", async () => {
      const el = /** @type {ChxChat} */ (
        await fixture(html`<chx-chat><chx-message-list></chx-message-list></chx-chat>`)
      );
      el.setTyping(true);
      await el.updateComplete;

      let fireCount = 0;
      el.addEventListener("chx-typing-change", () => fireCount++);

      el.setTyping(true); // same value again
      await el.updateComplete;

      expect(fireCount).to.equal(0);
    });

    it("subscribe's onTyping drives the same state as calling setTyping() directly", async () => {
      /** @type {any} */
      let handlers;
      const el = /** @type {ChxChat} */ (document.createElement("chx-chat"));
      el.adapter = {
        subscribe: (h) => {
          handlers = h;
          return () => {};
        },
      };
      el.append(document.createElement("chx-message-list"));

      try {
        document.body.append(el);
        await el.updateComplete;

        const list = /** @type {ChxMessageList} */ (el.messageListElement);
        handlers.onTyping(true);
        await el.updateComplete;

        expect(list.typing).to.be.true;
      } finally {
        el.remove();
      }
    });
  });

  describe("streaming (derived from in-flight deliveries)", () => {
    it("is true from the moment a send starts until the reply's first chunk creates its shell", async () => {
      /** @type {(stream: ReadableStream) => void} */
      let resolveSendMessage = () => {};
      const el = /** @type {ChxChat} */ (
        await fixture(html`<chx-chat><chx-message-list></chx-message-list></chx-chat>`)
      );
      el.userId = "me";
      el.adapter = {
        sendMessage: () =>
          new Promise((resolve) => {
            resolveSendMessage = resolve;
          }),
      };
      await el.updateComplete;
      const list = /** @type {ChxMessageList} */ (el.messageListElement);
      expect(list.streaming).to.be.false;

      el.dispatchEvent(
        new CustomEvent("chx-send-message", {
          detail: { value: "hi", html: "hi", attachments: [], commands: [] },
        }),
      );
      await el.updateComplete;
      expect(list.streaming).to.be.true; // send is in flight, adapter.sendMessage hasn't even resolved

      /** @type {ReadableStreamDefaultController} */
      let streamController = /** @type {any} */ (undefined);
      resolveSendMessage(
        new ReadableStream({
          start(controller) {
            streamController = controller;
          },
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(list.streaming).to.be.true; // stream exists, but no chunk has landed yet

      const replyReceived = new Promise((resolve) => {
        const handler = (/** @type {CustomEvent} */ event) => {
          if (event.detail.messages.some((/** @type {any} */ m) => m.replyToId)) {
            el.removeEventListener("chx-messages-change", /** @type {EventListener} */ (handler));
            resolve(undefined);
          }
        };
        el.addEventListener("chx-messages-change", /** @type {EventListener} */ (handler));
      });
      streamController.enqueue(
        /** @type {any} */ ({
          messageId: "reply-1",
          authorId: "assistant",
          partId: "reply-1-t1",
          partType: "text",
          delta: { text: "hi" },
        }),
      );
      await replyReceived;
      await el.updateComplete;
      expect(list.streaming).to.be.false; // reply shell now exists — no longer "waiting"

      streamController.enqueue(/** @type {any} */ ({ kind: "finish", messageId: "reply-1" }));
      streamController.close();
    });

    it("stays false once a message exists, even while its parts are still streaming", async () => {
      const el = /** @type {ChxChat} */ (
        await fixture(html`<chx-chat><chx-message-list></chx-message-list></chx-chat>`)
      );
      el.userId = "me";
      el.adapter = {
        sendMessage: async () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                /** @type {any} */ ({
                  messageId: "reply-1",
                  authorId: "assistant",
                  partId: "reply-1-t1",
                  partType: "text",
                  delta: { text: "hi" },
                }),
              );
              // deliberately never closes/finishes — part stays state:"streaming" indefinitely
            },
          }),
      };
      await el.updateComplete;
      const list = /** @type {ChxMessageList} */ (el.messageListElement);

      const sent = new Promise((resolve) => {
        const handler = (/** @type {CustomEvent} */ event) => {
          if (event.detail.messages.some((/** @type {any} */ m) => m.replyToId)) {
            el.removeEventListener("chx-messages-change", /** @type {EventListener} */ (handler));
            resolve(undefined);
          }
        };
        el.addEventListener("chx-messages-change", /** @type {EventListener} */ (handler));
      });
      el.dispatchEvent(
        new CustomEvent("chx-send-message", {
          detail: { value: "hi", html: "hi", attachments: [], commands: [] },
        }),
      );
      await sent;
      await el.updateComplete;

      expect(list.streaming).to.be.false; // the "streaming" (in-message dots, once a message
      //   exists) phase is a deliberately different concern from this slot's "waiting, no message
      //   yet" one
    });
  });
});
