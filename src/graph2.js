
import * as types from './types.js';
import { nextGlobalId } from './helper/id.js';


/**
 * @typedef {{
 *   low: number,
 *   high: number,
 *   reserve: string,
 * }}
 * @type {never}
 */
export var EdgeReserveData;


/**
 * @typedef {{
 *   length: number,
 *   res: EdgeReserveData[],  // inserted 1-2 times (1 for point, 2 for ends)
 * }}
 * @type {never}
 */
export var EdgeData;


/**
 * Each node is a unique point that may connect to other nodes. Its join dictionary describes
 * incoming nodes and the through-nodes they connect to on the "other side" (0-n).
 *
 * @typedef {{
 *   conn: {[node: string]: {
 *     edge: EdgeData,
 *     through: Set<string>,
 *   }},
 *   reserve: Set<string>,
 * }}
 * @type {never}
 */
export var NodeData;



/**
 * @typedef {{
 *   length: number,
 *   node: string[],
 *   headOffset: number,
 *   tailOffset: number,
 * }}
 * @type {never}
 */
export var ReserveData;



/**
 * @implements {types.SimpleGraphType}
 */
export class GraphSimple {

  /** @type {Map<string, NodeData>} */
  #byNode = new Map();

  /** @type {Map<string, ReserveData>} */
  #byReserve = new Map();

  /**
   * @param {string} id
   */
  _getByNode(id) {
    return this.#dataForNode(id);
  }

