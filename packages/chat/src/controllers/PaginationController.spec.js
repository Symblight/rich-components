import { expect } from "@open-wc/testing";

import { PaginationController } from "./PaginationController.js";

/** A minimal ReactiveControllerHost stand-in — just enough for addController()/hostDisconnected(). */
function makeHost() {
  /** @type {{hostDisconnected?: () => void}[]} */
  const controllers = [];
  return {
    addController: (/** @type {{hostDisconnected?: () => void}} */ c) => controllers.push(c),
    disconnect: () => controllers.forEach((c) => c.hostDisconnected?.()),
  };
}

/** @param {{listMessages?: (input: any) => Promise<any>}} [adapter] */
function makeController(adapter, messages = /** @type {any[]} */ ([])) {
  const applied = /** @type {any[][]} */ ([]);
  const host = makeHost();
  const controller = new PaginationController(/** @type {any} */ (host), {
    getAdapter: () => adapter,
    getMessages: () => messages,
    applyMessages: (/** @type {any[]} */ next) => {
      messages = next;
      applied.push(next);
    },
  });
  return { controller, host, applied, getMessages: () => messages };
}

describe("PaginationController", () => {
  describe("loadInitial", () => {
    it("applies the result directly, no merge, and is a no-op without adapter.listMessages", async () => {
      const { controller: noAdapter, applied: noAdapterApplied } = makeController(undefined);
      await noAdapter.loadInitial();
      expect(noAdapterApplied).to.have.lengthOf(0);

      const { controller, applied } = makeController({
        listMessages: async () => ({ messages: [{ id: "m1" }], cursor: "c1", hasMore: true }),
      });
      await controller.loadInitial();
      expect(applied).to.have.lengthOf(1);
      expect(applied[0].map((/** @type {any} */ m) => m.id)).to.deep.equal(["m1"]);
    });
  });

  describe("loadMore", () => {
    it("merges (prepends) the result — decided: prepend, not replace", async () => {
      const { controller, applied, getMessages } = makeController(
        { listMessages: async () => ({ messages: [{ id: "m1" }, { id: "m2" }] }) },
        [{ id: "m3" }],
      );
      await controller.loadMore();
      expect(applied).to.have.lengthOf(1);
      expect(getMessages().map((/** @type {any} */ m) => m.id)).to.deep.equal(["m1", "m2", "m3"]);
    });

    it("dedupes an id already present, for an overlapping cursor boundary", async () => {
      const existing = [{ id: "m2" }];
      const { controller, getMessages } = makeController(
        { listMessages: async () => ({ messages: [{ id: "m1" }, { id: "m2" }] }) },
        existing,
      );
      await controller.loadMore();
      const result = getMessages();
      expect(result.map((/** @type {any} */ m) => m.id)).to.deep.equal(["m1", "m2"]);
      expect(result[1]).to.equal(existing[0]); // the existing entry wins, not the incoming duplicate
    });

    it("passes cursor/direction correctly and updates cursor/hasMore from the result", async () => {
      /** @type {any} */
      let seenInput;
      const { controller } = makeController({
        listMessages: async (input) => {
          seenInput = input;
          return { messages: [], cursor: "next-cursor", hasMore: false };
        },
      });
      await controller.loadMore();
      expect(seenInput.cursor).to.be.undefined;
      expect(seenInput.direction).to.equal("backward");
      expect(seenInput.signal).to.be.instanceOf(AbortSignal);

      // a further call is a no-op — the previous result already reported hasMore: false
      let calls = 0;
      const { controller: exhausted } = makeController({
        listMessages: async () => {
          calls++;
          return { messages: [], hasMore: false };
        },
      });
      await exhausted.loadMore();
      await exhausted.loadMore();
      expect(calls).to.equal(1);
    });

    it("is a no-op without adapter.listMessages, or while a call is already in flight", async () => {
      const { controller: noAdapter, applied } = makeController(undefined);
      await noAdapter.loadMore();
      expect(applied).to.have.lengthOf(0);

      let calls = 0;
      /** @type {(value: any) => void} */
      let resolveFirst = () => {};
      const { controller } = makeController({
        listMessages: () =>
          new Promise((resolve) => {
            calls++;
            resolveFirst = resolve;
          }),
      });
      const first = controller.loadMore();
      const second = controller.loadMore(); // fired before the first resolves
      resolveFirst({ messages: [] });
      await Promise.all([first, second]);
      expect(calls).to.equal(1);
    });
  });

  describe("cancellation", () => {
    it("aborts an in-flight loadMore() on hostDisconnected, and swallows the resulting rejection", async () => {
      /** @type {AbortSignal | undefined} */
      let seenSignal;
      const { controller, host, applied } = makeController({
        listMessages: (input) =>
          new Promise((_resolve, reject) => {
            seenSignal = input.signal;
            input.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      });

      const pending = controller.loadMore();
      expect(seenSignal?.aborted).to.be.false;
      host.disconnect();
      expect(seenSignal?.aborted).to.be.true;

      await pending; // resolves quietly — an abort is not a genuine error, nothing to rethrow
      expect(applied).to.have.lengthOf(0); // never got a result to apply
    });

    it("aborts an in-flight loadInitial() on hostDisconnected the same way", async () => {
      /** @type {AbortSignal | undefined} */
      let seenSignal;
      const { controller, host, applied } = makeController({
        listMessages: (input) =>
          new Promise((_resolve, reject) => {
            seenSignal = input.signal;
            input.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      });

      const pending = controller.loadInitial();
      host.disconnect();
      expect(seenSignal?.aborted).to.be.true;
      await pending;
      expect(applied).to.have.lengthOf(0);
    });

    it("still propagates a genuine (non-abort) adapter error", async () => {
      const { controller } = makeController({
        listMessages: async () => {
          throw new Error("network down");
        },
      });

      let caught;
      try {
        await controller.loadMore();
      } catch (error) {
        caught = error;
      }
      expect(/** @type {any} */ (caught)?.message).to.equal("network down");
    });
  });
});
