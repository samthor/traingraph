
import { GraphSimple } from './graph2.js';
import * as helperMath from './helper/math.js';
import { nodeKey } from './helper/swap.js';
// import { SnakeMan } from './snakeman.js';
// import * as snakeman from './snakeman.js';
import * as types from './types.js';


/** @type {types.LineSearch} */
export const zeroLineSearch = {node: '', offset: NaN, x: 0, y: 0, low: '', high: ''};


/** @type {(node: string, choices: string[]) => string} */
const randomGrow = (node, choices) => helperMath.randomChoice(choices) ?? '';


/**
 * Maximum angle a line can be joined at.
 */
const maxAngle = Math.PI / 3;


export class TrainGame extends EventTarget {
  #roundingFactor;
  #trainLength;
  #moveBy;
  #stepEvery;

  /** @type {Map<string, types.Point>} */
  #nodePos = new Map();

  /**
   * @param {{roundingFactor: number, trainLength: number, moveBy: number, stepEvery: number}} opts
   */
  constructor(opts) {
    super();
    this.#roundingFactor = opts.roundingFactor;
    this.#trainLength = opts.trainLength;
    this.#moveBy = opts.moveBy;
    this.#stepEvery = opts.stepEvery;
    window.requestAnimationFrame(this.#trainLoop);
  }

  /** @type {types.SimpleGraphType} */
  #g = new GraphSimple();
  // #trains = new SnakeMan(this.#g, this.#trainNav);

  get graph() {
    return this.#g;
  }

  get nodes() {
    return this.#g.allNodes();
  }

  get trains() {
    return [];
//    return this.#trains.allSnakes();
  }

  trainsPoints() {
    return Array.from(this.#trainData.keys()).map((train) => {
      const data = this.#g.points(train);
      const length = data.node.length;

      const points = data.node.map((node, i) => {
        const pos = this.nodePos(node);

        /** @type {number} */
        let along;

        /** @type {string} */
        let otherNode;

        if (i === 0 && data.headOffset) {
          // Is this the first segment and we're behind the head?
          const line = this.#g.lineFor(data.node[0], data.node[1]);
          if (line === null) {
            throw new Error(`missing train head line`);
          }

          along = data.headOffset / line.length;
          otherNode = data.node[1];
        } else if (i === length - 1 && data.tailOffset) {
          // Is this the last segment and we're behind the tail?
          const line = this.#g.lineFor(data.node[length - 1], data.node[length - 2]);
          if (line === null) {
            throw new Error(`missing train tail line`);
          }

          along = data.tailOffset / line.length;
          otherNode = data.node[length - 2];
        } else {
          return pos;
        }

        const otherPos = this.nodePos(otherNode);
        return helperMath.lerp(pos, otherPos, along);
      });

      return {train, points};
    });
  }

