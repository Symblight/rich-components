import { MutationController } from "@lit-labs/observers/mutation-controller.js";

/**
 * Syncs one of `md-data-grid`'s reactive properties from a set of light-DOM
 * child elements, when present — an alternative to setting that property
 * imperatively via JS. `<md-data-grid-column>` (synced into `columns`) is
 * the first user of this; `<md-data-grid-footer>`/`<md-data-grid-pagination>`
 * (or whatever else needs the same "declarative children as an alternative
 * to a JS property" shape later) are meant to reuse this same class rather
 * than re-implement the mechanism per property — only `selector`/
 * `hostProperty`/`toValue`/`changeEvent` differ between them.
 *
 * No shadow-DOM `<slot>` is involved anywhere here — the child elements
 * this reads are never meant to be visually distributed, just read for
 * whatever value `toValue()` extracts from them (e.g.
 * `MdDataGridColumn.toColumnDef()`).
 *
 * Two complementary signals drive a resync:
 *  - Structural changes (a child added, removed, or DOM-reordered) — a
 *    `MutationController` watching the host's own `childList` directly.
 *    `MutationController` calls its `callback` once automatically when the
 *    host connects (its default, `skipInitial` unset), which is also what
 *    covers the very first sync — no separate `connectedCallback()`/
 *    `firstUpdated()` call needed here for that.
 *  - A property/attribute change on an already-present child after mount —
 *    each child element is expected to dispatch `changeEvent` (bubbles,
 *    not composed) from its own `updated()`; listened for directly on the
 *    host, since it only ever needs to cross light-DOM boundaries to get
 *    here, never a shadow one.
 *
 * When zero matching children exist *and never have*, `sync()` is a no-op
 * — existing imperative `host[hostProperty] = ...` usage on a host that
 * never had any declarative children of this kind is completely
 * unaffected. When one or more exist, they always win: every sync
 * unconditionally overwrites `host[hostProperty]` from the current DOM
 * order, matching `md-select`'s own "slotted content always wins"
 * precedent for the same kind of light-DOM-driven state. Once a host *has*
 * gone declarative for this property, removing its last matching child
 * still resyncs `host[hostProperty]` to `[]` rather than freezing it at
 * whatever the last-removed child left behind — `hasDeclarativeChildren` is
 * what distinguishes "never had any" (stay hands-off) from "had some, now
 * has none" (still authoritative).
 *
 * `isSyncing`/`hasDeclarativeChildren`/`warnedAboutConflict` are public
 * (not `_`-prefixed) — `host`'s own custom accessor for the target property
 * is expected to read them to warn when something assigns to it directly
 * while declarative children are present (see `MdDataGrid`'s `columns`
 * accessor for the reference implementation of that check).
 */
export class DeclarativeSlotController {
  /**
   * @param {import("lit").ReactiveElement & Element} host
   * @param {{
   *   selector: string,
   *   hostProperty: string,
   *   toValue: (el: Element) => unknown,
   *   changeEvent: string,
   * }} options `selector` is matched against direct children only (`:scope > selector`).
   *   `toValue` converts one matched child element into whatever
   *   `host[hostProperty]` expects one array entry to look like.
   */
  constructor(host, { selector, hostProperty, toValue, changeEvent }) {
    this.host = host;
    this._selector = selector;
    this._hostProperty = hostProperty;
    this._toValue = toValue;

    /** Whether declarative children currently exist (or ever have). */
    this.hasDeclarativeChildren = false;
    /** True only while `sync()` itself is writing `host[hostProperty]`. */
    this.isSyncing = false;
    /** Latches true after the first conflicting direct assignment is warned about, so it's only ever reported once. */
    this.warnedAboutConflict = false;

    host.addEventListener(changeEvent, () => this.sync());

    /** @private */
    this._mutationController = new MutationController(host, {
      config: { childList: true },
      callback: () => this.sync(),
    });
  }

  /**
   * Reads the host's current matching children into `host[hostProperty]`,
   * in DOM order. No-op when there are none and there never have been.
   */
  sync() {
    const els = this.host.querySelectorAll(`:scope > ${this._selector}`);
    if (els.length === 0 && !this.hasDeclarativeChildren) return;
    this.hasDeclarativeChildren = els.length > 0;
    this.isSyncing = true;
    /** @type {any} */ (this.host)[this._hostProperty] = Array.from(
      els,
      this._toValue,
    );
    this.isSyncing = false;
  }
}
