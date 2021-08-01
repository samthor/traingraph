
import * as types from './types.js';
import { nextGlobalId } from './helper/id.js';


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
 * It doesn't have a position because it's at multiple positions on many lines. (This could be
 * put into holder, to be fair). It cannot be on the same line multiple lines, for sanity.
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
   * @return {types.EdgeDetails}
   */
  add(length) {
    if (length <= 0) {
      throw new Error(`can't add zero length line: ${length}`)
    }
    if (~~length !== length) {
      throw new Error(`only supports integer length`);
    }

    const id = nextGlobalId('E');

    const virt = { edge: id, at: 0 };
    const low = { id: nextGlobalId('N'), holder: new Set([id]), pairs: [] };
    const high = { id: nextGlobalId('N'), holder: new Set([id]), pairs: [] };

    this.#byNode.set(low.id, low);
    this.#byNode.set(high.id, high);

    this.#byEdge.set(id, { id, length, virt: [virt], node: [low, high] });

    return this.edgeDetails(id);
  }

  /**
   * @param {string} edge
   * @return {types.EdgeDetails}
   */
  edgeDetails(edge) {
    const data = this.#dataForEdge(edge);
    const i = data.node.length - 1;
    return {
      lowNode: data.node[0].id,
      highNode: data.node[i].id,
      length: data.length,
      edge,
    };
  }

  /**
   * Finds the index of the best matching node. Returns -1 if out of bounds.
   *
   * @param {string} edge
   * @param {number} at
   * @param {-1|0|1} dir
   * @return {number}
   */
  #internalFindNodeIndex = (edge, at, dir) => {
    if (~~at !== at) {
      throw new Error(`can only find at integer: ${at}`);
    }
    const data = this.#dataForEdge(edge);

    // Check the extreme end-case, where we'll match nothing or the edge node only.
    const isEdgeFind = (at <= 0 && dir <= 0) || (at < 0 && dir > 0)
        || (at >= data.length && dir >= 0) || (at > data.length && dir < 0);
    if (isEdgeFind) {
      const isLow = (at <= 0);

      // Check for an invalid search: there's nothing in this direction.
      if ((isLow && dir === -1) || (!isLow && dir === +1)) {
        return -1;
      }

      return isLow ? 0 : data.node.length - 1;
    }

    // Find the nearest node, including if we're on top of it. Prefers the node on the lower side
    // of the line.
    if (dir === 0) {
      // Start the 'best' distance at the end of the line. This will never have a zero distance
      // because we've flagged the edge case at the top of this function.
      let bestIndex = data.virt.length;
      let bestDistance = Math.abs(at - data.length);
      if (bestDistance === 0) {
        throw new Error(`unexpected, cannot be on top of edge`);
      }

      // TODO: binary search

      for (let i = 0; i < data.virt.length; ++i) {
        const check = Math.abs(at - data.virt[i].at);
        if (bestIndex === -1 || check < bestDistance) {
          bestIndex = i;
          bestDistance = check;
        } else if (check > bestDistance) {
          return bestIndex;  // short-circuit, this won't get "better"
        }
      }

      return bestIndex;
    }

    // TODO: gross and slow but works (filters to correct side, picks 1st)

    const checks = data.node.filter(({id}, index) => {
      const nodeAt = data.virt[index]?.at ?? data.length;
      const rel = at - nodeAt;
      return Math.sign(rel) !== dir;
    });

    if (dir === +1) {
      return data.node.indexOf(checks[0]);
    } else {
      return data.node.lastIndexOf(checks[checks.length - 1]);
    }
  };

  /**
   * @param {string} edge
   * @param {number} at
   * @param {(-1|0|1)=} dir
   * @return {types.AtNode}
   */
  #internalFindNode = (edge, at, dir) => {
    let index = -1;
    const data = this.#dataForEdge(edge);

    if (dir === undefined) {
      if (at < 0 || at > data.length) {
        // nothing, index is -1
      } else if (at === data.length) {
        index = data.node.length - 1;
      } else {
        // may be -1, which is fine
        index = data.virt.findIndex(({at: check}) => at === check);
      }
    } else {
      index = this.#internalFindNodeIndex(edge, at, dir);
    }

    if (index === -1) {
      let priorNode = '';
      let afterNode = '';

      if (at < data.length) {
        afterNode = data.node[0].id;
      }
      if (at > 0) {
        priorNode = data.node[data.node.length - 1].id;
      }

      return {
        edge,
        at,
        node: '',
        priorNode,
        afterNode,
      };
    }

    // We always have a prior node if we're past the first index.
    let priorNode = '';
    if (index > 0) {
      priorNode = data.node[index - 1].id;
    }

    // We always have an after node if we're beforet the last index.
    let afterNode = '';
    if (index < data.node.length - 1) {
      afterNode = data.node[index + 1].id;
    }

    return {
      edge,
      at: data.virt[index]?.at ?? data.length,
      node: data.node[index].id,
      priorNode,
      afterNode,
    };
  };

  /**
   * @param {string} edge
   * @param {number} at
   * @param {-1|0|1} dir
   * @return {types.AtNode}
   */
  findNode(edge, at, dir = 0) {
    return this.#internalFindNode(edge, at, dir);
  }

  /**
   * @param {string} edge
   * @param {number} at
   * @return {types.AtNode}
   */
  exactNode(edge, at) {
    return this.#internalFindNode(edge, at);
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
      at: edgeData.virt[index]?.at ?? edgeData.length,
      node: edgeData.node[index].id,
      priorNode: edgeData.node[index - 1]?.id ?? '',
      afterNode: edgeData.node[index + 1]?.id ?? '',
    };
  }

  /**
   * @param {string} edge
   * @param {number} at
   * @return {types.AtNode}
   */
  splitEdge(edge, at) {
    if (~~at !== at) {
      throw new Error(`split only on integer, was: ${at}`);
    }

    // Don't split if this already exists.
    const exact = this.exactNode(edge, at);
    if (exact.node) {
      return exact;
    }

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

    // TODO: this is "special" and should never be deletable. Can we mark this somehow?
    // These will always sort this way as edge is the same, and we know the order already.
    pairs.push([data.virt[before], data.virt[i]]);

    // afterNode may incorrectly point to virt[i], not virt[i+1] (new one)
    for (const p of afterNode.pairs) {
      if (p[0] === beforeVirt) {
        p[0] = newVirt;
      }
      if (p[1] === beforeVirt) {
        p[1] = newVirt;
      }
    }

    return {
      edge,
      at,
      node: newNode.id,
      priorNode: data.node[i - 1]?.id,
      afterNode: data.node[i + 1]?.id,
    };
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
      for (const cand of edgeData.node) {
        if (nodeId === cand.id) {
          out.push(this.nodeOnEdge(edgeId, nodeId));
        }
      }
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
    const data = this.#dataForNode(nodeId);

    // TODO: same loop as `linesAtNode` but we bail early
    for (const edgeId of data.holder) {
      const edgeData = this.#dataForEdge(edgeId);
      for (const cand of edgeData.node) {
        if (nodeId === cand.id) {
          return this.nodeOnEdge(edgeId, nodeId);
        }
      }
    }

    throw new Error(`missing node`);
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

    remove.holder.forEach((otherEdge) => {
      if (remain.holder.has(otherEdge)) {
        throw new Error(`cannot merge nodes on same edge`);
      }

      remain.holder.add(otherEdge);

      const data = this.#dataForEdge(otherEdge);
      data.node = data.node.map((node) => {
        if (node === remove) {
          return remain;
        }
        return node;
      });
    });

    remain.pairs.push(...remove.pairs.splice(0, remove.pairs.length));

    this.#byNode.delete(remove.id);
    return remain.id;
  }

  /**
   * @param {string} a node to join
   * @param {string} via this node
   * @param {string} b node to join
   */
  join(a, via, b) {
    if (a === b) {
      throw new Error(`cannot join same node: ${a}`);
    }

    const viaData = this.#dataForNode(via);

    const {virt: virtToA} = this.#virtBetween(a, via);
    const {virt: virtToB} = this.#virtBetween(b, via);

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
   * @param {string} lowNode
   * @param {string} highNode
   */
  findSegment(lowNode, highNode) {
    const v = this.#virtBetween(lowNode, highNode);
    const edgeData = this.#dataForEdge(v.virt.edge);

    const nextVirtAt = edgeData.virt[v.index + 1]?.at ?? edgeData.length;
    const segmentLength = nextVirtAt - v.virt.at;

    let at = v.virt.at;
    if (v.dir === -1) {
      at = nextVirtAt;
    }

    return {
      edge: v.virt.edge,
      at,
      dir: v.dir,
      segmentLength,
    };
  }

  /**
   * Find the virtual segment between these two nodes. This _feels_ ambiguous but is actually
   * concrete because we don't allow multiple nodes to be merged onto the same edge.
   *
   * Returns the direction between a/b, +ve for a => b, -ve for b => a.
   *
   * @param {string} a node
   * @param {string} b node
   * @return {{virt: Virt, index: number, dir: -1|1}}
   */
  #virtBetween = (a, b) => {
    if (a === b) {
      throw new Error(`cannot find virt between same node: ${a}`);
    }

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

      /** @type {-1|1} */
      let dir;
      let index;
      if (dataEdge.node[indexOfA - 1]?.id === b) {
        index = indexOfA - 1;
        dir = -1;
      } else if (dataEdge.node[indexOfA + 1]?.id === b) {
        index = indexOfA;
        dir = +1;
      } else {
        continue;
      }

      return {virt: dataEdge.virt[index], index, dir};
    }

    throw new Error(`missing virt between nodes: ${a} ${b}`);
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