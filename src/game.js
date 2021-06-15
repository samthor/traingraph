
import { Graph } from './graph.js';
import * as helperMath from './helper/math.js';
import { SnakeMan } from './snakeman.js';
import * as types from './types.js';


/** @type {types.LineSearch} */
export const zeroLineSearch = {line: null, nodeId: '', offset: NaN, x: 0, y: 0, dist: Infinity};


const maxAngle = Math.PI / 3;


export class TrainGame extends EventTarget {
  #g = new Graph();
  #trains = new SnakeMan(this.#g);

  get graph() {
    return this.#g;
  }

  get nodes() {
    return this.#g.allNodes();
  }

  get trains() {
    return this.#trains.allSnakes();
  }

  /**
   * @param {string} node
   */
  pairsAtNode(node) {
    return this.#g.pairsAtNode(node);
  }

  /**
   * @param {string} node
   */
  nodePos(node) {
    const any = this.#g.nodePos(node);

    const line = this.#lines.get(any.edge);
    if (!line) {
      throw new Error(`bad line`);
    }

    return helperMath.lerp(line.low, line.high, any.at);
  }

  /** @type {Map<string, types.Line>} */
  #lines = new Map();

  /**
   * @param {string} line
   */
  lookupLine(line) {
    const data = this.#lines.get(line);
    if (data === undefined) {
      throw new Error(`unknown line: ${line}`);
    }
    return data;
  }

  /**
   * @param {types.LineSearch} low
   * @param {types.LineSearch} high
   */
  add(low, high) {
    const length = Math.hypot(low.x - high.x, low.y - high.y);
    const {edge, lowNode, highNode} = this.#g.add(length);

    const line = {
      low: {x: low.x, y: low.y},
      high: {x: high.x, y: high.y},
      length,
      id: edge,
    };
    this.#lines.set(edge, line);

    // We have to work out if each end/both sides were actually a touch on a real node and merge.
    const nodes = [low, high].map((end) => {
      const nodeId = (end === low ? lowNode : highNode);
      if (end.line === null) {
        return nodeId;  // nothing to merge, this is _our_ node
      }

      let otherNodeId = end.nodeId;

      // We have to split the other line, because the search wasn't pointing at an actual node.
      if (otherNodeId === '') {
        const split = this.#g.splitEdge(end.line.id, end.offset);
        otherNodeId = split.node;
      }

      // Merge this end with the split. Return the winning node.
      return this.#g.mergeNode(nodeId, otherNodeId);
    });

    // Now we have to add pairs as needed. This is a three-point problem.
    [low, high].forEach((end, index) => {
      const otherEnd = end === low ? high : low;
      const midNode = nodes[index];
      const otherNode = nodes[index ? 0 : 1];

      // we have 2/3 nodes, need (many) 3rd: where it can link up to

      const results = this.dirsFor(otherEnd, end);
      results.forEach(({node}) => {
        this.#g.join(otherNode, midNode, node);
      });
    });

    this.dispatchEvent(new CustomEvent('update'));
  }

