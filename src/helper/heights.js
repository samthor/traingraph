

/**
 * @typedef {{
 *   left: number,
 *   right: number,
 *   value: string,
 * }}
 * @type {never}
 */
var HeightMapData;


/**
 * Bad implementation for now.
 *
 * TODO: could be simpler if keyed by something unique
 */
export class HeightMap {
  #length;

  /** @type {HeightMapData[]} */
  #data = [];

  /**
   * @param {number} length
   */
  constructor(length) {
    this.#length = length;
  }

  /**
   * @param {boolean} less
   * @param {number} leftOffset
   * @param {number} rightOffset
   * @param {string} value
   */
  add(less, leftOffset, rightOffset, value) {
    const [left, right] = this.#resolve(less, leftOffset, rightOffset);

    this.#data.push({ left, right, value });
  }

  /**
   * @param {boolean} less
   * @param {number} leftOffset
   * @param {number} rightOffset
   * @param {string} value
   * @return {boolean}
   */
  remove(less, leftOffset, rightOffset, value) {
    const [left, right] = this.#resolve(less, leftOffset, rightOffset);

    const index = this.#data.findIndex((raw) => {
      return raw.left === left && raw.right === right && value === value;
    });
    if (index === -1) {
      return false;
    }
    this.#data.splice(index, 1);
    return true;
  }

  /**
   * @param {boolean} less
   * @param {number} leftOffset
   * @param {number} rightOffset
   * @return {string[]}
   */
  query(less, leftOffset, rightOffset) {
    const [left, right] = this.#resolve(less, leftOffset, rightOffset);

    /** @type {(a: { left: number, right: number }, b: HeightMapData) => boolean} */
    const overlap = (a, b) => {
      if (b.left <= a.left) {
        return b.right >= a.left;
      }
      return b.left <= a.right;
    };

    const req = { left, right };

    /** @type {string[]} */
    const out = [];

    for (const cand of this.#data) {
      if (overlap(req, cand)) {
        out.push(cand.value);
      }
    }

    return out;
  }

  /**
   * @param {boolean} less
   * @param {number} leftOffset
   * @param {number} rightOffset
   * @return {[number, number]}
   */
  #resolve = (less, leftOffset, rightOffset) => {
    if (less) {
      ([leftOffset, rightOffset] = [rightOffset, leftOffset]);
    }

    const left = leftOffset;
    const right = this.#length - rightOffset;

    if (left > right || left < 0 || right > this.#length) {
      throw new Error(`can't add out-of-range values`);
    }

    return [left, right];
  };
}
