/** The single change turning `current` into `next`, trimmed to what actually differs — replacing
 *  the whole doc instead would reset the selection and every mapped position.
 * @param {string} current @param {string} next
 * @returns {{ from: number, to: number, insert: string }} */
export function diffText(current, next) {
  let from = 0;
  const shortest = Math.min(current.length, next.length);
  while (from < shortest && current.charCodeAt(from) === next.charCodeAt(from)) from++;

  let currentEnd = current.length;
  let nextEnd = next.length;
  while (
    currentEnd > from &&
    nextEnd > from &&
    current.charCodeAt(currentEnd - 1) === next.charCodeAt(nextEnd - 1)
  ) {
    currentEnd--;
    nextEnd--;
  }
  return { from, to: currentEnd, insert: next.slice(from, nextEnd) };
}
