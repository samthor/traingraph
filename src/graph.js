

const nextGlobalId = (function() {
  let globalId = 0;
  return (prefix = '?') => {
    prefix = prefix.toUpperCase();

    ++globalId;
    return `${prefix}${globalId.toString(36)}`;
  };
}());


/**
 * @typedef {{
 *   edge: string,
 *   at: number,    // 0-1
 * }}
 * @type {never}
 */
export var Virt;


/**
 * Each node is a unique point on one or many lines. It may be a junction or represent a station,
 * signal, etc (although non-junction probably only works with a single pair).
 *
 * @typedef {{
 *   id: string,
 *   holder: Set<string>,
 *   pairs: [Virt, Virt][],
 * }}
 * @type {never}
 */
export var Node;


/**
 * @typedef {{
 *   id: string,
 *   length: number,
 *   virt: Virt[],  // 1-n
 *   node: Node[],  // 2-n
 * }}
 * @type {never}
 */
export var EdgeData;


export class Graph {
  /**
   * @type {Map<string, EdgeData>}
   */
  #byEdge = new Map();

  /**
   * @type {Map<string, Node>}
   */
  #byNode = new Map();

  /**
   * @param {number} length
   * @return {string}
   */
  add(length) {
    if (length <= 0) {
      throw new Error(`probably won't work with <= length: ${length}`)
    }

    const id = nextGlobalId('E');

    const virt = { edge: id, at: 0.0 };
    const low = { id: nextGlobalId('N'), holder: new Set([id]), pairs: [] };
    const high = { id: nextGlobalId('N'), holder: new Set([id]), pairs: [] };

    this.#byNode.set(low.id, low);
    this.#byNode.set(high.id, high);

    this.#byEdge.set(id, { id, length, virt: [virt], node: [low, high] });

    return id;
  }

  /**
   * @param {string} edge
   * @param {0|1} end
   */
  endNode(edge, end) {
    const data = this.#dataForEdge(edge);
    if (end) {
      const i = data.node.length - 1;
      return data.node[i].id;
    }
    return data.node[0].id;
  }

  /**
   * @param {string} edge
   * @param {number} at
   * @param {number} within +/- value to find best within
   * @return {{id: string, at: number}?} node id and position, or none
   */
  find(edge, at, within) {
    const data = this.#dataForEdge(edge);

    let all = data.virt.slice().map((virt, index) => {
      return {at: virt.at, rel: Math.abs(virt.at - at), id: data.node[index].id};
    });
    all.push({at: 1.0, rel: Math.abs(1.0 - at), id: data.node[all.length].id});
    all.sort(({rel: a}, {rel: b}) => a - b);

    if (all[0].rel > within) {
      return null;
    }
    const {id, at: foundAt} = all[0];
    return {id, at: foundAt};
  }

  /**
   * @param {string} edge
   * @param {number} at
   * @param {boolean} join
   */
  split(edge, at, join) {
    const data = this.#dataForEdge(edge);

    // TODO: binary search
    let i;
    for (i = 0; i < data.virt.length; ++i) {
      if (at < data.virt[i].at) {
        break;
      }
    }

    const before = i - 1;
    const afterNode = data.node[i];
    if (before < 0 || afterNode === undefined) {
      throw new Error(`bad`);
    }

    /** @type {[Virt, Virt][]} */
    const pairs = [];

    const beforeVirt = data.virt[i - 1];
    const newVirt = { edge, at };

    const newNode = { id: nextGlobalId('N'), holder: new Set([edge]), pairs };
    this.#byNode.set(newNode.id, newNode);

    data.virt.splice(i, 0, newVirt);
    data.node.splice(i, 0, newNode);

    if (join) {
      // these will always sort this way as edge is the same
      pairs.push([data.virt[before], data.virt[i]]);
    }

    // afterNode may incorrectly point to virt[i], not virt[i+1] (new one)
    for (const p of afterNode.pairs) {
      if (p[0] === beforeVirt) {
        p[0] = newVirt;
      }
      if (p[1] === beforeVirt) {
        p[1] = newVirt;
      }
    }

    return {id: newNode.id, at};
  }

  /**
   * @param {string} node
   */
  linesAtNode(node) {
    const data = this.#dataForNode(node);
    return [...data.holder];
  }

  /**
   * @param {string} a
   * @param {string} b
   */
  mergeNode(a, b) {
    const dataA = this.#dataForNode(a);
    const dataB = this.#dataForNode(b);

    // One node remains, one is removed. Keep the one with more joins.
    const remain = dataA.holder.size > dataB.holder.size ? dataA : dataB;
    const remove = (remain === dataA ? dataB : dataA);

    remain.pairs.push(...remove.pairs.splice(0, remove.pairs.length));

    remove.holder.forEach((otherEdge) => {
      remain.holder.add(otherEdge);

      const data = this.#dataForEdge(otherEdge);
      data.node = data.node.map((node) => {
        if (node === remove) {
          return remain;
        }
        return node;
      });
    });
    this.#byNode.delete(remove.id);
  }

  *all() {
    for (const [edge, data] of this.#byEdge){
      yield {edge, data};
    }
  }

  /**
   * @param {string} node
   */
  #dataForNode = (node) => {
    const d = this.#byNode.get(node);
    if (d === undefined) {
      throw new Error(`missing data`);
    }
    return d;
  };

  /**
   * @param {string} edge
   */
  #dataForEdge = (edge) => {
    const d = this.#byEdge.get(edge);
    if (d === undefined) {
      throw new Error(`missing data`);
    }
    return d;
  };
}

// A 
// |
// |
// |\
// | \
// B  C