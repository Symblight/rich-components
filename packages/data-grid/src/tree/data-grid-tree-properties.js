/**
 * `MdDataGridTree`'s own property declarations — split out the same way
 * `data-grid-properties.js` is, but as a genuinely separate set rather than
 * a superset: Lit's `ReactiveElement.finalize()` merges a subclass's
 * `static properties` onto its inherited `elementProperties` map
 * automatically, so `MdDataGridTree.properties = treeDataProperties`
 * (without spreading `dataGridProperties` in) is sufficient — the base
 * `md-data-grid` properties keep working via ordinary inheritance.
 * @type {import("lit").PropertyDeclarations}
 */
export const treeDataProperties = {
  getDataPath: { state: true },
  treeDataExpandedGroupIds: { state: true },
  autoGroupColumnDef: { state: true },
};
