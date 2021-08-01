
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
      debugger;
      throw new Error(`bad virt, not on correct edge`);
    };

    /** @type {[string, string][]} */
    const out = data.pairs.map(([a, b]) => {
      // find what edges a,b are on and what virts they are adjacent to
      return [nodeVia(a), nodeVia(b)];
    });

    // Insert virtual pairs for the edges that the node is on (unless it's the end node).
    data.holder.forEach((edge) => {
      const dataEdge = this.#dataForEdge(edge);
      const indexOfNode = dataEdge.node.indexOf(data);
      if (indexOfNode === -1) {
        throw new Error(`unxpected node not in holder`);
      }
      if (indexOfNode === 0 || indexOfNode === dataEdge.node.length - 1) {
        return;
      }

      out.push([
        dataEdge.node[indexOfNode - 1].id,
        dataEdge.node[indexOfNode + 1].id,
      ]);
    });

    return out;
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

    throw new Error(`missing node: ${nodeId}`);
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

  /**
   * @param {types.AtNodeDirRequest} from
   * @param {types.AtNodeRequest} to
   */
  search(from, to) {
    /** @type {(() => void)[]} */
    const cleanup = [];

    /** @type {(req: types.AtNodeRequest | types.AtNodeDirRequest) => { node: string, prevNode: string, fake: boolean }} */
    const ensureNode = (req) => {
      const prevNode = 'prevNode' in req && req.prevNode || '';
      if (req.node) {
        if (req.edge || req.at) {
          throw new Error(`node doesn't need edge/at`);
        }
        return { node: req.node, prevNode, fake: false };
      }
      if (!req.edge || req.at === undefined) {
        throw new Error(`without real node, edge/at must be specified`);
      }
      const { edge, at } = req;

      // See if there's a node here.
      const exactNode = this.exactNode(edge, at);
      if (exactNode.node) {
        return { node: exactNode.node, prevNode, fake: false };
      }

      // Create a node at the given position that gets removed later.
      const created = this.splitEdge(edge, at);
      cleanup.push(() => {
        this.#internalDeleteNode(created.node);
      });

      return { node: created.node, prevNode, fake: true };
    };

    const nodeFrom = ensureNode(from);
    const nodeTo = ensureNode(to);


    try {
      const path = this.#internalSearch(nodeFrom, nodeTo.node);
      if (!path) {
        return null;
      }

      /** @type {Set<string>} */
      const fakeSet = new Set();

      nodeFrom.fake && fakeSet.add(nodeFrom.node);
      nodeTo.fake && fakeSet.add(nodeTo.node);

      const out = path.map((node) => {
        const at = this.nodePos(node);

        if (fakeSet.has(node)) {
          at.node = '';
        }

        return at;
      });
      return out;

    } finally {
      cleanup.forEach((fn) => fn());
    }
  }

  /**
   * @param {{ node: string, prevNode: string }} from
   * @param {string} to
   */
  #internalSearch = (from, to) => {

    /** @type {Set<string>} */
    const visited = new Set();

    /**
     * @typedef {{ node: string, prevNode: string, prev?: SearchHead }}
     * @type {never}
     */
    var SearchHead;

    /** @type {SearchHead[]} */
    const heads = [];

    if (from.prevNode) {
      // This might be a directed search that is already at its target.
      if (from.node === to) {
        return [to, from.prevNode];
      }
      heads.push(from);
    } else if (from.node === to) {
      // We're a directionless search that found its target already.
      return [to];
    } else {
      // This is an undirected search. We find all possible pairs from the node we're at (could
      // be fake or real).
      const pairs = this.pairsAtNode(from.node);
      for (const p of pairs) {
        heads.push(
          { node: p[0], prevNode: from.node },
          { node: p[1], prevNode: from.node },
        );
      }
    }

    for (;;) {
      const next = heads.shift();
      if (next === undefined) {
        return null;
      }

      // We've found the target! Walk backwards through the nodes to flatten the path.
      if (next.node === to) {

        /** @type {string[]} */
        const path = [];

        let curr = next;
        while (curr) {
          path.push(curr.node);

          // At the end, add the awkward starting point.
          if (curr.prev === undefined) {
            if (curr.prevNode) {
              path.push(curr.prevNode);
            }
            break;
          }

          curr = curr.prev;
        }

        return path;
      }

      const pairs = this.pairsAtNode(next.node);

      const choices = /** @type {string[]} */ (pairs.map(([left, right]) => {
        // We might not be coming in on a matching pair, so we can't include all (e.g., crossed
        // lines). Need to filter out valid oness, might be empty.
        if (left === next.prevNode) {
          return right;
        } else if (right === next.prevNode) {
          return left;
        }
        return null;
      }).filter(Boolean));

      const segmentChoices = choices.map((choice) => {
        const segment = this.findSegment(next.node, choice);
        return {
          id: `${next.node}:${choice}`,
          segment,
          prevNode: next.node,
          node: choice,
        };
      });

      for (const choice of segmentChoices) {
        if (visited.has(choice.id)) {
          continue;
        }
        heads.push({
          node: choice.node,
          prevNode: choice.prevNode,
          prev: next,
        });
      }
    }

  };

  /**
   * @param {string} node
   */
  #internalDeleteNode = (node) => {
    const linesAtNode = [...this.linesAtNode(node)];
    if (linesAtNode.length !== 1) {
      throw new Error(`can only do simple deletions`);
    }
    const onlyLine = linesAtNode[0];

    const data = this.#dataForEdge(onlyLine.edge);
    const index = data.node.findIndex(({id}) => id === node);
    if (index <= 0 || index >= data.node.length - 1) {
      throw new Error(`couldn't find cleanup node: ${index}`);
    }

    // Pairs only exist if this is not a boring clean split.
    const o = data.node[index];
    if (o.pairs.length) {
      throw new Error(`can't delete node with real virts`);
    }

    //   V    Vx      V
    // N    Nx    Nj     N
    //
    // we're deleting "x", but join is at J. So we have to join to x -1.

    data.node.splice(index, 1);
    const removedVirt = data.virt.splice(index, 1)[0];
    const updatedVirt = data.virt[index - 1];

    const afterNode = data.node[index];

    for (const p of afterNode.pairs) {
      if (p[0] === removedVirt) {
        p[0] = updatedVirt;
      }
      if (p[1] === removedVirt) {
        p[1] = updatedVirt;
      }
    }


    this.#byNode.delete(node);
  };
}

// A 
// |
// |
// |\
// | \
// B  C