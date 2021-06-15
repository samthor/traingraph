
import { nextGlobalId } from './helper/id';
import * as types from './types';


// TODO:
// - subscribe to node changes, if a node is added under a reservation it must be split


/**
 * @typedef {{
 *   snake: string,
 *   edge: string,
 *   dir: -1|1,
 *   low: number,
 *   lowNode: string,
 *   high: number,
 *   highNode: string,
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


/**
 * @typedef {{
 *   from: string,
 *   via: string,
 *   to: string,
 * }}
 * @type {never}
 */
export var Choice;


export class SnakeMan {
  #g;
  #choose;

  /** @type {Map<string, SnakePart[]>} */
  #reservedEdge = new Map();

  // TODO: nodes currently being touched or intersected by snakes
  /** @type {Map<string, Set<SnakePart>>} */
  #reservedNode = new Map();

  /** @type {Map<string, Snake>} */
  #bySnake = new Map();

  /**
   * @param {types.GraphType} graph
   * @param {(snake: string, choices: Choice[]) => number} choose
   */
  constructor(graph, choose) {
    this.#g = graph;
    this.#choose = choose;
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

    // nb. for now, adding a snake doesn't implicitly touch any related nodes.
    // It just _happens_ to be at the same position next to it.

    const id = nextGlobalId('S');
    const startPart = {
      snake: id,
      edge,
      dir,
      low: at,
      lowNode: '',
      high: at,
      highNode: '',
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
    data.parts.forEach((part) => {
      this.#unreserve(part);
      this.#unreserveNode(part, part.lowNode);
      this.#unreserveNode(part, part.highNode);
    });

    this.#bySnake.delete(snake);
  }

  /**
   * @param {string} snake
   */
  pointsForSnake(snake) {
    const data = this.#dataForSnake(snake);
    const {parts: p} = data;

    /** @type {{edge: string, at: number}[]} */
    const points = [];

    // Find the longest part along a single edge.
    let currentEdge = '';
    for (let i = 0; i <= p.length; ++i) {
      if (p[i] && p[i].edge === currentEdge) {
        continue;
      }

      if (i === 0) {
        // use low
        const curr = p[0];
        const at = curr.dir === 1 ? curr.low : curr.high;
        points.push({edge: curr.edge, at});
      } else {
        // use high from i-1
        const last = p[i - 1];
        const at = last.dir === 1 ? last.high : last.low;
        points.push({edge: last.edge, at});
      }

      currentEdge = p[i]?.edge ?? '';
    }

    return points;
  }

  /**
   * @param {SnakePart} part
   * @param {string} node
   */
  #reserveNode = (part, node) => {
    if (!node) {
      return false;
    }
    if (!(part.highNode === node || part.lowNode === node)) {
      throw new Error(`can't reserve node not on part: ${node}`);
    }

    const existing = this.#reservedNode.get(node);
    if (existing === undefined) {
      this.#reservedNode.set(node, new Set([part]));
    } else {
      existing.add(part);
    }
  };

  /**
   * Unreserves this node for the given part. This clears the `highNode` or `lowNode` of the passed
   * part.
   *
   * @param {SnakePart} part
   * @param {string} node
   */
  #unreserveNode = (part, node) => {
    if (node === '') {
      return;
    } else if (node === part.highNode) {
      part.highNode = '';
    } else if (node === part.lowNode) {
      part.lowNode = '';
    } else {
      throw new Error(`can't unreserve node NOT ON part`);
    }

