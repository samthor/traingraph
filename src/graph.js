
import * as types from './types.js';


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


/**
 * @param {Virt} a
 * @param {Virt} b
 */
function virtIsLess(a, b) {
  if (a.edge < b.edge) {
    return true;
  } else if (a.edge > b.edge) {
    return false;
  }
  return a.at < b.at;
}


/**
 * @implements {types.GraphType}
 */
export class Graph {
  /**
   * @type {Map<string, EdgeData>}
   */
  #byEdge = new Map();

  /**
   * @type {Map<string, Node>}
   */
  #byNode = new Map();

  allNodes() {
    return this.#byNode.keys();
  }

  /**
   * @param {number} length
   * @return {{edge: string, lowNode: string, highNode: string}}
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

    return {edge: id, lowNode: low.id, highNode: high.id};
  }

  /**
   * @param {string} edge
   * @return {{lowNode: string, highNode: string}}
   */
  endNodesFor(edge) {
    const data = this.#dataForEdge(edge);
    const i = data.node.length - 1;
    return {lowNode: data.node[0].id, highNode: data.node[i].id};
  }

  /**
   * @param {string} edge
   * @param {number} at
   * @return {types.AtNode}
   */
  findNode(edge, at) {
    const data = this.#dataForEdge(edge);

    const all = data.virt.slice().map((virt, index) => {
      return {at: virt.at, rel: Math.abs(virt.at - at), id: data.node[index].id};
    });
    all.push({at: 1.0, rel: Math.abs(1.0 - at), id: data.node[all.length].id});
    all.sort(({rel: a}, {rel: b}) => a - b);

    const {id: node} = all[0];
    return this.nodeOnEdge(edge, node);
  }

  /**
   * @param {string} edge
   * @param {number} at
   * @return {types.AtNode}
   */
  nodeAround(edge, at) {
    const data = this.#dataForEdge(edge);

    if (at < 0.0 || at > 1.0) {
      return {
        edge,
        at,
        node: '',
        priorNode: '',
        afterNode: '',
      };
    }

    // TODO: binary search
    for (let i = 0; i <= data.virt.length; ++i) {
      const check = data.virt[i]?.at ?? 1.0;

      if (at === check) {
        return {
          edge,
          at,
          node: data.node[i].id,
          priorNode: data.node[i - 1]?.id ?? '',
          afterNode: data.node[i + 1]?.id ?? '',
        };
      }

      if (at < check) {
        return {
          edge,
          at,
          node: '',
          priorNode: data.node[i - 1].id,
          afterNode: data.node[i].id,
        };
      }
    }
    throw new Error(`should not get here`);
  }

  /**
   * @param {string} edge
   * @param {string} node
   * @return {types.AtNode}
   */
  nodeOnEdge(edge, node) {
    const edgeData = this.#dataForEdge(edge);

    const index = edgeData.node.findIndex((cand) => cand.id === node);
    if (index === -1) {
      throw new Error(`node not on edge: edge=${edge} node=${node}`);
    }

    return {
      edge,
      at: edgeData.virt[index]?.at ?? 1.0,
      node: edgeData.node[index].id,
      priorNode: edgeData.node[index - 1]?.id ?? '',
      afterNode: edgeData.node[index + 1]?.id ?? '',
    };
  }

  /**
   * @param {string} edge
   * @param {number} at
   * @param {boolean} join
   */
  splitEdge(edge, at, join = true) {
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

    return {node: newNode.id, at};
  }

  /**
   * Returns all the pairs at this node. This is less than the lines, which might intersect at the
   * node without being paired up (e.g., angle too steep).
   *
   * @param {string} nodeId
   * @return {[string, string][]}
   */
  pairsAtNode(nodeId) {
    const data = this.#dataForNode(nodeId);

    /** @type {(virt: Virt) => string} */
    const nodeVia = (virt) => {
      const dataEdge = this.#dataForEdge(virt.edge);

      // TODO: this is done the "wrong way", by finding the known ID and then finding the virt
      // around it. it could instead look for the virt first?
      const indexOfPrimary = dataEdge.node.findIndex((cand) => cand.id === nodeId);
      if (indexOfPrimary === -1) {
        throw new Error(`bad virt`);
      }

      if (dataEdge.virt[indexOfPrimary] === virt) {
        return dataEdge.node[indexOfPrimary + 1].id;
      } else if (dataEdge.virt[indexOfPrimary - 1] === virt) {
        return dataEdge.node[indexOfPrimary - 1].id;
      }
      throw new Error(`bad virt, not on correct edge`);
    };

    return data.pairs.map(([a, b]) => {
      // find what edges a,b are on and what virts they are adjacent to
      return [nodeVia(a), nodeVia(b)];
    });
  }

