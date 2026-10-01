import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  gotoLine,
  highlightSelectionMatches,
  replaceAll,
  replaceNext,
  search,
  searchKeymap,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import { keymap, runScopeHandlers } from "@codemirror/view";

/** Counting stops here — a count over a huge match set would hold the main thread for nothing. */
const COUNT_LIMIT = 999;

const SVG_NS = "http://www.w3.org/2000/svg";

/** Material Symbols paths, 24×24. */
const PATHS = {
  up: "M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z",
  down: "M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z",
  close:
    "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  expand: "M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
};

/** @param {string} path */
function icon(path) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS(SVG_NS, "path");
  shape.setAttribute("d", path);
  svg.append(shape);
  return svg;
}

/**
 * @param {string} className
 * @param {string} label
 * @param {Node | string} content
 * @param {() => void} onClick
 */
function button(className, label, content, onClick) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.title = label;
  element.setAttribute("aria-label", label);
  element.append(content);
  // mousedown would move focus out of the field, and the query with it
  element.addEventListener("mousedown", (event) => event.preventDefault());
  element.addEventListener("click", onClick);
  return element;
}

/**
 * The MD3 find/replace panel: a find field with match-case / whole-word / regex toggles, a
 * "3 of 12" count, previous/next, and a replace row the chevron expands. Drives CodeMirror's
 * search state, so the keymap (F3, Mod-G, Mod-Shift-L…) keeps working alongside it.
 * @param {import("@codemirror/view").EditorView} view
 * @returns {import("@codemirror/view").Panel}
 */
function createSearchPanel(view) {
  const dom = document.createElement("div");
  dom.className = "cdx-search";

  const find = document.createElement("input");
  find.className = "cdx-search__field";
  find.placeholder = "Find";
  find.setAttribute("aria-label", "Find");
  find.setAttribute("main-field", "true");
  const replace = document.createElement("input");
  replace.className = "cdx-search__field";
  replace.placeholder = "Replace";
  replace.setAttribute("aria-label", "Replace");

  const count = document.createElement("span");
  count.className = "cdx-search__count";
  count.setAttribute("aria-live", "polite");

  /** @param {string} label @param {string} text @param {"caseSensitive" | "wholeWord" | "regexp"} key */
  const toggle = (label, text, key) => {
    const element = button("cdx-search__toggle", label, text, () => {
      commit({ [key]: !getSearchQuery(view.state)[key] });
      find.focus();
    });
    element.dataset.option = key;
    return element;
  };
  const toggles = [
    toggle("Match case", "Aa", "caseSensitive"),
    toggle("Match whole word", "ab", "wholeWord"),
    toggle("Use regular expression", ".*", "regexp"),
  ];

  const expand = button("cdx-search__expand", "Toggle replace", icon(PATHS.expand), () => {
    dom.classList.toggle("cdx-search_replacing");
    expand.setAttribute("aria-expanded", String(dom.classList.contains("cdx-search_replacing")));
  });
  expand.setAttribute("aria-expanded", "false");

  const findRow = document.createElement("div");
  findRow.className = "cdx-search__row";
  const findBox = document.createElement("div");
  findBox.className = "cdx-search__box";
  findBox.append(find, ...toggles);
  findRow.append(
    findBox,
    count,
    button("cdx-search__icon", "Previous match (Shift-Enter)", icon(PATHS.up), () => {
      findPrevious(view);
    }),
    button("cdx-search__icon", "Next match (Enter)", icon(PATHS.down), () => {
      findNext(view);
    }),
    button("cdx-search__icon", "Close (Escape)", icon(PATHS.close), () => {
      closeSearchPanel(view);
    }),
  );

  const replaceRow = document.createElement("div");
  replaceRow.className = "cdx-search__row cdx-search__row_replace";
  const replaceBox = document.createElement("div");
  replaceBox.className = "cdx-search__box";
  replaceBox.append(replace);
  replaceRow.append(
    replaceBox,
    button("cdx-search__text-button", "Replace (Enter)", "Replace", () => {
      replaceNext(view);
    }),
    button("cdx-search__text-button", "Replace all (Mod-Alt-Enter)", "All", () => {
      replaceAll(view);
    }),
  );

  const rows = document.createElement("div");
  rows.className = "cdx-search__rows";
  rows.append(findRow, replaceRow);
  dom.append(expand, rows);

  /** @param {Partial<ConstructorParameters<typeof SearchQuery>[0]>} patch */
  const commit = (patch = {}) => {
    const current = getSearchQuery(view.state);
    const query = new SearchQuery({
      search: find.value,
      replace: replace.value,
      caseSensitive: current.caseSensitive,
      regexp: current.regexp,
      wholeWord: current.wholeWord,
      ...patch,
    });
    if (!query.eq(current)) view.dispatch({ effects: setSearchQuery.of(query) });
  };

  const sync = () => {
    const query = getSearchQuery(view.state);
    if (document.activeElement !== find && find.value !== query.search) find.value = query.search;
    if (document.activeElement !== replace && replace.value !== query.replace) {
      replace.value = query.replace;
    }
    for (const element of toggles) {
      const key = /** @type {"caseSensitive" | "wholeWord" | "regexp"} */ (element.dataset.option);
      element.setAttribute("aria-pressed", String(query[key]));
    }
    find.setAttribute("aria-invalid", String(Boolean(query.search) && !query.valid));
    count.textContent = describeCount(view, query);
  };

  find.addEventListener("input", () => commit());
  replace.addEventListener("input", () => commit());
  // Enter is the panel's own; everything else (Escape, F3, Mod-G…) goes to the search keymap,
  // which is scoped to "search-panel" and doesn't see keys typed outside the editor content
  find.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      (event.shiftKey ? findPrevious : findNext)(view);
    } else if (runScopeHandlers(view, event, "search-panel")) {
      event.preventDefault();
    }
  });
  replace.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      ((event.metaKey || event.ctrlKey) && event.altKey ? replaceAll : replaceNext)(view);
    } else if (runScopeHandlers(view, event, "search-panel")) {
      event.preventDefault();
    }
  });

  if (view.state.readOnly) replaceRow.hidden = expand.hidden = true;
  sync();

  return {
    dom,
    top: true,
    mount() {
      find.focus();
      find.select();
    },
    update(update) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.transactions.some((tr) => tr.effects.length)
      ) {
        sync();
      }
    },
  };
}

/** "3 of 12", "No results", or "" while the field is empty.
 * @param {import("@codemirror/view").EditorView} view @param {SearchQuery} query */
function describeCount(view, query) {
  if (!query.search || !query.valid) return "";
  const cursor = query.getCursor(view.state);
  const main = view.state.selection.main;
  let total = 0;
  let current = 0;
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    total++;
    if (next.value.from === main.from && next.value.to === main.to) current = total;
    if (total > COUNT_LIMIT) return `${COUNT_LIMIT}+`;
  }
  if (!total) return "No results";
  return current ? `${current} of ${total}` : `${total} found`;
}

/** Search keymap minus Mod-Alt-G: CodeMirror's own go-to-line dialog — ours is on Ctrl-G. */
const searchBindings = searchKeymap.filter((binding) => binding.run !== gotoLine);

export function searchFeature() {
  return [
    search({ top: true, createPanel: createSearchPanel }),
    highlightSelectionMatches(),
    keymap.of(searchBindings),
  ];
}
