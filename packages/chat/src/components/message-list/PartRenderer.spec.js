import { expect } from "@open-wc/testing";
import { PartRenderer } from "./PartRenderer.js";
/** @import { ChxMessage, ChxMessagePart } from "../../types/message.js" */

/** @returns {{renderer: PartRenderer, calls: (HTMLElement | undefined)[]}} */
function setup() {
  /** @type {(HTMLElement | undefined)[]} */
  const calls = [];
  const renderer = new PartRenderer({
    getPartElements: () => ({
      reasoning: (_part, previousElement) => {
        calls.push(previousElement);
        return previousElement ?? document.createElement("div");
      },
    }),
  });
  return { renderer, calls };
}

/** @param {ChxMessagePart[]} parts @returns {ChxMessage} */
function makeMessage(parts) {
  return /** @type {ChxMessage} */ ({ id: "m1", own: false, createdAt: 0, parts });
}

describe("PartRenderer", () => {
  it("skips the factory for the same part and message", () => {
    const { renderer, calls } = setup();
    const part = { id: "p1", type: "reasoning", text: "a" };
    const message = makeMessage([part]);

    const first = renderer.render(part, message, 0);
    const second = renderer.render(part, message, 0);

    expect(calls.length).to.equal(1);
    expect(second).to.equal(first);
  });

  it("calls the factory with the previous element for a new part object", () => {
    const { renderer, calls } = setup();
    const part = { id: "p1", type: "reasoning", text: "a" };
    const first = renderer.render(part, makeMessage([part]), 0);

    const next = { ...part, text: "ab" };
    renderer.render(next, makeMessage([next]), 0);

    expect(calls.length).to.equal(2);
    expect(calls[1]).to.equal(first);
  });

  it("calls the factory for the same part in a new message object", () => {
    const { renderer, calls } = setup();
    const part = { id: "p1", type: "reasoning", text: "a" };
    const message = makeMessage([part]);
    renderer.render(part, message, 0);

    renderer.render(part, { ...message, status: "sent" }, 0);

    expect(calls.length).to.equal(2);
  });

  it("calls the factory again after clear()", () => {
    const { renderer, calls } = setup();
    const part = { id: "p1", type: "reasoning", text: "a" };
    const message = makeMessage([part]);
    renderer.render(part, message, 0);

    renderer.clear();
    renderer.render(part, message, 0);

    expect(calls.length).to.equal(2);
    expect(calls[1]).to.be.undefined;
  });
});
