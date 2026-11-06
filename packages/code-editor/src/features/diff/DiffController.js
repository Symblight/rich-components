import { Compartment } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { getOriginalDoc, updateOriginalDoc } from "@codemirror/merge";

import { emit } from "../../core/emit.js";
import {
  baselineChunks,
  baselineFeature,
  baselineField,
  baselineModel,
  setPeek,
} from "./baseline.js";
import { collapsedLines } from "./collapse.js";
import { changesGutter } from "./gutter.js";
import { acceptAll, rejectAll, reviewChunks, reviewFeature } from "./review.js";
import { diffBase } from "./shared.js";
import { splitDiff } from "./split.js";

/**
 * @typedef {import("../../components/code-editor/code-editor.js").CdxCodeEditor} CdxCodeEditor
 * @typedef {import("./diff.js").CdxDiff} CdxDiff
 * @typedef {import("./shared.js").CdxDiffConfig} CdxDiffConfig
 * @typedef {import("./shared.js").CdxDiffKind} CdxDiffKind
 * @typedef {{ readonly reviewBase: string }} CdxReviewBaseChangeDetail
 * @typedef {{
 *   review: { pending: number, total: number, accepted: number, rejected: number, index: number },
 *   baseline: { chunks: number, added: number, removed: number },
 * }} CdxDiffStats
 * `review.index` is the pending chunk under the caret (0-based), -1 when it's on none.
 * @typedef {{
 *   config: CdxDiffConfig,
 *   stats: CdxDiffStats["review"],
 *   complete: boolean,
 * }} ReviewBar
 */

/** When no <cdx-diff> of a kind is slotted, its data alone still turns the layer on with these. */
const FALLBACK = /** @type {Record<CdxDiffKind, CdxDiffConfig>} */ ({
  review: {
    kind: "review",
    author: "Agent",
    tone: "tertiary",
    icon: "smart_toy",
    acceptLabel: "Accept",
    rejectLabel: "Reject",
    revertLabel: "Revert",
    acceptAllLabel: "Accept all",
    rejectAllLabel: "Reject all",
  },
  baseline: {
    kind: "baseline",
    author: "HEAD",
    tone: "neutral",
    icon: "history",
    acceptLabel: "Accept",
    rejectLabel: "Reject",
    revertLabel: "Revert",
    acceptAllLabel: "Accept all",
    rejectAllLabel: "Reject all",
  },
});

/**
 * Two diff layers, like every mature editor: `baseline` (HEAD — quiet gutter marks, peek on click,
 * Revert) and `review` (proposals — inline chunks with Accept/Reject and a review bar). Data comes
 * from the host (`baseline`, `reviewBase`, or `createState`); presentation from `<cdx-diff>`.
 */
export class DiffController {
  /** @type {CdxCodeEditor} */
  #host;
  /** @type {import("../../controllers/EditorViewController.js").EditorViewController} */
  #editor;
  #shared = new Compartment();
  #baseline = new Compartment();
  #review = new Compartment();
  #layout = new Compartment();
  /** One extension, so re-applying it to a swapped-in tab isn't a change. */
  #split;
  /** @type {Record<CdxDiffKind, CdxDiff | null>} */
  #elements = { review: null, baseline: null };
  /** "Diff vs HEAD" when no `<cdx-diff kind="baseline">` carries `expanded`. */
  #fallbackExpanded = false;
  /** @type {Record<CdxDiffKind, CdxDiffConfig>} resolved once per config change, so headers keep
   *  their DOM between transactions */
  #configs = { ...FALLBACK };
  #accepted = 0;
  #rejected = 0;
  #dismissed = false;
  #completeReported = false;
  /** The review base the merge view holds, as last set or reported — echo detection. */
  /** @type {string | null} */
  #reviewBaseKnown = null;
  /** @type {import("@codemirror/state").Text | undefined} */
  #cachedDoc;
  #cachedString = "";
  #statsKey = "";
  /** Bumped when a layer gets new data, so its collapsed ranges are rebuilt. */
  #generation = { review: 0, baseline: 0 };

