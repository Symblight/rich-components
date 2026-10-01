import { Annotation, ChangeSet, EditorState, Transaction } from "@codemirror/state";

import { diffText } from "../core/diff-text.js";
import { emit } from "../core/emit.js";

/** @typedef {{ changes: ChangeSet, readonly value: string }} CdxChangeDetail */
/**
 * @typedef {{ changes: ChangeSet, userEvent: string | null }} CdxBeforeChangeDetail
 * `userEvent` is CodeMirror's, e.g. "input.type", "delete.backward", "input.paste", "undo".
 */

/** Marks a transaction applying a consumer-set `value`, so it isn't echoed back as `cdx-change`. */
const external = Annotation.define();

/**
 * The document as a string: `defaultValue` seeds it (uncontrolled), `value` drives it (controlled).
 * `doc.toString()` is O(n), so the last result is cached by `Text` identity and `cdx-change`'s
 * `value` is only built if a listener reads it.
 */
export class ValueController {
  /** @type {import("./EditorViewController.js").EditorViewController} */
  #editor;
  /** @type {import("lit").ReactiveControllerHost & HTMLElement} */
  #host;
  /** @type {() => string} */
  #getDefaultValue;
  /** A `value` set before the first mount. @type {string | undefined} */
  #pendingValue;
  /** @type {import("@codemirror/state").Text | undefined} */
  #cachedDoc;
  #cachedString = "";

  /**
   * @param {import("lit").ReactiveControllerHost & HTMLElement} host
   * @param {import("./EditorViewController.js").EditorViewController} editor
   * @param {{ getDefaultValue: () => string }} config
   */
  constructor(host, editor, config) {
    this.#host = host;
    this.#editor = editor;
    this.#getDefaultValue = config.getDefaultValue;
    editor.subscribe((before, after, transactions) => {
      if (!transactions.some((tr) => tr.docChanged && !tr.annotation(external))) return;
      const changes = transactions.reduce(
        (all, tr) => all.compose(tr.changes),
        ChangeSet.empty(before.doc.length),
      );
      const stringOf = () => this.#stringOf(after.doc);
      /** @type {CdxChangeDetail} */
      const detail = {
        changes,
        get value() {
          return stringOf();
        },
      };
      emit(host, "cdx-change", detail);
    });
  }

  /** Fires the cancelable `cdx-before-change` for every edit that isn't a consumer-set `value`.
   *  It runs while CodeMirror builds the transaction, so a listener must not dispatch — only
   *  inspect and `preventDefault()`, which drops the edit's changes. */
  get extension() {
    return EditorState.changeFilter.of((tr) => {
      if (tr.changes.empty || tr.annotation(external)) return true;
      /** @type {CdxBeforeChangeDetail} */
      const detail = {
        changes: tr.changes,
        userEvent: tr.annotation(Transaction.userEvent) ?? null,
      };
      const event = new CustomEvent("cdx-before-change", {
        detail,
        bubbles: true,
        composed: true,
        cancelable: true,
      });
      return this.#host.dispatchEvent(event);
    });
  }

  /** The document the first mount starts from; consumes a `value` set before it. */
  takeInitialDoc() {
    const doc = this.#pendingValue ?? this.#getDefaultValue();
    this.#pendingValue = undefined;
    return doc;
  }

  get value() {
    const state = this.#editor.state;
    return state ? this.#stringOf(state.doc) : (this.#pendingValue ?? this.#getDefaultValue());
  }

  /** A differing value is applied as a minimal change outside undo history, so the caret and the
   *  user's own undo steps survive; an echo of the current doc is a no-op.
   * @param {string} next */
  set value(next) {
    const state = this.#editor.state;
    if (!state) {
      this.#pendingValue = next;
      return;
    }
    const current = this.#stringOf(state.doc);
    if (next === current) return;
    this.#editor.dispatch({
      changes: diffText(current, next),
      annotations: [external.of(true), Transaction.addToHistory.of(false)],
    });
  }

  /** @param {import("@codemirror/state").Text} doc */
  #stringOf(doc) {
    if (doc !== this.#cachedDoc) {
      this.#cachedDoc = doc;
      this.#cachedString = doc.toString();
    }
    return this.#cachedString;
  }
}
