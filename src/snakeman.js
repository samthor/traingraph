
import { nextGlobalId } from './helper/id';
import * as types from './types';


/**
 * @typedef {{
 *   snake: string,
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

  /** @type {Map<string, SnakePart[]>} */
  #reservedEdge = new Map();

  // TODO: nodes currently being touched or intersected by snakes
  /** @type {Map<string, Set<string>>} */
  #reservedNode = new Map();

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
    if (at < 0.0 || at > 1.0) {
      throw new Error(`can't add snake off edge: ${at}`);
    }

    const id = nextGlobalId('S');
    const startPart = {
      snake: id,
      edge,
      dir,
      high: at,
      low: at,
    };

    if (!this.#reserve(startPart)) {
      return '';
    }

    const s = {
      id,
      length: 0,
      parts: [startPart],
    };

    this.#bySnake.set(id, s);
    return id;
  }

  /**
   * @param {string} snake
   */
  removeSnake(snake) {
    const data = this.#dataForSnake(snake);

    // Remove reserved edge parts of this snake.
    data.parts.forEach((part) => this.#unreserve(part));

    this.#bySnake.delete(snake);
  }

  /**
   * @param {SnakePart} part
   */
  #unreserve = (part) => {
    const reserved = this.#reservedEdge.get(part.edge);
    if (reserved === undefined) {
      throw new Error(`can't unreserve, nothing for edge?`);
    }
    const index = reserved.indexOf(part);
    if (index === -1) {
      throw new Error(`can't unreserve, not found?`);
    }
    reserved.splice(index, 1);
    if (reserved.length === 0) {
      this.#reservedEdge.delete(part.edge);
    }
  };

  /**
   * @param {string} edge
   * @param {number} low
   * @param {number} high
   */
  #query = (edge, low, high) => {
    const reserved = this.#reservedEdge.get(edge);
    if (reserved === undefined) {
      return 0;
    }

    let i;
    for (i = 0; i < reserved.length; ++i) {
      const check = reserved[i];
      if (low > check.low && low < check.high) {
        return -1;
      }
      if (low <= check.low) {
        break;
      }
    }

    for (let j = i; j < reserved.length; ++j) {
      const check = reserved[j];
      if (high > check.low && high < check.high) {
        return -1;
      }
    }

    return i;
  };

  /**
   * @param {SnakePart} part
   * @param {-1|1} dir
   * @return {{other: SnakePart?, dist: number}}
   */
  #adjacentReservation = (part, dir) => {
    const all = this.#reservedEdge.get(part.edge);
    const index = all?.indexOf(part) ?? -1;
    if (all === undefined || index === -1) {
      throw new Error(`missing reserved part`);
    }

    if (dir === -1) {
      if (index === 0) {
        return {other: null, dist: part.low};
      }
      const other = all[index - 1];
      return {other, dist: part.low - other.high};
    }

    const other = all[index + 1];
    if (other === undefined) {
      return {other: null, dist: 1.0 - part.high};
    }
    return {other, dist: other.low - part.high};
  };

  /**
   * @param {SnakePart} part
   */
  #reserve = (part) => {
    const existing = this.#reservedEdge.get(part.edge);
    if (existing === undefined) {
      this.#reservedEdge.set(part.edge, [part]);
      return true;
    }

    const index = this.#query(part.edge, part.low, part.high);
    if (index === -1) {
      return false;
    }
    existing.splice(index, 0, part);
    return true;
  };

  /**
   * @param {string} snake
   * @param {-1|1} end
   * @param {number} by
   * @return {number} the successful change amount (only <by if +ve)
   */
  expand(snake, end, by) {
    const data = this.#dataForSnake(snake);

    // console.info('(expand)', `end=${end} by=${by}`);

    // TODO: sanity check parts vs intended length
    // TODO: the snake IS drifting in width over time ... floating point!
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

    if (by === 0.0) {
      return 0;
    } else if (by > 0) {
      return this.#increaseSnake(snake, end, by);
    } else {
      this.#reduceSnake(snake, end, -by);
      return -by;
    }
  }

  /**
   * @param {string} snake
   * @param {-1|1} end
   * @param {number} by
   * @return {number} the successful change amount (only <by if +ve)
   */
  move(snake, end, by) {
    const expandBy = this.expand(snake, end, by);
    this.expand(snake, /** @type {1|-1} */ (-end), -expandBy);
    return expandBy;
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
      this.#unreserve(part);
      data.parts.splice(index, 1);
    }

    data.length -= by;
  };

  /**
   * @param {string} snake
   * @param {-1|1} end
   * @param {number} by
   * @return {number} amount moved by
   */
  #increaseSnake = (snake, end, by) => {
    const data = this.#dataForSnake(snake);
    by = Math.max(0, by);

    let inc = by;
    while (inc > 0) {
      const part = end === 1 ? data.parts[data.parts.length - 1] : data.parts[0];

      const effectiveDir = /** @type {-1|1} */ (end * part.dir);
      const findFrom = effectiveDir === 1 ? part.high : part.low;

      const details = this.#g.edgeDetails(part.edge);
      const unitInc = (inc / details.length);

      const nodeInDir = this.#g.findNode(part.edge, findFrom, effectiveDir);
      let unitDeltaToNode = Math.abs(findFrom - nodeInDir.at);
      const deltaToNode = unitDeltaToNode * details.length;

      // console.warn('found next node', findFrom, 'node', nodeInDir, 'delta', deltaToNode);

      // Check if there's already a reservation in the direction we're trying to go.
      const adjacent = this.#adjacentReservation(part, effectiveDir);
      if (adjacent.dist < Math.min(unitDeltaToNode, unitInc)) {
        if (effectiveDir === 1) {
          part.high += adjacent.dist;
        } else {
          part.low -= adjacent.dist;
        }
        inc -= (adjacent.dist * details.length);

        const actualInc = (by - inc);
        data.length += actualInc;
        return inc;
      }

      // This change fits neatly before the next node in this direction.
      if (inc <= deltaToNode) {
        if (effectiveDir === 1) {
          part.high += unitInc;
        } else {
          part.low -= unitInc;
        }
        // console.debug('...exp fits', inc / details.length, 'now', {low: part.low, high: part.high});
        break;
      }

      // Move completely towards this node.
      // TODO: "mark" this node as being occupied (it can be occupied by many?)
      let fromNode = '';
      if (effectiveDir === 1) {
        part.high = nodeInDir.at;
        fromNode = nodeInDir.priorNode;
      } else {
        part.low = nodeInDir.at;
        fromNode = nodeInDir.afterNode;
      }
      inc -= deltaToNode;

      // Catch not having a real node so we know there's no choices.
      const pairsAtNode = nodeInDir.node ? Array.from(this.#g.pairsAtNode(nodeInDir.node)) : [];
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

      // If there's nowhere to go, then bail and report less increment.
      if (choice === undefined) {
        const actualInc = (by - inc);
        data.length += actualInc;
        return actualInc;
      }

      const seg = this.#g.findSegment(choice.via, choice.to);
      const added = {
        snake,
        edge: seg.edge,
        dir: /** @type {1|-1} */ (seg.dir * end),
        low: seg.at,
        high: seg.at,
      };
      this.#reserve(added);

      if (end === 1) {
        data.parts.push(added);
      } else {
        data.parts.unshift(added);
      }
    }

    data.length += by;
    return by;
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