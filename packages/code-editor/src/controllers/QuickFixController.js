import { forEachDiagnostic } from "@codemirror/lint";
import { keymap, ViewPlugin } from "@codemirror/view";

/** @typedef {import("@codemirror/lint").Diagnostic} Diagnostic */
/** @typedef {{ diagnostic: Diagnostic, from: number, to: number }} LineProblem */
/** @typedef {{ top: number, left: number, problems: LineProblem[] }} Bulb */

/** Rounds so sub-pixel scroll jitter doesn't re-render the host every frame. */
const px = (/** @type {number} */ value) => Math.round(value);

/**
 * The lightbulb on the caret's line when that line has diagnostics. It's a real button in the
 * host's shadow root — not a CodeMirror widget — so `md-rich-tooltip` can anchor to it by id and
 * list the messages with their actions. Mod-. opens it from the keyboard.
 */
export class QuickFixController {
  /** @type {import("lit").ReactiveControllerHost & HTMLElement} */
  #host;
  /** @type {() => HTMLElement | null} */
  #getContainer;
  /** @type {() => void} */
  #open;
  /** @type {Bulb | null} */
  #bulb = null;

  /**
   * @param {import("lit").ReactiveControllerHost & HTMLElement} host
   * @param {{ getContainer: () => HTMLElement | null, open: () => void }} config
   */
  constructor(host, config) {
    this.#host = host;
    this.#getContainer = config.getContainer;
    this.#open = config.open;
  }

  get bulb() {
    return this.#bulb;
  }

  get extension() {
    /** @param {import("@codemirror/view").EditorView} view */
    const measure = (view) => this.#measure(view);
    const open = () => {
      if (!this.#bulb) return false;
      this.#open();
      return true;
    };
    return [
      ViewPlugin.define((view) => {
        const onScroll = () => measure(view);
        view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
        measure(view);
        return {
          /** @param {import("@codemirror/view").ViewUpdate} update */
          update(update) {
            if (
              update.selectionSet ||
              update.docChanged ||
              update.geometryChanged ||
              update.viewportChanged ||
              update.transactions.some((tr) => tr.effects.length)
            ) {
              measure(update.view);
            }
          },
          destroy() {
            view.scrollDOM.removeEventListener("scroll", onScroll);
          },
        };
      }),
      keymap.of([{ key: "Mod-.", run: open }]),
    ];
  }

  /** Applies an action, then hands focus back to the text.
   * @param {import("@codemirror/view").EditorView | undefined} view
   * @param {LineProblem} problem @param {number} index */
  apply(view, problem, index) {
    const action = problem.diagnostic.actions?.[index];
    if (!view || !action) return;
    action.apply(view, problem.from, problem.to);
    view.focus();
  }

  /** @param {import("@codemirror/view").EditorView} view */
  #measure(view) {
    const { state } = view;
    const line = state.doc.lineAt(state.selection.main.head);
    /** @type {LineProblem[]} */
    const problems = [];
    forEachDiagnostic(state, (diagnostic, from, to) => {
      if (from <= line.to && to >= line.from) problems.push({ diagnostic, from, to });
    });
    if (!problems.length) {
      this.#set(null);
      return;
    }
    view.requestMeasure({
      read: () => {
        const container = this.#getContainer();
        const coords = view.coordsAtPos(line.from);
        const gutters = view.dom.querySelector(".cm-gutters");
        const scroller = view.scrollDOM.getBoundingClientRect();
        if (!container || !coords || coords.top < scroller.top || coords.bottom > scroller.bottom) {
          return null;
        }
        const box = container.getBoundingClientRect();
        const seam = gutters ? gutters.getBoundingClientRect().right : scroller.left;
        return {
          top: px((coords.top + coords.bottom) / 2 - box.top),
          left: px(seam - box.left),
          problems,
        };
      },
      write: (bulb) => this.#set(bulb),
    });
  }

  /** @param {Bulb | null} bulb */
  #set(bulb) {
    const current = this.#bulb;
    const same =
      bulb === current ||
      (bulb &&
        current &&
        bulb.top === current.top &&
        bulb.left === current.left &&
        bulb.problems.length === current.problems.length &&
        bulb.problems.every((p, i) => {
          const q = current.problems[i];
          return p.diagnostic === q.diagnostic && p.from === q.from && p.to === q.to;
        }));
    if (same) return;
    this.#bulb = bulb;
    this.#host.requestUpdate();
  }
}