  /**
   * @param {types.Point} point
   * @param {number} range
   * @return {types.LineSearch}
   */
  nearest(point, range = 0.2) {
    let bestDistance = range;
    let bestLineOffset = 0.0;
    let bestNodeId = '';

    /** @type {types.Line | undefined} */
    let bestLine = undefined;

    for (const line of this.#lines.values()) {
      const opposite = helperMath.distance(point, line.low, line.high);
      if (opposite >= bestDistance) {
        continue;
      }
      let bufferReal = range - opposite;

      const lineMid = helperMath.lerp(line.low, line.high, 0.5);
      const hypot = helperMath.hypotDist(lineMid, point);

      const adjacent = Math.sqrt(Math.pow(hypot, 2) - Math.pow(opposite, 2));
      let adjust = (adjacent / line.length); // (0-0.5)

      // out of range anyway (adjust for range to line units?)
      if (adjust > (0.5 + (range / line.length))) {
        continue;
      }

      // This is kinda gross but work out which point is closer.
      const distLow = helperMath.hypotDist(line.low, point);
      const distHigh = helperMath.hypotDist(line.high, point);

      if (adjust > 0.5) {
        // check we're in a circle around end, not a square box
        const closest = distLow < distHigh ? line.low : line.high;
        const actualDist = helperMath.hypotDist(closest, point);
        if (actualDist >= bestDistance) {
          continue;
        }
        bufferReal = range - actualDist;
        adjust = 0.5;
      }

      let alongLine = adjust;
      if (distLow < distHigh) {
        alongLine = 0.5 - alongLine;
      } else {
        alongLine += 0.5;
      }

      bestDistance = opposite;
      bestLineOffset = alongLine;
      bestLine = line;
      bestNodeId = '';

      const buffer = bufferReal / line.length;
      const found = this.#g.findNode(line.id, alongLine);

      if (Math.abs(alongLine - found.at) < buffer) {
        bestLineOffset = found.at;
        bestNodeId = found.node;
      }
//      console.warn('got best', bestLineOffset, 'found', buffer, found);
    }

    if (bestLine !== undefined) {
      const l = /** @type {types.Line} */ (bestLine);
      const {x, y} = helperMath.lerp(l.low, l.high, bestLineOffset);

      return {line: l, nodeId: bestNodeId, offset: bestLineOffset, x, y, dist: bestDistance};
    }
    return {line: null, nodeId: '', offset: NaN, x: point.x, y: point.y, dist: 0};
  }

  /**
   * @param {types.Point} fromPoint
   * @param {types.LineSearch} find
   */
  dirsFor(fromPoint, find) {
    const {line} = find;
    if (!line) {
      return [];  // no joins, brand new line
    }

    const angle = Math.atan2(fromPoint.y - find.y, fromPoint.x - find.x);

    /** @type {{line: string, angle: number, node: string}[]} */
    const out = [];

    // other lines are either: all lines at node, or a single line we're _about_ to join

    /** @type {{edge: string, priorNode: string, afterNode: string}[]} */
    let allLines;
    if (find.nodeId) {
      allLines = this.#g.linesAtNode(find.nodeId);
    } else {
      const around = this.#g.nodeAround(line.id, find.offset);
      allLines = [around];
    }

    for (const raw of allLines) {
      const {edge: lineId} = raw;

      const line = this.#lines.get(lineId);
      if (!line) {
        throw new Error(`missing line: ${lineId}`);
      }

      // one or zero (the line), zero if threshold too low
      const lineAngle = helperMath.angle(line.high, line.low);
      const delta = helperMath.smallestAngle(angle, lineAngle);
      // console.warn('delta angle', delta, 'vs', maxAngle, 'and', Math.PI - maxAngle);

      if (delta < maxAngle && raw.priorNode) {
        // going towards low?
        out.push({line: lineId, angle: lineAngle + Math.PI, node: raw.priorNode});
      }

      if (delta > Math.PI - maxAngle && raw.afterNode) {
        // going towards high
        out.push({line: lineId, angle: lineAngle, node: raw.afterNode});
      }
    }

    return out;
  }

  /**
   * @return {Iterable<types.Line>}
   */
  get lines() {
    return [...this.#lines.values()];
  }

  /**
   * @param {types.LineSearch} at
   */
  addTrain(at) {
    if (!at.line) {
      throw new Error(`must be added on line`);
    }

    const train = this.#trains.addSnake(at.line.id, at.offset, 1);
    if (!train) {
      console.warn('couldn\'t reserve solo:', at.offset);
      return false;  // could not reserve this part
    }

    if (this.#trains.expand(train, 1, 0.1) !== 0.1) {
      console.warn('couldn\'t expand:', at.offset);
      this.#trains.removeSnake(train);
      return false;
    }

    this.dispatchEvent(new CustomEvent('update-train'));

    let dir = /** @type {-1|1} */ (-1);
    const amt = 0.005;

    const run = () => {
      const moved = this.#trains.move(train, dir, amt);
      if (moved !== amt) {
        // move back by amount we didn't move off end (yes this could happen forever but just do once)
        dir = /** @type {-1|1} */ (-dir);
        this.#trains.move(train, dir, amt - moved);
      }

      window.requestAnimationFrame(run);
      this.dispatchEvent(new CustomEvent('update-train'));
    };
    run();

    return true;
  }

}