  /**
   * Returns all the positions of this given node on all its lines. This must at least return one
   * result.
   *
   * @param {string} nodeId
   * @return {types.AtNode[] & [types.AtNode]}
   */
  linesAtNode(nodeId) {
    const data = this.#dataForNode(nodeId);

    /** @type {types.AtNode[]} */
    const out = [];

    for (const edgeId of data.holder) {
      const edgeData = this.#dataForEdge(edgeId);

      edgeData.node.forEach((cand, index) => {
        if (nodeId !== cand.id) {
          return;
        }
        const nodeBefore = edgeData.node[index - 1] ?? null;
        const nodeAfter = edgeData.node[index + 1] ?? null;

        // we found this node in its holder, see where it is
        if (nodeAfter === null) {
          if (nodeBefore === null) {
            throw new Error(`must have two nodes`)
          }
          // at the end: it's at 1.0
          out.push({
            edge: edgeId,
            at: 1.0,
            node: nodeId,
            priorNode: nodeBefore.id,
            afterNode: '',
          });
        } else {
          // in the middle (or start, as first virt is always 0.0)
          const virtAfter = edgeData.virt[index];
          out.push({
            edge: edgeId,
            at: virtAfter.at,
            node: nodeId,
            priorNode: nodeBefore?.id ?? '',
            afterNode: nodeAfter.id,
          });
        }
      });
    }

    if (out.length === 0) {
      throw new Error(`missing node`);
    }
    return /** @type {types.AtNode[] & [types.AtNode]} */ (out);
  }

  /**
   * Returns any valid position of this node, although it may actually be on many lines.
   *
   * @param {string} nodeId
   * @return {types.AtNode}
   */
  nodePos(nodeId) {
    // TODO: yes this is bad
    return this.linesAtNode(nodeId)[0];
  }

  /**
   * @param {string} a
   * @param {string} b
   * @return {string} resulting ID, one of a or b
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

    return remain.id;
  }

  /**
   * @param {string} a node to join
   * @param {string} via this node
   * @param {string} b node to join
   */
  join(a, via, b) {
    const viaData = this.#dataForNode(via);

    const virtToA = this.#virtBetween(a, via);
    const virtToB = this.#virtBetween(b, via);

    const left = virtIsLess(virtToA, virtToB) ? virtToA : virtToB;
    const right = left === virtToA ? virtToB : virtToA;

    for (const existingPair of viaData.pairs) {
      if (existingPair[0] === left && existingPair[1] === right) {
        throw new Error(`already paired: ${a} (${via}) ${b}`);
      }
    }
    viaData.pairs.push([left, right]);
  }

  /**
   * @param {string} a node
   * @param {string} b node
   * @return {Virt}
   */
  #virtBetween = (a, b) => {
    const dataA = this.#dataForNode(a);
    const dataB = this.#dataForNode(b);

    // Find the line(s) that these are both on (probably one).

    /** @type {Set<string>} */
    const sharedEdge = new Set();
    for (const edge of dataA.holder) {
      if (dataB.holder.has(edge)) {
        sharedEdge.add(edge);
      }
    }
    if (sharedEdge.size === 0) {
      throw new Error(`bad virt, nodes ${a}/${b} don't share edge`);
    }

    for (const edge of sharedEdge) {
      const dataEdge = this.#dataForEdge(edge);

      // find A, see if B is immediately before or after
      const indexOfA = dataEdge.node.findIndex((cand) => cand.id === a);
      if (indexOfA === -1) {
        throw new Error(`bad data`);
      }

      if (dataEdge.node[indexOfA - 1]?.id === b) {
        return dataEdge.virt[indexOfA - 1];
      } else if (dataEdge.node[indexOfA + 1]?.id === b) {
        return dataEdge.virt[indexOfA];
      }
    }

    throw new Error(`missing virt`);
  };

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
      throw new Error(`missing data for node ${node}`);
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