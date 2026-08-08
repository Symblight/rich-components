/**
 * Owns `updateRows()` — batched add/update/delete against `host.rows`.
 * Doesn't clamp pagination itself; the host reacts to `rows` changes in its
 * own `updated()` lifecycle so clamping applies no matter how `rows`
 * changed, not just via this controller.
 */
export class RowUpdatesController {
  /** @param {import("../base/data-grid.js").MdDataGrid} host */
  constructor(host) {
    this.host = host;
  }

  /** @param {import("../base/data-grid.js").DataGridRowUpdate | import("../base/data-grid.js").DataGridRowUpdate[]} changes */
  update(changes) {
    const host = this.host;
    const entries = Array.isArray(changes) ? changes : [changes];

    /** @type {(string | number)[]} */
    const added = [];
    /** @type {(string | number)[]} */
    const updated = [];
    /** @type {(string | number)[]} */
    const deleted = [];

    const rowsById = new Map(host.rows.map((row) => [host.getRowId(row), row]));

    for (const entry of entries) {
      const id = host.getRowId(entry);
      if (id === undefined || id === null) {
        console.warn(
          "md-data-grid: updateRows() entry has no id resolvable via getRowId(), skipping",
          entry,
        );
        continue;
      }

      if (entry._action === "delete") {
        if (rowsById.delete(id)) deleted.push(id);
        continue;
      }

      const { _action: _unusedAction, ...fields } = entry;
      const existing = rowsById.get(id);
      if (existing) {
        rowsById.set(id, { ...existing, ...fields });
        updated.push(id);
      } else {
        rowsById.set(id, fields);
        added.push(id);
      }
    }

    if (added.length === 0 && updated.length === 0 && deleted.length === 0)
      return;

    // Preserve existing row order; genuinely new rows land at the end, in
    // the order they appeared in `changes` (Map preserves insertion order).
    const nextRows = [];
    for (const row of host.rows) {
      const id = host.getRowId(row);
      if (rowsById.has(id)) {
        nextRows.push(
          /** @type {Record<string, unknown>} */ (rowsById.get(id)),
        );
        rowsById.delete(id);
      }
    }
    for (const row of rowsById.values()) {
      nextRows.push(row);
    }

    host.rows = nextRows;

    host.dispatchEvent(
      new CustomEvent("md-data-grid-rows-update", {
        detail: { added, updated, deleted },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
