
import * as types from './types.js';
import { nextGlobalId } from './helper/id.js';
import { inlineLessSort } from './helper/swap.js';


/**
 * @typedef {{
 *   edge: string,
 *   dir: -1|1,
 * }}
 * @type {never}
 */
export var PairSide;


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
 *   pairs: [PairSide, PairSide][],
 * }}
 * @type {never}
 */
export var Node;


/**
 * @typedef {{
 *   id: string,
 *   length: number,
 *   virt: number[],      // positions of nodes along edge
 *   node: Node[],        // node objects (shared with other edges)
 *   other: Set<String>,  // existing joins to other edges
 * }}
 * @type {never}
 */
export var EdgeData;


/**
 * @param {PairSide} a
 * @param {PairSide} b
 * @return {boolean}
 */
function pairSideIsLess(a, b) {
  if (a.edge < b.edge) {
    return true;
  } else if (a.edge > b.edge) {
    return false;
  }
  return a.dir < b.dir;
}


/**
 * @param {PairSide} a
 * @param {PairSide} b
 * @return {boolean}
 */
function pairSideEqual(a, b) {
  return a.dir === b.dir && a.edge === b.edge;
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

    const low = { id: nextGlobalId('N'), holder: new Set([id]), pairs: [] };
    const high = { id: nextGlobalId('N'), holder: new Set([id]), pairs: [] };

    this.#byNode.set(low.id, low);
    this.#byNode.set(high.id, high);

    /** @type {EdgeData} */
    const data = {
      id,
      length,
      virt: [0, length],
      node: [low, high],
      other: new Set(),
    };
    this.#byEdge.set(id, data);

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
      other: [...data.other],
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
      let bestIndex = data.virt.length - 1;
      let bestDistance = Math.abs(at - data.length);
      if (bestDistance === 0) {
        throw new Error(`unexpected, cannot be on top of edge`);
      }

      // TODO: binary search

      for (let i = 0; i < data.virt.length - 1; ++i) {
        const check = Math.abs(at - data.virt[i]);
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
      const nodeAt = data.virt[index];
      const rel = at - nodeAt;
      return Math.sign(rel) === -dir;
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
        index = data.virt.findIndex((check) => at === check);
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
      at: data.virt[index],
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
      at: edgeData.virt[index],
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
    for (i = 0; i < data.virt.length - 1; ++i) {
      if (at < data.virt[i]) {
        break;
      }
    }

    const before = i - 1;
    const afterNode = data.node[i];
    if (before < 0 || afterNode === undefined) {
      throw new Error(`bad`);
    }

    /** @type {[PairSide, PairSide][]} */
    const pairs = [];

    const newNode = { id: nextGlobalId('N'), holder: new Set([edge]), pairs };
    this.#byNode.set(newNode.id, newNode);

    data.virt.splice(i, 0, at);
    data.node.splice(i, 0, newNode);

    return {
      edge,
      at,
      node: newNode.id,
      priorNode: data.node[i - 1]?.id,
      afterNode: data.node[i + 1]?.id,
    };
  }

  /**
   * Returns all the pairs at this node. This will point to the adjacent nodes that are connected.
   *
   * This won't always be all lines, which might intersect at the node without being paired up
   * (e.g., angle too steep).
   *
   * @param {string} nodeId
   * @return {[string, string][]}
   */
  pairsAtNode(nodeId) {
    const data = this.#dataForNode(nodeId);

    /** @type {(side: PairSide) => string} */
    const nodeVia = (side) => {
      // TODO: nodeOnEdge could return index then no need to do find again
      const nodeInfo = this.nodeOnEdge(side.edge, nodeId);
      const result = this.findNode(side.edge, nodeInfo.at, side.dir);

      if (!result.node) {
        throw new Error(`could not find node in dir: ${side.dir}`);
      }
      return result.node;
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
   * Returns all directions from node. This will point to the adjacent nodes that are connected.
   *
   * This is useful for ambiguous pathfinding or rendering, but not much else.
   *
   * TODO: maybe include a source incoming node dir?
   *
   * @param {string} nodeId
   * @return {Iterable<string>}
   */
  dirsFromNode(nodeId) {
    /** @type {Set<string>} */
    const out = new Set();

    for (const pos of this.linesAtNode(nodeId)) {
      out.add(pos.afterNode);
      out.add(pos.priorNode);
    }

    out.delete('');  // after or prior might be blank
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
      out.push(this.nodeOnEdge(edgeId, nodeId));
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

    for (const edgeId of data.holder) {
      // bail on first edge in holder, it's valid
      return this.nodeOnEdge(edgeId, nodeId);
    }

    throw new Error(`missing node: ${nodeId}`);
  }

  /**
   * @param {string} a
   * @param {string} b
   * @return {string} resulting ID, one of a or b
   */
  mergeNode(a, b) {
    if (a === b) {
      return a;  // can't join same node
    }

    const dataA = this.#dataForNode(a);
    const dataB = this.#dataForNode(b);

    // Both nodes are on 1-n edges. Create a resulting set of edges that the joined node will have.
    const edgesAtFinalNode = new Set(dataA.holder);
    for (const e of dataB.holder) {
      if (edgesAtFinalNode.has(e)) {
        throw new Error(`nodes already touch same edge`);
      }
      edgesAtFinalNode.add(e);
    }

    // One node remains, one is removed. Keep the one with more joins.
    const [remove, remain] = inlineLessSort((a, b) => a.holder.size < b.holder.size, [dataA, dataB]);

    // Make sure that the newly joined edges don't already join each other.
    // This prevents cases like this:
    //
    //     A
    //    / \
    //   /   \
    //   \   /
    //    \ /
    //     B
    //
    // ... which make the segment between A/B ambiguous: which edge does it take?
    //
    // - Pick a side, it doesn't matter
    // - For every edge connected to that node:
    //    - Find every other edge that's already connected to
    //    - If that other edge is connected to the other original node's side, fail
    for (const edge of dataA.holder) {
      const data = this.#dataForEdge(edge);
      for (const o of data.other) {
        if (dataB.holder.has(o)) {
          throw new Error('can\'t connect edges twice');
        }
      }
    }

    // At this point, the join is valid, so be destructive.

    // Add edges that "remove" was on, to "remain".
    // Also replace node references on those edges from "remove" => "remain".
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

    // Add all pairs from "remove" onto "remain". These remain valid, because they just point in
    // certain directions along existing edges.
    remain.pairs.push(...remove.pairs.splice(0, remove.pairs.length));

    // For every edge now at this node, make sure they're marked as connected to each other.
    remain.holder.forEach((edge) => {
      const data = this.#dataForEdge(edge);
      for (const repeat of remain.holder) {
        if (repeat !== edge) {
          // don't include self
          data.other.add(repeat);
        }
      }
    });

    this.#byNode.delete(remove.id);
    return remain.id;
  }

  /**
   * @param {string} a node in direction to join
   * @param {string} via this node
   * @param {string} b node in direction to join
   * @return {boolean}
   */
  join(a, via, b) {
    if (a === b || a === via || b === via) {
      throw new Error(`cannot join same node: ${a} ${via} ${b}`);
    }

    const betweenA = this.findBetween(via, a);
    const betweenB = this.findBetween(via, b);

    if (betweenA.edge === betweenB.edge) {
      throw new Error(`can't join on same edge`);
    }

    // 1. find edge [a,via] and dir
    // 2. find edge [via,b] and dir
    // 3. ensure not same edge
    // 4. add pairs on via (edge, dir)

    const viaData = this.#dataForNode(via);

    const source = [{ edge: betweenA.edge, dir: betweenA.dir }, { edge: betweenB.edge, dir: betweenB.dir }];
    const [left, right] = inlineLessSort(pairSideIsLess, source);

    for (const [ existingLeft, existingRight ] of viaData.pairs) {
      if (pairSideEqual(existingLeft, left) && pairSideEqual(existingRight, right)) {
        return false;
      }
    }
    viaData.pairs.push([left, right]);
    return true;
  }

  /**
   * @param {string} lowNode
   * @param {string} highNode
   * @return {types.SegmentInfo}
   */
  findBetween(lowNode, highNode) {
    if (lowNode === highNode) {
      throw new Error(`can't find between same node`);
    }

    const lowData = this.#dataForNode(lowNode);
    const highData = this.#dataForNode(highNode);

    let sharedEdge = '';
    for (const edge of lowData.holder) {
      if (highData.holder.has(edge)) {
        sharedEdge = edge;
        break;
      }
    }
    if (!sharedEdge) {
      throw new Error(`can't find between, nodes [${lowData},${highData}] aren't on same edge`);
    }

    const edgeData = this.#dataForEdge(sharedEdge);
    const lowIndex = edgeData.node.findIndex(({id}) => id === lowNode);
    const highIndex = edgeData.node.findIndex(({id}) => id === highNode);
    if (lowIndex === -1 || highIndex === -1) {
      throw new Error(`internal error, node not found in edge`);
    }

    /** @type {string[]} */
    let inner;
    if (lowIndex < highIndex) {
      // normal +ve dir
      inner = edgeData.node.slice(lowIndex + 1, highIndex).map(({id}) => id);
    } else {
      // -ve dir, slice inverse and reverse list
      inner = edgeData.node.slice(highIndex + 1, lowIndex).map(({id}) => id);
      inner.reverse();
    }

    const lowAt = edgeData.virt[lowIndex];
    const highAt = edgeData.virt[highIndex];

    return {
      dir: /** @type {-1|1} */ (Math.sign(highAt - lowAt)),
      length: Math.abs(lowAt - highAt),
      inner,
      lowNode,
      lowAt,
      highNode,
      highAt,
      edge: sharedEdge,
    };
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
      const dirs = this.dirsFromNode(from.node);
      for (const dir of dirs) {
        heads.push({ node: dir, prevNode: from.node });
      }
    }

    // TODO: there is an infinite loop that's possible here
    let steps = 1000;

    for (;;) {
      const next = heads.shift();
      if (next === undefined) {
        return null;
      }
      --steps;
      if (steps === 0) {
        throw new Error(`TODO: pathfinding took too many steps`);
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
        const segment = this.findBetween(next.node, choice);
        if (segment.inner.length !== 0) {
          throw new Error(`pathfinding should go at most one step`);
        }
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
    const nodeData = this.#dataForNode(node);
    if (nodeData.holder.size !== 1) {
      throw new Error(`can only do simple deletions, node on multiple lines: ${node}`);
    }
    if (nodeData.pairs.length !== 0) {
      throw new Error(`can only do simple deletions, node has other pairs: ${node}`);
    }

    // Get only entry of the holder Set.
    let edge = '';
    for (const cand of nodeData.holder) {
      edge = cand;
    }

    const data = this.#dataForEdge(edge);
    const index = data.node.findIndex(({id}) => id === node);
    if (index <= 0 || index >= data.node.length - 1) {
      throw new Error(`couldn't find cleanup node: ${index}`);
    }

    // Finally, actually splice the node/position out, and nuke its data.
    data.node.splice(index, 1);
    data.virt.splice(index, 1);
    this.#byNode.delete(node);
  };
}

// A 
// |
// |
// |\
// | \
// B  C