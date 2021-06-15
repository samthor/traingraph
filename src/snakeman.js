
import { nextGlobalId } from './helper/id';
import * as types from './types';


/**
 * @typedef {{
 *   edge: string,
 *   dir: -1|1,
 *   low: number,
 *   high: number,
 * }}
 * @type {never}
 */
export var SnakePart;


/**
 * @typedef {{
 *   id: string,
 *   length: number,
 *   parts: SnakePart[],
 * }}
 * @type {never}
 */
export var Snake;


export class SnakeMan {
  #g;

  /** @type {Map<string, Snake>} */
  #bySnake = new Map();

  /**
   * @param {types.GraphType} graph
   */
  constructor(graph) {
    this.#g = graph;
  }

  /**
   * @return {Iterable<Snake>}
   */
  allSnakes() {
    return this.#bySnake.values();
  }

  /**
   * @param {string} edge
   * @param {number} at
   * @param {-1|1} dir
   */
  addSnake(edge, at, dir) {
    const id = nextGlobalId('S');

    const s = {
      id,
      length: 0,
      parts: [{
        edge,
        dir,
        high: at,
        low: at,
      }],
    };

    this.#bySnake.set(id, s);
    return id;
  }

  /**
   * @param {string} snake
   * @param {-1|1} end
   * @param {number} by
   */
  expand(snake, end, by) {
    const data = this.#dataForSnake(snake);

    // console.info('(expand)', `end=${end} by=${by}`);

    // TODO: sanity check parts vs intended length
    let totalUse = 0;
    for (const part of data.parts) {
      const details = this.#g.edgeDetails(part.edge);
      const partUse = (part.high - part.low) * details.length;
      totalUse += partUse;
    }
    if (totalUse !== data.length) {
      // TODO: This is never quite right because floating point, BUT, seems to remain near the
      // intended length over time.
      const delta = Math.abs(totalUse - data.length);
      if (delta > 0.0001) {
        console.debug(`got mismatch use/length: ${totalUse}, ${data.length}`);
      }
    }

    if (by > 0) {
      this.#increaseSnake(snake, end, by);
    } else {
      this.#reduceSnake(snake, end, -by);
    }
    return data.length;
  }

  /**
   * @param {string} snake
   * @param {-1|1} end
   * @param {number} by
   */
  #reduceSnake = (snake, end, by) => {
    const data = this.#dataForSnake(snake);
    by = Math.max(0, by);

    // Decrement by this much, but not such that the length could become negative. Step through
    // as many nodes as required.
    let dec = Math.min(by, data.length);
    while (data.length > 0 && dec > 0) {
      const index = end === 1 ? data.parts.length - 1 : 0;
      const part = data.parts[index];
      const details = this.#g.edgeDetails(part.edge);

      const effectiveDir = /** @type {-1|1} */ (end * part.dir);

      // The part is in [0,1] space, so convert it to real space relative to its actual length.
      const partUse = (part.high - part.low) * details.length;

      // The change fits in this node; modify it and we're done.
      if (partUse >= dec) {
        if (effectiveDir === 1) {
          part.high -= dec / details.length;
        } else {
          part.low += dec / details.length;
        }
        break;
      }

      // Don't allow the last element to be spliced out, the snake must always have length zero.
      // TODO: does this ever fire? the `>=` above might catch it?
      if (data.parts.length === 1) {
        if (effectiveDir === 1) {
          // high was front, move back to low
          part.high = part.low;
        } else {
          // low was front, move back to high
          part.low = part.high;
        }
        break;
      }

      // Remove the contents of the whole node.
      dec -= partUse;
      data.parts.splice(index, 1);
    }

    data.length -= by;
  };

  /**
   * @param {string} snake
   * @param {-1|1} end
   * @param {number} by
   */
  #increaseSnake = (snake, end, by) => {
    const data = this.#dataForSnake(snake);
    by = Math.max(0, by);

    if (end === -1) {
      throw new Error(`TODO`)
    }

    // Expand snake (currently only at end=+1).
    let inc = by;
    while (inc > 0) {
      const part = data.parts[data.parts.length - 1];
      const findFrom = part.dir === 1 ? part.high : part.low;

      const details = this.#g.edgeDetails(part.edge);

      const nodeInDir = this.#g.findNode(part.edge, findFrom, part.dir);
      const deltaToNode = Math.abs(findFrom - nodeInDir.at) * details.length;

      const effectiveDir = /** @type {-1|1} */ (end * part.dir);

      // This change fits neatly before the next node in this direction.
      if (inc <= deltaToNode) {
        if (effectiveDir === 1) {
          part.high += inc / details.length;
        } else {
          part.low -= inc / details.length;
        }
        // console.debug('...exp fits', inc / details.length, 'now', {low: part.low, high: part.high});
        break;
      }

      // Move completely towards this node.
      // TODO: "mark" this node as being occupied
      let fromNode = '';
      if (effectiveDir === 1) {
        part.high = nodeInDir.at;
        fromNode = nodeInDir.priorNode;
      } else {
        part.low = nodeInDir.at;
        fromNode = nodeInDir.afterNode;
      }
      inc -= deltaToNode;

      // console.debug('...moved TO node', nodeInDir, 'findFrom was', findFrom);

      // Catch not having a real node so we can keep extending awkwardly off the edge.
      const pairsAtNode = nodeInDir.node ? Array.from(this.#g.pairsAtNode(nodeInDir.node)) : [];

      // If there's nowhere to go, extend awkwardly off the end of this edge.
      if (!pairsAtNode.length) {
        if (effectiveDir === 1) {
          part.high += inc / details.length;
        } else {
          part.low -= inc / details.length;
        }
        break;
      }

      const choices = pairsAtNode.filter(([left, right]) => {
        return left === fromNode || right === fromNode;
      }).map(([left, right]) => {
        return {from: fromNode, via: nodeInDir.node, to: left === fromNode ? right : left};
      });

      let choice = choices[0];
      if (choices.length > 1) {
        // TODO: we make random choice rather than asking client
        const choiceIndex = ~~(Math.random() * choices.length);
        choice = choices[choiceIndex];
        console.warn('made random choice', choice);
      }

      const seg = this.#g.findSegment(choice.via, choice.to);

      data.parts.push({
        edge: seg.edge,
        dir: seg.dir,
        low: seg.at,
        high: seg.at,
      });
    }

    data.length += by;
  };

  /**
   * @param {string} snake
   */
  #dataForSnake = (snake) => {
    const d = this.#bySnake.get(snake);
    if (d === undefined) {
      throw new Error(`no snake data for: ${snake}`);
    }
    return d;
  };
}