
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

    if (by === 0) {
      return;
    } else if (by < 0) {
      // Decrement by this much. Step through as many nodes as required.
      let dec = -by;
      while (data.length && dec > 0) {
        const index = end === 1 ? 0 : data.parts.length - 1;
        const part = data.parts[index];

        const partUse = (part.high - part.low);

        // The change fits in this node; modify it and we're done.
        if (partUse < dec) {
          if (part.dir === 1) {
            part.high -= dec;
          } else {
            part.low += dec;
          }
          break;
        }

        // Don't allow the last element to be spliced out, the snake must always have length zero.
        if (data.parts.length === 1) {
          if (part.dir === 1) {
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

      return;
    }

    if (end === -1) {
      throw new Error(`TODO`)
    }

    let inc = by;
    while (inc > 0) {

      const last = data.parts[data.parts.length - 1];

      const findFrom = last.dir === 1 ? last.high : last.low;

      const nodeInDir = this.#g.findNode(last.edge, findFrom, last.dir);
      const deltaToNode = Math.abs(findFrom - nodeInDir.at);

      // This change fits neatly before the next node in this direction.
      if (inc <= deltaToNode) {
        if (last.dir === 1) {
          last.high += inc;
        } else {
          last.low -= inc;
        }
        break;
      }

      // Move completely towards this node.
      // TODO: "mark" this node as being occupied
      let fromNode = '';
      if (last.dir === 1) {
        inc -= (nodeInDir.at - last.high);
        last.high = nodeInDir.at;
        fromNode = nodeInDir.priorNode;
      } else {
        inc -= (last.low - nodeInDir.at);
        last.low = nodeInDir.at;
        fromNode = nodeInDir.afterNode;
      }

      const pairsAtNode = Array.from(this.#g.pairsAtNode(nodeInDir.node));

      // If there's nowhere to go, extend awkwardly off the end of this edge.
      if (!pairsAtNode.length) {
        if (last.dir === 1) {
          last.high += inc;
        } else {
          last.low -= inc;
        }
        break;
      }

      const choices = pairsAtNode.map(([left, right]) => {
        return {from: fromNode, via: nodeInDir.node, to: left === fromNode ? right : left};
      });
      console.warn('choices are now', choices);

      const choiceIndex = ~~(Math.random() * choices.length);
      const choice = choices[choiceIndex];

      const seg = this.#g.findSegment(choice.via, choice.to);

      data.parts.push({
        edge: seg.edge,
        dir: seg.dir,
        low: seg.at,
        high: seg.at,
      });
    }

    // TODO
  }

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