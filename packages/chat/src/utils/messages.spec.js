import { expect } from "@open-wc/testing";

import { reconcileMessages } from "./messages.js";

describe("reconcileMessages", () => {
  it("appends a message with a new id", () => {
    const existing = /** @type {any} */ ([{ id: "m1", own: true, parts: [] }]);
    const next = reconcileMessages(existing, /** @type {any} */ ({ id: "m2", own: false, parts: [] }));
    expect(next).to.have.lengthOf(2);
    expect(next).to.not.equal(existing);
    expect(next[0]).to.equal(existing[0]);
  });

  it("replaces an existing entry in place by id, same length/order", () => {
    const existing = /** @type {any} */ ([
      { id: "m1", own: true, parts: [] },
      { id: "m2", own: false, status: "sending", parts: [] },
    ]);
    const updated = { id: "m2", own: false, status: "sent", parts: [] };
    const next = reconcileMessages(existing, /** @type {any} */ (updated));
    expect(next).to.have.lengthOf(2);
    expect(next[1].status).to.equal("sent");
    expect(next[0]).to.equal(existing[0]);
  });

  it("computes own from authorId === userId when own isn't explicitly supplied", () => {
    const next = reconcileMessages([], /** @type {any} */ ({ id: "m1", authorId: "me", parts: [] }), "me");
    expect(next[0].own).to.be.true;

    const next2 = reconcileMessages([], /** @type {any} */ ({ id: "m2", authorId: "them", parts: [] }), "me");
    expect(next2[0].own).to.be.false;
  });

  it("respects an explicitly supplied own over the authorId comparison", () => {
    const next = reconcileMessages(
      [],
      /** @type {any} */ ({ id: "m1", authorId: "them", own: true, parts: [] }),
      "me",
    );
    expect(next[0].own).to.be.true;
  });
});
