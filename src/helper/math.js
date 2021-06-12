
import * as types from '../types.js';


/**
 * @param {types.Point} low
 * @param {types.Point} high
 * @param {number} ratio
 */
export function lerp(low, high, ratio) {
  const x = low.x + (high.x - low.x) * ratio;
  const y = low.y + (high.y - low.y) * ratio;
  return {x, y};
}


/**
 * Moves from low->high along a fraction of the distance.
 *
 * @param {types.Point} low
 * @param {types.Point} high
 * @param {number} unit
 */
export function along(low, high, unit) {
  const dist = hypotDist(low, high);
  return lerp(low, high, unit / dist);
}


/**
 * @param {types.Point} low
 * @param {types.Point} high
 */
export function hypotDist(low, high) {
  return Math.hypot(low.x - high.x, low.y - high.y);
}


/**
 * @param {types.Point} low
 * @param {types.Point} high
 * @param {types.Point} point
 */
export function distance(point, low, high) {
  const top = Math.abs((high.x - low.x) * (low.y - point.y) - (low.x - point.x) * (high.y - low.y));
  const bot = Math.hypot(high.x - low.x, high.y - low.y);
  return top / bot;
}


/**
 * @param {types.Point} a
 * @param {types.Point} b
 * @return {number}
 */
export function angle(a, b) {
  return Math.atan2(a.y - b.y, a.x - b.x);
}


/**
 * @param {number} a
 * @param {number} b
 * @return {number}
 */
export function smallestAngle(a, b) {
  return Math.min((Math.PI * 2) - Math.abs(a - b), Math.abs(a - b));
}