    const data = this.#reservedNode.get(node);
    if (data === undefined || !data.has(part)) {
      throw new Error(`can't unreserve nonexistent node: ${node}`);
    }
    data.delete(part);
    if (data.size === 0) {
      this.#reservedNode.delete(node);
    }
  };

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
    const data = this.#dataForSnake(snake);
    const intendedLength = data.length;

    const expandBy = this.expand(snake, end, by);
    const shrinkBy = intendedLength - data.length;

    if (intendedLength !== 0.1) {
      console.debug('expand', expandBy, 'shrink?', shrinkBy, 'intended', intendedLength);
    }

    this.expand(snake, /** @type {1|-1} */ (-end), shrinkBy);
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
          this.#unreserveNode(part, part.highNode);
        } else {
          part.low += dec / details.length;
          this.#unreserveNode(part, part.lowNode);
        }
        break;
      }

      // Don't allow the last element to be spliced out, the snake must always have length zero.
      if (data.parts.length === 1) {
        throw 1;  // TODO: does this ever fire? the `>=` above might catch it?
        if (effectiveDir === 1) {
          // high was front, move back to low
          part.high = part.low;
        } else {
          // low was front, move back to high
          part.low = part.high;
        }
        break;
      }

      // Remove the contents of the whole part.
      dec -= partUse;
      this.#unreserve(part);
      this.#unreserveNode(part, part.lowNode);
      this.#unreserveNode(part, part.highNode);
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
      // Pick the correct part end to work on.
      const part = end === 1 ? data.parts[data.parts.length - 1] : data.parts[0];

      // What way are we moving on this part, towards front or back?
      const effectiveDir = /** @type {-1|1} */ (end * part.dir);
      const findFrom = effectiveDir === 1 ? part.high : part.low;

      // We might already be at the possible extent of this part. If so we skip the move step and
      // go straight to choice.
      const alreadyAtNode = (effectiveDir === 1 ? part.highNode : part.lowNode);
      if (!alreadyAtNode) {
        const otherDirNode = effectiveDir === 1 ? part.lowNode : part.highNode;

        const details = this.#g.edgeDetails(part.edge);
        const unitInc = (inc / details.length);

        // We move in the direction of either of the following options:
        //  A: the next adjacent reservation (will stop)
        //  B: the next adjacent node (might stop)

        // Option A: the next adjacent reservation
        const adjacent = this.#adjacentReservation(part, effectiveDir);

        // Option B: the next adjacent node (will always exist)
        /** @type {types.AtNode} */
        let nodeInDir;
        if (otherDirNode) {
          // If one side is already on a node, just find the next one along.
          const details = this.#g.nodeOnEdge(part.edge, otherDirNode);
          const cand = effectiveDir === 1 ? details.afterNode : details.priorNode;
          nodeInDir = this.#g.nodeOnEdge(part.edge, cand);
        } else {
          // We're in the middle of this segment, so we have to search.
          nodeInDir = this.#g.findNode(part.edge, findFrom, effectiveDir);

          // ... special-case "node at same location", which can happen depending on how we were
          // added. Try to move past this node _if possible_ (i.e., not at end of edge).
          if (nodeInDir.at === findFrom) {
            const cand = effectiveDir === 1 ? nodeInDir.afterNode : nodeInDir.priorNode;
            if (cand) {
              nodeInDir = this.#g.nodeOnEdge(part.edge, cand);
            }
          }
        }
        if (!nodeInDir.node) {
          console.warn('got nodeInDir', nodeInDir, {findFrom, effectiveDir});
          throw new Error(`should not be off end of node line`);
        }
        const unitDeltaToNode = Math.abs(findFrom - nodeInDir.at);

        // Is the target actually before both the adjacent/nearby node? If so, this is our actual
        // success case.
        if (unitInc < Math.min(adjacent.dist, unitDeltaToNode)) {
          if (effectiveDir === 1) {
            part.high += unitInc;
          } else {
            part.low -= unitInc;
          }

          // Because floating-point was a bad choice, we return the original "by" value rather than
          // attempting to assemble it later.
          data.length += by;
          return by;
        }

        // The adjacent reservation wins. This will stop the expansion because it's another train
        // or something.
        if (adjacent.other && adjacent.dist < unitDeltaToNode) {
          if (effectiveDir === 1) {
            part.high = adjacent.other.low;
          } else {
            part.low = adjacent.other.high;
          }
          inc -= (adjacent.dist * details.length);
          break;
        }

        // Otherwise, we're going to abutt the next node.
        if (effectiveDir === 1) {
          part.high = nodeInDir.at;
          part.highNode = nodeInDir.node;
          this.#reserveNode(part, part.highNode);
        } else {
          part.low = nodeInDir.at;
          part.lowNode = nodeInDir.node;
          this.#reserveNode(part, part.lowNode);
        }
        inc -= (unitDeltaToNode * details.length);
        continue;  // we get node correctly in next iteration
      }

      // We're at a node and need to make a choice!
      const reservations = this.#reservedNode.get(alreadyAtNode);
      if (reservations === undefined || !reservations.has(part)) {
        throw new Error(`we weren't reserved in node reservations? ${alreadyAtNode}`);
      }
      if (reservations.size > 1) {
        // Can't go past: more than one snake is here.
        break;
      }

      const nodeDetails = this.#g.nodeOnEdge(part.edge, alreadyAtNode);
      const fromNode = part.highNode === alreadyAtNode ? nodeDetails.priorNode : nodeDetails.afterNode;

      // Catch not having a real node so we know there's no choices.
      const pairsAtNode = Array.from(this.#g.pairsAtNode(alreadyAtNode));
      const choices = pairsAtNode.filter(([left, right]) => {
        return left === fromNode || right === fromNode;
      }).map(([left, right]) => {
        /** @type {Choice} */
        return {from: fromNode, via: alreadyAtNode, to: left === fromNode ? right : left};
      });

      let choice = choices[0];
      if (choices.length > 1) {
        const choiceIndex = this.#choose(snake, choices);
        choice = choices[choiceIndex];
      }

      // If there's nowhere to go, then bail.
      if (choice === undefined) {
        break;
      }

      // Create a new segment towards the choice that was just made.
      const seg = this.#g.findSegment(choice.via, choice.to);
      const added = {
        snake,
        edge: seg.edge,
        dir: /** @type {1|-1} */ (seg.dir * end),
        low: seg.at,
        lowNode: '',
        high: seg.at,
        highNode: '',
      };

      if (seg.dir === 1) {
        added.lowNode = choice.via;
        this.#reserveNode(added, added.lowNode);
      } else {
        added.highNode = choice.via;
        this.#reserveNode(added, added.highNode);
      }

      if (end === 1) {
        data.parts.push(added);
      } else {
        data.parts.unshift(added);
      }
      this.#reserve(added);
    }

    const actualInc = (by - inc);
    data.length += actualInc;
    return actualInc;
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