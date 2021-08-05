import test from 'ava';
import { HeightMap } from "../src/helper/heights.js";


test('heightmap', t => {
  const h = new HeightMap(100);
  h.add(false, 10, 10, 'x');

  t.throws(() => {
    h.add(false, 0, 110, 'x');
  }, null, 'out of range');

  t.deepEqual(h.query(false, 10, 10), ['x']);
  t.deepEqual(h.query(false, 90, 10), ['x']);
  t.deepEqual(h.query(false, 95, 5), []);

  h.add(false, 90, 0, 'x');
  t.deepEqual(h.query(false, 95, 5), ['x']);
  t.deepEqual(h.query(false, 90, 10), ['x', 'x']);

  h.add(true, 10, 90, 'x');  // inverted add
  t.deepEqual(h.query(false, 90, 10), ['x', 'x', 'x']);

  t.true(h.remove(false, 90, 10, 'x'));  // remove inverted add
  t.true(h.remove(false, 10, 10, 'x'));
  t.deepEqual(h.query(false, 90, 10), ['x']);
});