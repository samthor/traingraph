
import { Graph } from './graph.js';
import * as types from './types.js';


/** @type {types.LineSearch} */
export const zeroLineSearch = {line: null, nodeId: '', offset: NaN, x: 0, y: 0, dist: Infinity};


const maxAngle = Math.PI / 3;


/**
 * @param {types.Point} low
 * @param {types.Point} high
 * @param {number} ratio
 */
function lerp(low, high, ratio) {
  const x = low.x + (high.x - low.x) * ratio;
  const y = low.y + (high.y - low.y) * ratio;
  return {x, y};
}


/**
 * @param {types.Point} a
 * @param {types.Point} via
 * @param {types.Point} b
 */
export function angleInCurve(a, via, b) {
  const angle = Math.atan2(via.y - a.y, via.x - a.x);
  const lineAngle = Math.atan2(via.y - b.y, via.x - b.x);
  return Math.min((Math.PI * 2) - Math.abs(angle - lineAngle), Math.abs(lineAngle - angle));
}


/**
 * @param {types.Point} low
 * @param {types.Point} high
 * @param {number} unit
 */
export function along(low, high, unit) {
  const dist = hypotDist(low, high);
  console.warn('along is', unit / dist);
  return lerp(low, high, unit / dist);
}


/**
 * @param {types.Point} low
 * @param {types.Point} high
 */
function hypotDist(low, high) {
  return Math.hypot(low.x - high.x, low.y - high.y);
}


/**
 * @param {types.Point} low
 * @param {types.Point} high
 * @param {types.Point} point
 */
function distance(point, low, high) {
  const top = Math.abs((high.x - low.x) * (low.y - point.y) - (low.x - point.x) * (high.y - low.y));
  const bot = Math.hypot(high.x - low.x, high.y - low.y);
  return top / bot;
}


export class TrainGame extends EventTarget {
  #g = new Graph();

  get graph() {
    return this.#g;
  }

  get nodes() {
    return this.#g.allNodes();
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
    // TODO: we only need the 1st one
    const [any] = this.#g.linesAtNode(node);

    const line = this.#lines.get(any.edge);
    if (!line) {
      throw new Error(`bad line`);
    }

    return lerp(line.low, line.high, any.at);
  }

  /** @type {Map<string, types.Line>} */
  #lines = new Map();

  /**
   * @param {types.LineSearch} low
   * @param {types.LineSearch} high
   */
  add(low, high) {
    const length = Math.hypot(low.x - high.x, low.y - high.y);
    const id = this.#g.add(length);

    const line = {
      low: {x: low.x, y: low.y},
      high: {x: high.x, y: high.y},
      length,
      id,
    };
    this.#lines.set(id, line);

    // We have to work out if each end/both sides were actually a touch on a real node and merge.
    const nodes = [low, high].map((end, index) => {
      if (index !== 0 && index !== 1) {
        throw new Error(`bad index`);
      }
      const nodeId = this.#g.endNode(id, index);
      if (end.line === null) {
        return nodeId;  // nothing to merge, this is _our_ node
      }

      let otherNodeId = end.nodeId;

      // We have to split the other line, because the search wasn't pointing at an actual node.
      if (otherNodeId === '') {
        const split = this.#g.split(end.line.id, end.offset, true);
        otherNodeId = split.id;
      }

      // Merge this end with the split.
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
      const opposite = distance(point, line.low, line.high);
      if (opposite >= bestDistance) {
        continue;
      }
      let bufferReal = range - opposite;

      const lineMid = lerp(line.low, line.high, 0.5);
      const hypot = hypotDist(lineMid, point);

      const adjacent = Math.sqrt(Math.pow(hypot, 2) - Math.pow(opposite, 2));
      let adjust = (adjacent / line.length); // (0-0.5)

      // out of range anyway (adjust for range to line units?)
      if (adjust > (0.5 + (range / line.length))) {
        continue;
      }

      // This is kinda gross but work out which point is closer.
      const distLow = hypotDist(line.low, point);
      const distHigh = hypotDist(line.high, point);

      if (adjust > 0.5) {
        // check we're in a circle around end, not a square box
        const closest = distLow < distHigh ? line.low : line.high;
        const actualDist = hypotDist(closest, point);
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
      const found = this.#g.find(line.id, alongLine, buffer);

      if (found !== null) {
        bestLineOffset = found.at;
        bestNodeId = found.id;
      }
//      console.warn('got best', bestLineOffset, 'found', buffer, found);
    }

    if (bestLine !== undefined) {
      const l = /** @type {types.Line} */ (bestLine);
      const {x, y} = lerp(l.low, l.high, bestLineOffset);

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

    /** @type {types.AtNode[]} */
    let allLines;
    if (find.nodeId) {
      allLines = this.#g.linesAtNode(find.nodeId);
    } else {
      const around = this.#g.nodeAround(line.id, find.offset);
      allLines = [
        {
          edge: line.id,
          at: find.offset,
          ...around,
        },
      ];
    }

    for (const raw of allLines) {
      const {edge: lineId, at} = raw;

      const line = this.#lines.get(lineId);
      if (!line) {
        throw new Error(`missing line: ${lineId}`);
      }

      // one or zero (the line), zero if threshold too low
      const lineAngle = Math.atan2(line.high.y - line.low.y, line.high.x - line.low.x);

      const delta = Math.min((Math.PI * 2) - Math.abs(angle - lineAngle), Math.abs(lineAngle - angle));
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

}