  /**
   * @param {CdxCodeEditor} host
   * @param {import("../../controllers/EditorViewController.js").EditorViewController} editor
   * @param {{ getParent: () => HTMLElement, pluginExtensions: () => import("@codemirror/state").Extension }} config
   */
  constructor(host, editor, config) {
    this.#host = host;
    this.#editor = editor;
    this.#split = splitDiff({
      getParent: config.getParent,
      options: () => ({
        lineNumbers: !host.noLineNumbers,
        indentGuides: !host.noIndentGuides,
        wrap: host.wrap,
        tabSize: host.tabSize,
        extensions: config.pluginExtensions(),
      }),
    });
    host.addEventListener("cdx-diff-config", (event) => {
      if (event.target !== host) this.#reconfigure();
    });
    editor.onReplace(() => {
      this.#accepted = this.#rejected = 0;
      this.#dismissed = this.#completeReported = false;
      this.#reviewBaseKnown = null;
      this.#afterChange();
    });
    editor.subscribe((_before, after, transactions) => {
      if (transactions.some((tr) => tr.effects.some((effect) => effect.is(updateOriginalDoc)))) {
        const doc = getOriginalDoc(after);
        const stringOf = () => this.#stringOf(doc);
        /** @type {CdxReviewBaseChangeDetail} */
        const detail = {
          get reviewBase() {
            return stringOf();
          },
        };
        this.#reviewBaseKnown = null;
        emit(host, "cdx-review-base-change", detail);
      }
      this.#afterChange();
    });
  }

  /** Change column, review, baseline — in that order, left of the line numbers. */
  get extension() {
    return [this.#shared.of([]), this.#review.of([]), this.#baseline.of([]), this.#layout.of([])];
  }

  /** @param {HTMLSlotElement} slot */
  handleSlotchange(slot) {
    /** @type {Record<CdxDiffKind, CdxDiff | null>} */
    const found = { review: null, baseline: null };
    for (const element of slot.assignedElements()) {
      if (element.localName !== "cdx-diff") {
        console.error('cdx-code-editor: slot="diff" takes <cdx-diff> elements only');
        continue;
      }
      const diff = /** @type {CdxDiff} */ (element);
      const kind = diff.kind === "baseline" ? "baseline" : "review";
      if (found[kind]) console.error(`cdx-code-editor: more than one <cdx-diff kind="${kind}">`);
      else found[kind] = diff;
    }
    this.#elements = found;
    this.#reconfigure();
  }

  /** @param {import("lit").PropertyValues} changed */
  update(changed) {
    this.#applyData(changed);
    if (changed.has("diffLayout")) this.#editor.dispatch({ effects: this.layoutEffect() });
  }

  /** The editor-level layout, for a tab's state too. */
  layoutEffect() {
    return this.#layout.reconfigure(this.#host.diffLayout === "split" ? this.#split : []);
  }

  /** @param {import("lit").PropertyValues} changed */
  #applyData(changed) {
    if (changed.has("reviewBase")) {
      const next = this.#host.reviewBase;
      if (next !== null && this.#isEcho(next)) return this.#applyBaseline(changed);
      this.#accepted = this.#rejected = 0;
      this.#dismissed = this.#completeReported = false;
      this.#reviewBaseKnown = next;
      this.#generation.review++;
      this.#editor.dispatch({ effects: this.#reviewEffect(next) });
    }
    this.#applyBaseline(changed);
  }

  /** @param {import("lit").PropertyValues} changed */
  #applyBaseline(changed) {
    if (changed.has("baseline")) {
      this.#generation.baseline++;
      this.#editor.dispatch({ effects: this.#baselineEffect(this.#host.baseline) });
    }
    if (changed.has("baseline") || changed.has("reviewBase")) {
      this.#editor.dispatch({ effects: this.#sharedEffect() });
    }
  }

  /** Effects that configure a document that isn't on screen yet — a tab being prepared.
   * @param {{ baseline?: string | null, reviewBase?: string | null }} data */
  effectsFor({ baseline = null, reviewBase = null }) {
    return [
      this.#baselineEffect(baseline),
      this.#reviewEffect(reviewBase),
      this.#shared.reconfigure(
        baseline !== null || reviewBase !== null ? this.#sharedExtensions() : [],
      ),
    ];
  }

  /** Stats for a consumer's footer ("+4 −2 vs HEAD") and the review bar. */
  get stats() {
    const state = this.#editor.state;
    /** @type {CdxDiffStats} */
    const stats = {
      review: {
        pending: 0,
        total: 0,
        accepted: this.#accepted,
        rejected: this.#rejected,
        index: -1,
      },
      baseline: { chunks: 0, added: 0, removed: 0 },
    };
    if (!state) return stats;
    const pending = reviewChunks(state);
    const head = state.selection.main.head;
    stats.review.pending = pending.length;
    stats.review.total = pending.length + this.#accepted + this.#rejected;
    stats.review.index = pending.findIndex((chunk) => chunk.fromB <= head && head <= chunk.endB);
    const chunks = baselineChunks(state);
    stats.baseline.chunks = chunks.length;
    chunks.forEach((chunk, index) => {
      const model = baselineModel(state, chunk, index, chunks.length);
      stats.baseline.added += model.added;
      stats.baseline.removed += model.removed;
    });
    return stats;
  }

  /** The footer's "+4 −2" toggle; null while there's no baseline. */
  get baselineStatus() {
    if (this.#host.baseline === null) return null;
    const { added, removed } = this.stats.baseline;
    return { added, removed, pressed: this.expanded };
  }

  /** `baseline` or `reviewBase` is set. */
  get enabled() {
    return this.#host.baseline !== null || this.#host.reviewBase !== null;
  }

  get expanded() {
    const element = this.#elements.baseline;
    return element ? element.expanded : this.#fallbackExpanded;
  }

  /** "Diff vs HEAD": every baseline chunk inline, or back to marks. Goes through the consumer's
   *  `<cdx-diff kind="baseline">` when there is one, so its `expanded` stays the truth.
   * @param {boolean} expanded */
  setExpanded(expanded) {
    const element = this.#elements.baseline;
    if (element) {
      element.expanded = expanded;
      return;
    }
    if (this.#fallbackExpanded === expanded) return;
    this.#fallbackExpanded = expanded;
    this.#editor.dispatch({ effects: this.#baselineEffect(this.#host.baseline) });
    this.#host.requestUpdate();
  }

  toggleBaselineExpanded() {
    this.setExpanded(!this.expanded);
  }

  /** What the host renders above the text; null hides the bar. @returns {ReviewBar | null} */
  get reviewBar() {
    const element = this.#elements.review;
    if (element?.noReviewBar || this.#host.reviewBase === null) return null;
    const stats = this.stats.review;
    if (!stats.total) return null;
    const complete = stats.pending === 0;
    if (complete && this.#dismissed) return null;
    return { config: this.#configs.review, stats, complete };
  }

  acceptAll() {
    const view = this.#editor.view;
    return view ? acceptAll(view) : false;
  }

  rejectAll() {
    const view = this.#editor.view;
    return view ? rejectAll(view) : false;
  }

  /** Hides the "Review complete" summary. */
  dismissReview() {
    this.#dismissed = true;
    this.#host.requestUpdate();
  }

  /** Next/previous change: pending proposals while there are any, then HEAD chunks (peeked open).
   * @param {1 | -1} direction */
  navigate(direction) {
    const view = this.#editor.view;
    if (!view) return false;
    const { state } = view;
    const head = state.selection.main.head;
    const review = reviewChunks(state);
    const list = review.length ? review : baselineChunks(state);
    if (!list.length) return false;
    const inside = (/** @type {typeof list[number]} */ chunk) =>
      chunk.fromB <= head && head <= Math.max(chunk.fromB, chunk.endB);
    const target =
      direction > 0
        ? (list.find((chunk) => chunk.fromB > head && !inside(chunk)) ?? list[0])
        : ([...list].reverse().find((chunk) => chunk.fromB < head && !inside(chunk)) ??
          list[list.length - 1]);
    const peek =
      !review.length && !state.field(baselineField, false)?.input.expanded
        ? [setPeek.of(target.fromB)]
        : [];
    view.dispatch({
      selection: { anchor: target.fromB },
      effects: [...peek, EditorView.scrollIntoView(target.fromB, { y: "center" })],
    });
    return true;
  }

  #sharedExtensions() {
    return [
      diffBase,
      collapsedLines,
      changesGutter,
      keymap.of([
        { key: "F7", run: () => this.navigate(1) },
        { key: "Shift-F7", run: () => this.navigate(-1) },
      ]),
    ];
  }

  #sharedEffect() {
    const on = this.#host.baseline !== null || this.#host.reviewBase !== null;
    return this.#shared.reconfigure(on ? this.#sharedExtensions() : []);
  }

  /** @param {string | null} text */
  #baselineEffect(text) {
    if (text === null) return this.#baseline.reconfigure([]);
    const element = this.#elements.baseline;
    const expanded = element ? element.expanded : this.#fallbackExpanded;
    return this.#baseline.reconfigure(
      baselineFeature(text, this.#configs.baseline, expanded, this.#generation.baseline),
    );
  }

  /** @param {string | null} text */
  #reviewEffect(text) {
    if (text === null) return this.#review.reconfigure([]);
    return this.#review.reconfigure(
      reviewFeature(
        text,
        this.#configs.review,
        {
          onDecision: (decision, count) => {
            if (decision === "accepted") this.#accepted += count;
            else this.#rejected += count;
          },
        },
        this.#generation.review,
      ),
    );
  }

  /** A `<cdx-diff>` changed or came/went: rebuild presentation over the same data. The review is
   *  rebuilt from the base the merge view holds now, so accepted chunks stay accepted. */
  #reconfigure() {
    for (const kind of /** @type {CdxDiffKind[]} */ (["review", "baseline"])) {
      this.#configs[kind] = this.#elements[kind]?.config ?? FALLBACK[kind];
    }
    const state = this.#editor.state;
    if (!state) return;
    let reviewBase = this.#host.reviewBase;
    try {
      if (reviewBase !== null) reviewBase = this.#stringOf(getOriginalDoc(state));
    } catch {
      // no merge view yet
    }
    this.#editor.dispatch({
      effects: [this.#reviewEffect(reviewBase), this.#baselineEffect(this.#host.baseline)],
    });
    this.#afterChange();
  }

  /** `reviewBase` set to what the merge view already holds — an echo of `cdx-review-base-change`.
   * @param {string} next */
  #isEcho(next) {
    if (next === this.#reviewBaseKnown) return true;
    const state = this.#editor.state;
    if (!state) return false;
    try {
      return this.#stringOf(getOriginalDoc(state)) === next;
    } catch {
      return false;
    }
  }

  /** Re-renders the host's review bar and fires cdx-diff-change / cdx-review-complete when the
   *  numbers actually moved. */
  #afterChange() {
    const stats = this.stats;
    const key = JSON.stringify(stats);
    if (key === this.#statsKey) return;
    this.#statsKey = key;
    this.#host.requestUpdate();
    emit(this.#host, "cdx-diff-change", stats);
    const { pending, total } = stats.review;
    if (total && !pending && !this.#completeReported) {
      this.#completeReported = true;
      emit(this.#host, "cdx-review-complete", stats.review);
    } else if (pending) {
      this.#completeReported = false;
    }
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
