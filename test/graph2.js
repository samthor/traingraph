import { GraphSimple } from "../src/graph2.js";
import test from 'ava';


test('connect & join', t => {
  const g = new GraphSimple();

  g.addNode('a');
  g.addNode('b');
  g.addNode('c');

  const dataB = g._getByNode('b');
  t.deepEqual(dataB.conn, {});

  g.connect('a', 'b', 1);
  g.connect('b', 'c', 10);

  // connected but not yet joined
  t.deepEqual(dataB.conn, {
    'a': {
      edge: { length: 1, res: [] },
      through: new Set(),
    },
    'c': {
      edge: { length: 10, res: [] },
      through: new Set(),
    },
  });

  g.join('c', 'b', 'a');

  // joined
  t.deepEqual(dataB.conn, {
    'a': {
      edge: { length: 1, res: [] },
      through: new Set(['c']),
    },
    'c': {
      edge: { length: 10, res: [] },
      through: new Set(['a']),
    },
  });
  
});


test('split', t => {
  const g = new GraphSimple();

  g.addNode('a');
  g.addNode('b');

  g.connect('a', 'b', 100);

  // confirm "A" node is correct
  // a --100-- b
  const dataA = g._getByNode('a');
  t.deepEqual(dataA.conn, {
    'b': {
      edge: { length: 100, res: [] },
      through: new Set(),
    },
  });

  // split and check
  // a --40-- via --60-- b

  g.addNode('via');
  g.split('a', 'via', 'b', 40);

  const dataVia = g._getByNode('via');
  t.deepEqual(dataVia.conn, {
    'a': {
      edge: { length: 40, res: [] },
      through: new Set(['b']),
    },
    'b': {
      edge: { length: 60, res: [] },
      through: new Set(['a']),
    },
  });
  t.deepEqual(dataA.conn, {
    'via': {
      edge: { length: 40, res: []},
      through: new Set(),  // "via" can't go anywhere through us
    },
  });

  // split AGAIN and check (through stuff)
  // a --40-- via --25-- via2 --35-- b

  g.addNode('via2');
  g.split('via', 'via2', 'b', 25);
  t.deepEqual(dataVia.conn, {
    'a': {
      edge: { length: 40, res: [] },
      through: new Set(['via2']),  // "a" can get to "via2" through us
    },
    'via2': {
      edge: { length: 25, res: [] },
      through: new Set(['a']),  // "via2" can get to "a" through us
    },
  });

});


test('reserve', t => {
  const g = new GraphSimple();

  g.addNode('a');
  g.addNode('b');
  g.connect('a', 'b', 100);
  const dataA = g._getByNode('a');
  const dataB = g._getByNode('b');

  g.addReserve('a', 'x');
  const dataX = g._getByReserve('x');
  t.deepEqual(dataX, {
    length: 0,
    node: ['a'],
    headOffset: 0,
    tailOffset: 0,
  });
  t.deepEqual(dataA.reserve, new Set(['x']));
  t.deepEqual(dataB.reserve, new Set());

  let by = 0;
  by = g.grow('x', 1, 10);
  t.is(by, 10, 'should grow unambig 10 units');
  t.deepEqual(dataX, {
    length: 10,
    node: ['b', 'a'],
    headOffset: 90,
    tailOffset: 0,
  });
  t.deepEqual(dataA.reserve, new Set(['x']));
  t.deepEqual(dataB.reserve, new Set());

  by = g.grow('x', 1, 90);
  t.is(by, 90, 'should grow unambig 90 units');
  t.deepEqual(dataX, {
    length: 100,
    node: ['b', 'a'],
    headOffset: 0,
    tailOffset: 0,
  });
  t.deepEqual(dataA.reserve, new Set(['x']));
  t.deepEqual(dataB.reserve, new Set(['x']));

  by = g.shrink('x', -1, 80);
  t.is(by, 80, 'should shrink 80 units');
  t.deepEqual(dataX, {
    length: 20,
    node: ['b', 'a'],
    headOffset: 0,
    tailOffset: 80,
  });
  t.deepEqual(dataA.reserve, new Set());
  t.deepEqual(dataB.reserve, new Set(['x']));

  by = g.shrink('x', 1, 25);
  t.is(by, 20, 'should shrink 20 units (req 25)');
  t.deepEqual(dataX, {
    length: 0,
    node: ['b', 'a'],
    headOffset: 20,
    tailOffset: 80,
  });
  t.deepEqual(dataA.reserve, new Set());
  t.deepEqual(dataB.reserve, new Set());

});