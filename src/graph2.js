
import { nextGlobalId } from './helper/id.js';



/**
 * @typedef {{
 *   length: number,
 * }}
 * @type {never}
 */
export var EdgeData;


/**
 * Each node is a unique point that may connect to other nodes. Its join dictionary describes
 * incoming nodes and the through-nodes they connect to on the "other side" (0-n).
 *
 * @typedef {{
 *   id: string,
 *   conn: {[node: string]: {
 *     edge: EdgeData,
 *     through: string[],
 *   }}
 * }}
 * @type {never}
 */
export var NodeData;




export class GraphSimple {

  /** @type {Map<string, NodeData>} */
  #byNode = new Map();

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
   * Add a new disconnected node.
   *
   * @param {string} id optional ID to use
   * @return {string}
   */
  addNode(id = nextGlobalId()) {
    if (this.#byNode.has(id)) {
      throw new Error(`can't add duplicate node: ${id}`);
    }
    this.#byNode.set(id, { id, conn: {} });
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
    const edge = { length };

    dataA.conn[b] = { edge, through: [] };
    dataB.conn[a] = { edge, through: [] };

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
    const edgeA = { length: along };
    const edgeB = { length: connA.edge.length - along };

    // This rewrites through values: incoming connections to the end nodes might point at the other
    // side, and they'll now instead point at the middle node.
    Object.values(dataA.conn).forEach((c) => {
      c.through = c.through.map((other) => other === b ? via : other);
    });
    Object.values(dataB.conn).forEach((c) => {
      c.through = c.through.map((other) => other === a ? via : other);
    });

    // The new middle node can still get to whatever outer nodes it could before.
    // (This is basically a copy but it only copies the 'through' for now).
    dataA.conn[via] = { ...connA, edge: edgeA };
    dataB.conn[via] = { ...connA, edge: edgeB };

    // The middle node can just get to the other sides.
    dataVia.conn[a] = { edge: edgeA, through: [b] };
    dataVia.conn[b] = { edge: edgeB, through: [a] };
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

    let change = false;
    change = arrayInsert(dataVia.conn[a].through, b) || change;
    change = arrayInsert(dataVia.conn[b].through, a) || change;
    return change;
  }

}


/**
 * @template T
 * @param {T[]} arr
 * @param {T} add
 */
const arrayInsert = (arr, add) => {
  if (arr.includes(add)) {
    return false;
  }
  arr.push(add);
  return true;
};