  /**
   * @param {string} node
   */
  #dataForNode = (node) => {
    const d = this.#byNode.get(node);
    if (d === undefined) {
      throw new Error(`missing data for node: ${node}`);
    }
    return d;
  };

  /**
   * @return {Iterable<string>}
   */
  allNodes() {
    return this.#byNode.keys();
  }

  /**
   * Add a new disconnected node.
   *
   * @param {string} id optional ID to use
   * @return {string}
   */
  addNode(id = nextGlobalId('N')) {
    if (this.#byNode.has(id)) {
      throw new Error(`can't add duplicate node: ${id}`);
    }
    this.#byNode.set(id, { conn: {}, reserve: new Set() });
    return id;
  }

  /**
   * Connects two nodes. Each pair of nodes can only be connected once.
   *
   * @param {string} a
   * @param {string} b
   * @param {number} length
   */
  connect(a, b, length) {
    if (a === b) {
      throw new Error(`cannot connect same node`);
    }

    const dataA = this.#dataForNode(a);
    const dataB = this.#dataForNode(b);

    if (b in dataA.conn || a in dataB.conn) {
      throw new Error(`nodes previously connected`)
      // TODO: length might change
      if (!(b in dataA.conn || a in dataB.conn)) {
        throw new Error(`previous conn not mirrored: ${a}/${b}`);
      }
      return false;
    }

    /** @type {EdgeData} */
    const edge = { length, res: [] };

    dataA.conn[b] = { edge, through: new Set() };
    dataB.conn[a] = { edge, through: new Set() };

    return true;
  }

  /**
   * Splits the edge between two nodes by inserting another node. This always creates a join
   * via the middle node for the A/B nodes.
   *
   * @param {string} a
   * @param {string} via
   * @param {string} b
   * @param {number} along
   */
  split(a, via, b, along) {
    if (along === 0 || ~~along !== along) {
      throw new Error(`must split at non-zero integer value along line`)
    }
    if (a === b || a === via || via === b) {
      throw new Error(`cannot split same nodes`);
    }

    // TODO: need to split reservations that are within [a,b]

    if (!via) {
      via = this.addNode();
    }

    const dataA = this.#dataForNode(a);
    const dataB = this.#dataForNode(b);
    const dataVia = this.#dataForNode(via);

    if (via in dataA.conn || via in dataB.conn) {
      throw new Error(`can't split connection, side node already connected to: ${via}`);
    }

    const connA = dataA.conn[b];
    const connB = dataB.conn[a];
    if (connA === undefined || connB === undefined) {
      throw new Error(`nodes not already joined`);
    }
    if (via in dataA.conn || via in dataB.conn) {
      throw new Error(`outer nodes already connected to middle node`);
    }

    const commonRemoveEdge = connA.edge;
    if (commonRemoveEdge !== connB.edge) {
      throw new Error(`internal: edge isn't common`);
    }
    if (along < 0) {
      along = commonRemoveEdge.length - along;
    }
    if (along >= commonRemoveEdge.length || along <= 0) {
      throw new Error(`cannot split along edge (${along} / ${commonRemoveEdge.length})`);
    }

    delete dataA.conn[b];
    delete dataB.conn[a];

    // The split gets assigned to whatever node the user passed first.
    const edgeA = { length: along, res: [] };
    const edgeB = { length: connA.edge.length - along, res: [] };

    // This rewrites through values: incoming connections to the end nodes might point at the other
    // side, and they'll now instead point at the middle node.
    Object.values(dataA.conn).forEach((c) => {
      if (c.through.has(b)) {
        c.through.delete(b);
        c.through.add(via);
      }
    });
    Object.values(dataB.conn).forEach((c) => {
      if (c.through.has(a)) {
        c.through.delete(a);
        c.through.add(via);
      }
    });

    // The new middle node can still get to whatever outer nodes it could before.
    // (This is basically a copy but it only copies the 'through' for now).
    dataA.conn[via] = { ...connA, edge: edgeA };
    dataB.conn[via] = { ...connB, edge: edgeB };

    // The middle node can just get to the other sides.
    dataVia.conn[a] = { edge: edgeA, through: new Set([b]) };
    dataVia.conn[b] = { edge: edgeB, through: new Set([a]) };

    return via;
  }

  /**
   * Joins the two nodes A/B via a middle node. Both A/B must already be connected to the middle
   * node.
   *
   * @param {string} a
   * @param {string} via
   * @param {string} b
   */
  join(a, via, b) {
    if (a === b || a === via || via === b) {
      throw new Error(`cannot join same nodes`);
    }
    const dataVia = this.#dataForNode(via);

    if (!(a in dataVia.conn) || !(b in dataVia.conn)) {
      throw new Error(`nodes not already connected`);
    }

    const change = !dataVia.conn[a].through.has(b);

    dataVia.conn[a].through.add(b);
    dataVia.conn[b].through.add(a);

    return change;
  }

  /**
   * @param {string} r
   */
  #dataForReserve = (r) => {
    const d = this.#byReserve.get(r);
    if (d === undefined) {
      throw new Error(`missing data for reserve: ${r}`);
    }
    return d;
  };

  /**
   * @param {string} node
   * @param {string} id
   */
  addReserve(node, id = nextGlobalId('R')) {
    if (this.#byReserve.has(id)) {
      throw new Error(`can't add duplicate reservation: ${id}`);
    }

    // Store this reservation on top of this specific node.
    const nodeData = this.#dataForNode(node);
    nodeData.reserve.add(id);

    /** @type {ReserveData} */
    const reserveData = {
      length: 0,
      node: [node],
      headOffset: 0,
      tailOffset: 0,
    };

    this.#byReserve.set(id, reserveData);
    return id;
  }

  /**
   * @param {string} id
   */
  _getByReserve(id) {
    return this.#dataForReserve(id);
  }

  /**
   * @param {string} r
   * @param {-1|1} end
   * @param {number} by
   * @param {((node: string, options: string[]) => string)=} callback
   */
  #growPart = (r, end, by, callback) => {
    const reserveData = this.#dataForReserve(r);

    // We have space to grow towards the head node, forward.
    if (end === +1 && reserveData.headOffset) {
      const grow = Math.min(reserveData.headOffset, by);
      reserveData.headOffset -= grow;
      return grow;
    }

    // We have space to grow towards the tail node, backwards.
    if (end === -1 && reserveData.tailOffset) {
      const grow = Math.min(reserveData.tailOffset, by);
      reserveData.tailOffset -= grow;
      return grow;
    }

    // Otherwise, this is abutting a node on either end of the reservation.
    let node = '';
    let priorNode = '';

    if (reserveData.node.length === 1) {
      // This reservation is sitting on a specific node with no direction. It can expand in any
      // direction, a special case.
      node = reserveData.node[0];
    } else if (end === +1) {
      // This reservation's head is sitting on a node.
      node = reserveData.node[0];
      priorNode = reserveData.node[1];
    } else if (end === -1) {
      // This reservation's tail is sitting on a node.
      const length = reserveData.node.length;
      node = reserveData.node[length - 1];
      priorNode = reserveData.node[length - 2];
    } else {
      throw new Error('unknown');
    }

    const nodeData = this.#dataForNode(node);

    let options = Object.keys(nodeData.conn);
    if (priorNode !== '') {
      options = options.filter((option) => nodeData.conn[option].through.has(priorNode));
    }

    let choice = options[0] ?? '';
    if (options.length > 1) {
      choice = callback?.(node, options) ?? '';
    }

    const conn = nodeData.conn[choice];
    if (conn === undefined) {
      return 0;  // invalid/no choice
    }

    // Consume as much as possible (maybe whole edge, maybe part).
    const grow = Math.min(by, conn.edge.length);
    if (end === +1) {
      reserveData.node.unshift(choice);
      reserveData.headOffset = conn.edge.length - grow;
    } else {
      reserveData.node.push(choice);
      reserveData.tailOffset = conn.edge.length - grow;
    }
    return grow;
  };

  /**
   * @param {string} r
   * @param {-1|1} end
   * @param {number} by
   * @param {((node: string, options: string[]) => string)=} callback
   */
  grow(r, end, by, callback) {
    if (by !== ~~by || by < 0 || Math.sign(end) !== end) {
      throw new Error(`must grow by +ve integer`);
    }

    const reserveData = this.#dataForReserve(r);
    const total = by;

    while (by > 0) {
      // if (end === +1 && reserveData.headOffset) {
      //   // TODO: options here?
      //   //   - allow overlaps, replace single reservation with another on change (could be many same)
      //   //   - don't allow overlaps, but still allow touch (maybe same problem as above)
      //   //   - wildcard: simplify "all of this edge" case
      //   //                          _
      //   //                        _| |
      //   //   - comedy option... _|   |_ data structure (heights)

      //   // This will change somehow.
      //   const edge = this.#byNode.get(reserveData.node[0])?.conn[reserveData.node[1]].edge;
      //   if (edge === undefined) {
      //     throw new Error(`missing edge for head`);
      //   }

      //   // Create low/high reservation on this edge.
      //   let low = reserveData.node.length === 2 ? reserveData.tailOffset : 0;
      //   let high = reserveData.headOffset;
      //   if (reserveData.node[0] < reserveData.node[1]) {
      //     ([low, high] = [high, low]);
      //   }

      //   const expectedRes = { low, high, reserve: r };
      //   console.debug('expected to remove res', expectedRes);
      // }

      const step = this.#growPart(r, end, by, callback);
      if (step === 0) {
        break;
      }

      by -= step;

      // Find any new head node that we are now on top of.
      let frontNode;
      if (end === +1 && reserveData.headOffset === 0) {
        frontNode = reserveData.node[0];
      } else if (end === -1 && reserveData.tailOffset === 0) {
        const length = reserveData.node.length;
        frontNode = reserveData.node[length - 1];
      } else {
        continue;
      }
      const nodeData = this.#dataForNode(frontNode);
      nodeData.reserve.add(r);
    }

    const growth = total - by;
    if (growth === 0) {
      return 0;
    }

    reserveData.length += growth;
    return growth;
  }

  /**
   * @param {string} r
   * @param {-1|1} end
   * @param {number} by
   */
  #shrinkPart = (r, end, by) => {
    const reserveData = this.#dataForReserve(r);

    // We're on a single node and cannot shrink further (-ve shrink does not grow).
    if (reserveData.node.length === 1) {
      throw new Error(`internal; should not try to shrink zero-sized reservation`);
    }

    if (end === +1) {
      const front = reserveData.node[0];
      const prior = reserveData.node[1];

      const edge = this.#byNode.get(front)?.conn[prior].edge;
      if (edge === undefined) {
        throw new Error(`internal: can't shrink, missing edge`);
      }

      // Is this reservation only on this single segment? If so, limit its ability to shrink.
      const priorOffset = reserveData.node.length === 2 ? reserveData.tailOffset : 0;
      const edgeUse = edge.length - (reserveData.headOffset + priorOffset);
      const shrink = Math.min(edgeUse, by);
      reserveData.headOffset += shrink;

      // Did we consume the entire edge? If so, remove it.
      if (reserveData.headOffset === edge.length) {
        reserveData.node.shift();
        reserveData.headOffset = 0;
      }

      return shrink;

    } else if (end === -1) {
      const length = reserveData.node.length;
      const front = reserveData.node[length - 1];
      const prior = reserveData.node[length - 2];

      const edge = this.#byNode.get(front)?.conn[prior].edge;
      if (edge === undefined) {
        throw new Error(`internal: can't shrink, missing edge`);
      }

      // Is this reservation only on this single segment? If so, limit its ability to shrink.
      const priorOffset = reserveData.node.length === 2 ? reserveData.headOffset : 0;
      const edgeUse = edge.length - (reserveData.tailOffset + priorOffset);
      const shrink = Math.min(edgeUse, by);
      reserveData.tailOffset += shrink;

      // Did we consume the entire edge? If so, remove it.
      if (reserveData.tailOffset === edge.length) {
        reserveData.node.pop();
        reserveData.tailOffset = 0;
      }

      return shrink;
    }

    throw new Error('internal: should not get here');
  };

  /**
   * @param {string} r
   * @param {-1|1} end
   * @param {number} by
   */
  shrink(r, end, by) {
    if (by !== ~~by || by < 0 || Math.sign(end) !== end) {
      throw new Error(`must shrink by +ve integer`);
    }

    const reserveData = this.#dataForReserve(r);
    const total = Math.min(reserveData.length, by);
    if (total === 0) {
      return 0;  // don't bother looping, we can't shrink anyway
    }
    by = total;

    while (by > 0) {
      // Find out if we're no longer on top of a certain head node. This will mostly be a valid
      // node, except where we loop on ourselves (don't remove us).
      // TODO: probably harder to find self overlap since it's a boolean on/off
      const length = reserveData.node.length;
      let frontNode = '';
      if (end === +1 && reserveData.headOffset === 0) {
        frontNode = reserveData.node[0];
        // start at [n,?,?,...] because nodes cannot join to self
        for (let i = 3; i < length; ++i) {
          if (reserveData.node[i] === frontNode) {
            frontNode = '';
            break;
          }
        }
      } else if (end === -1 && reserveData.tailOffset === 0) {
        frontNode = reserveData.node[length - 1];
        // only check [...,?,?,n] for same reasons as above
        for (let i = 0; i < length - 3; ++i) {
          if (reserveData.node[i] === frontNode) {
            frontNode = '';
            break;
          }
        }
      }
      if (frontNode) {
        const nodeData = this.#dataForNode(frontNode);
        nodeData.reserve.delete(r);
      }

      const step = this.#shrinkPart(r, end, by);
      if (step === 0) {
        throw new Error(`unable to shrink by: ${by}`);
      }
      by -= step;
    }

    reserveData.length -= total;
    return total;
  }

  /**
   * @param {string} node
   * @return {Iterable<{ other: string, length: number }>}
   */
  connectAtNode(node) {
    const nodeData = this.#dataForNode(node);
    return Object.keys(nodeData.conn).map((other) => {
      return { other, length: nodeData.conn[other].edge.length };
    });
  }

  /**
   * @param {string} node
   * @return {Iterable<[string, string]>}
   */
  joinsAtNode(node) {
    const nodeData = this.#dataForNode(node);

    /** @type {Map<string, [string, string]>} */
    const all = new Map();

    for (const [other, conn] of Object.entries(nodeData.conn)) {
      for (const c of conn.through) {
        let left = other;
        let right = c;
        if (right < left) {
          ([left, right] = [right, left]);
        }

        // We'll see both sides, so just return it once.
        const key = `${left}:${right}`;
        all.set(key, [left, right]);
      }
    }

    return all.values();
  }

  /**
   * @param {string} a
   * @param {string} b
   */
  lineFor(a, b) {
    const nodeData = this.#dataForNode(a);

    const other = nodeData.conn[b];
    if (other === undefined) {
      return null;
    }

    return { length: other.edge.length };
  }

  /**
   * @param {string} r 
   */
  points(r) {
    const reserveData = this.#dataForReserve(r);
    return {...reserveData, node: reserveData.node.slice()};
  }

}

