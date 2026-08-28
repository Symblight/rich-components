import { expect } from "@open-wc/testing";

import { validateMessages } from "./validate-messages.js";

/**
 * @param {"error" | "warn"} method
 * @param {(calls: unknown[][]) => void} run
 */
function withStubbedConsole(method, run) {
  const original = console[method];
  /** @type {unknown[][]} */
  const calls = [];
  console[method] = (...args) => calls.push(args);
  try {
    run(calls);
  } finally {
    console[method] = original;
  }
}

describe("validateMessages", () => {
  it("errors on a message missing id", () => {
    withStubbedConsole("error", (calls) => {
      validateMessages(/** @type {any} */ ([{ parts: [] }]));
      expect(calls.length).to.equal(1);
    });
  });

  it("errors on a part missing id", () => {
    withStubbedConsole("error", (calls) => {
      validateMessages(
        /** @type {any} */ ([{ id: "m1", parts: [{ type: "text", text: "hi" }] }]),
      );
      expect(calls.length).to.equal(1);
    });
  });

  it("warns on a duplicate message id", () => {
    withStubbedConsole("warn", (calls) => {
      validateMessages(
        /** @type {any} */ ([
          { id: "m1", parts: [] },
          { id: "m1", parts: [] },
        ]),
      );
      expect(calls.length).to.equal(1);
    });
  });

  it("warns on a duplicate part id within one message", () => {
    withStubbedConsole("warn", (calls) => {
      validateMessages(
        /** @type {any} */ ([
          {
            id: "m1",
            parts: [
              { id: "p1", type: "text", text: "a" },
              { id: "p1", type: "text", text: "b" },
            ],
          },
        ]),
      );
      expect(calls.length).to.equal(1);
    });
  });

  it("is silent for well-formed messages", () => {
    withStubbedConsole("error", (errorCalls) => {
      withStubbedConsole("warn", (warnCalls) => {
        validateMessages(
          /** @type {any} */ ([{ id: "m1", parts: [{ id: "m1-t1", type: "text", text: "hi" }] }]),
        );
        expect(warnCalls.length).to.equal(0);
      });
      expect(errorCalls.length).to.equal(0);
    });
  });
});