  *allLines() {
    /** @type {Set<string>} */
    const seen = new Set();

    for (const node of this.#g.allNodes()) {
      const connect = this.#g.connectAtNode(node);
      for (const c of connect) {
        let low = node;
        let high = c.other;

        if (high < low) {
          ([high, low] = [low, high]);
        }

        const key = `${low}:${high}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        yield { low, high, length: c.length };
      }
    }
  }

  /**
   * @param {string} node
   */
  pairsAtNode(node) {
    return this.#g.joinsAtNode(node);
  }

  /**
   * @param {string} node
   * @return {types.Point}
   */
  nodePos(node) {
    const p = this.#nodePos.get(node);
    if (p === undefined) {
      throw new Error(`bad node: ${node}`);
    }
    return p;
  }

  /**
   * @param {string} lineId
   * @param {number} at
   */
  linePosLerp(lineId, at) {
    throw 1;
    // const line = this.#lines.get(lineId);
    // if (!line) {
    //   throw new Error(`bad line`);
    // }
    // const floatAt = at / line.length;

    // const lowPos = this.nodePos(line.low);
    // const highPos = this.nodePos(line.high);

    // return helperMath.lerp(lowPos, highPos, floatAt);
  }

  /**
   * @param {string} line
   */
  lookupLine(line) {
    throw 2;
    // const data = this.#lines.get(line);
    // if (data === undefined) {
    //   throw new Error(`unknown line: ${line}`);
    // }
    // return data;
  }

  /**
   * @param {types.LineSearch} low
   * @param {types.LineSearch} high
   */
  add(low, high) {
    /** @type {(part: types.LineSearch) => string} */
    const maybeSplit = (part) => {
      if (part.node) {
        return part.node;
      }

      let createdNode;

      if (isNaN(part.offset)) {
        createdNode = this.#g.addNode();
      } else {
        const line = this.#g.lineFor(part.low, part.high);
        if (line === null) {
          throw new Error(`got bad search: ${part.low}/${part.high}`);
        }
        const { length } = line;
        const at = Math.round(length * part.offset);
        createdNode = this.#g.split(part.low, '', part.high, at);
      }

      this.#nodePos.set(createdNode, {x: part.x, y: part.y});
      return createdNode;
    };

    const lowNode = maybeSplit(low);
    const highNode = maybeSplit(high);

    // Round the length to an actual integer value before adding to graph.
    const length = Math.hypot(low.x - high.x, low.y - high.y);
    const roundedLength = Math.floor(length * this.#roundingFactor);
    this.#g.connect(lowNode, highNode, roundedLength);

    // Now we have to add pairs as needed. This is a three-point problem.
    const arg = [{node: lowNode, search: low}, {node: highNode, search: high}];
    arg.forEach(({node, search}) => {
      const otherNode = (node === lowNode ? highNode : lowNode);
      const otherPoint = otherNode === lowNode ? low : high;

      const dirs = this.dirsFor(otherPoint, search);

      dirs.forEach(({ node: farNode }) => {
        const done = this.#g.join(otherNode, node, farNode);
        console.warn('adding', otherNode, node, farNode, done);
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
    let bestOffset = 0.0;
    let bestNodeId = '';
    let bestPoint = point;

    /** @type {{low: string, high: string}=} */
    let bestLine = undefined;

    for (const line of this.allLines()) {
      const lowPos = this.nodePos(line.low);
      const highPos = this.nodePos(line.high);

      const opposite = helperMath.distance(point, lowPos, highPos);
      if (opposite >= bestDistance) {
        continue;
      }
      let bufferReal = range - opposite;
      const floatLength = helperMath.hypotDist(lowPos, highPos);

      const lineMid = helperMath.lerp(lowPos, highPos, 0.5);
      const hypot = helperMath.hypotDist(lineMid, point);

      const adjacent = Math.sqrt(Math.pow(hypot, 2) - Math.pow(opposite, 2));
      let adjust = (adjacent / floatLength); // (0-0.5)

      // out of range anyway (adjust for range to line units?)
      if (adjust > (0.5 + (range / floatLength))) {
        continue;
      }

      // This is kinda gross but work out which point is closer.
      const distLow = helperMath.hypotDist(lowPos, point);
      const distHigh = helperMath.hypotDist(highPos, point);

      if (adjust > 0.5) {
        // check we're in a circle around end, not a square box
        const closest = distLow < distHigh ? lowPos : highPos;
        const actualDist = helperMath.hypotDist(closest, point);
        if (actualDist >= bestDistance) {
          continue;
        }
        bufferReal = range - actualDist;
        adjust = 0.5;
      }

      // This is the best so far.
      bestDistance = opposite;

      let alongLine = adjust;
      if (distLow < distHigh) {
        alongLine = 0.5 - alongLine;
      } else {
        alongLine += 0.5;
      }

      const targetAlongLine = (alongLine < 0.5 ? 0.0 : 1.0);

      // Maybe clamp to one of the sides.
      if (Math.abs(targetAlongLine - alongLine) < range) {
        bestNodeId = (targetAlongLine ? line.high : line.low);
        bestOffset = targetAlongLine;
        bestLine = undefined;
        bestPoint = (targetAlongLine ? highPos : lowPos);
        continue;
      }

      bestNodeId = '';
      bestOffset = alongLine;
      bestLine = line;
      bestPoint = helperMath.lerp(lowPos, highPos, alongLine);
    }

    if (bestLine) {
      // This is on a line.
      return {
        attached: true,
        ...bestPoint,
        node: '',
        low: bestLine.low,
        high: bestLine.high,
        offset: bestOffset,
      };
    } else {
      // This is a random point, either in free space or at a node.
      return {
        attached: Boolean(bestNodeId),
        ...bestPoint,
        node: bestNodeId,
        low: '',
        high: '',
        offset: NaN,
      };
    };
  }

  /**
   * @param {types.Point} fromPoint
   * @param {types.LineSearch} find
   */
  dirsFor(fromPoint, find) {
    if (!find.attached) {
      return [];  // no joins, brand new line
    }

    const angle = Math.atan2(fromPoint.y - find.y, fromPoint.x - find.x);

    /** @type {{node: string, angle: number}[]} */
    const out = [];

    /** @type {Iterable<string>} */
    let possibleNodes;
    if (find.node) {
      possibleNodes = [...this.#g.connectAtNode(find.node)].map(({other}) => other);
    } else {
      possibleNodes = [find.low, find.high];
    }

    for (const cand of possibleNodes) {
      const otherPoint = this.nodePos(cand);

      // This is the angle on the target line. It's "correct" and we need to decide if it's allowed.
      const lineAngle = helperMath.angle(otherPoint, find);

      // Is the delta smaller than maxAngle?
      const delta = helperMath.smallestAngle(angle, lineAngle);
      if (delta > Math.PI - maxAngle) {
        out.push({ node: cand, angle: lineAngle });
      }
    }

    return out;
  }

  /**
   * @param {types.LineSearch} at
   */
  addTrain(at) {
    if (!at.attached) {
      throw new Error(`can't add unattached train`);
    }

    const addNode = at.node || at.low;
    const train = this.#g.addReserve(addNode);

    // We're trying to add a train in the middle of a segment, move into place.
    if (!at.node) {
      const line = this.#g.lineFor(at.low, at.high);
      if (line === null) {
        throw new Error(`missing line`);
      }

      // nb. only expands towards high (probably fine)
      const offset = Math.round(at.offset * line.length);
      const moved = this.#g.grow(train, 1, offset, () => at.high);
      if (moved !== offset) {
        throw new Error(`could not move train to position`);
      }
      this.#g.shrink(train, -1, offset);
    }

    const expectedLength = this.#trainLength;
    const expanded = this.#g.grow(train, 1, expectedLength, randomGrow);
    if (expanded !== expectedLength) {
      console.warn('couldn\'t expand:', expectedLength, 'only got', expanded);
      // TODO: remove
      // this.#trains.removeSnake(train);
      return false;
    }

    console.warn('added train', train);

    this.#trainData.set(train, {dir: -1});
    return true;
  }

  /** @type {Map<string, {dir: -1|1}>} */
  #trainData = new Map();

  #lastTrainLoop = 0;
  #loopIndex = 0;

  #trainLoop = (now = 0) => {
    // window.requestAnimationFrame(this.#trainLoop);

    const skip = (this.#lastTrainLoop === 0.0);
    const since = now - this.#lastTrainLoop;
    this.#lastTrainLoop = now;
    if (skip) {
      window.requestAnimationFrame(this.#trainLoop);
      return;
    }

    ++this.#loopIndex;
    if (this.#loopIndex !== this.#stepEvery) {
      window.requestAnimationFrame(this.#trainLoop);
      return;
    }
    this.#loopIndex = 0;

    const amt = this.#moveBy;
    this.#trainData.forEach((data, train) => {

      const growBy = this.#g.grow(train, data.dir, amt, randomGrow);

      const other = this.#g.query(train);
      if (other.length) {
        console.warn('booped another train')
        this.#g.shrink(train, data.dir, amt);

        data.dir = /** @type {-1|1} */ (-data.dir);
        return;
      }

      this.#g.shrink(train, /** @type {-1|1} */ (-data.dir), growBy);

      // TODO: this doesn't "bounce", just stops
      if (growBy !== amt) {
        data.dir = /** @type {-1|1} */ (-data.dir);
      }

      // const moved = this.#trains.move(train, data.dir, amt);
      // if (moved !== amt) {
      //   // move back by amount we didn't move off end (yes this could happen forever but just do once)
      //   data.dir = /** @type {-1|1} */ (-data.dir);
      //   this.#trains.move(train, data.dir, amt - moved);
      // }
    });

    if (this.#trainData.size) {
      this.dispatchEvent(new CustomEvent('update-train'));
    }

    window.requestAnimationFrame(this.#trainLoop);
  };

}