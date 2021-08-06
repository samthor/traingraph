

/**
 * @template T
 * @param {(a: T, b: T) => boolean} less
 * @param {T[]} all
 * @return {T[]}
 */
export function inlineLessSort(less, all) {

  /** @type {(a: T, b: T) => number} */
  const compare = (a, b) => {
    if (less(a, b)) {
      return -1;
    } else if (less(b, a)) {
      return +1;
    }
    return 0;
  }

  const out = all.slice();
  out.sort(compare);
  return out;
}


/**
 * @param {string} a
 * @param {string} b
 */
export function nodeKey(a, b) {
  if (b < a) {
    return `${b}:${a}`;
  }
  return `${a}:${b}`;
}
