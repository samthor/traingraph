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
      edge: { length: 1 },
      through: [],
    },
    'c': {
      edge: { length: 10 },
      through: [],
    },
  });

  g.join('c', 'b', 'a');

  // joined
  t.deepEqual(dataB.conn, {
    'a': {
      edge: { length: 1 },
      through: ['c'],
    },
    'c': {
      edge: { length: 10 },
      through: ['a'],
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
  t.is(dataA.id, 'a');
  t.deepEqual(dataA.conn, {
    'b': {
      edge: { length: 100 },
      through: [],
    },
  });

  // split and check
  // a --40-- via --60-- b

  g.addNode('via');
  g.split('a', 'via', 'b', 40);

  const dataVia = g._getByNode('via');
  t.deepEqual(dataVia, {
    id: 'via',
    conn: {
      'a': {
        edge: { length: 40 },
        through: ['b'],
      },
      'b': {
        edge: { length: 60 },
        through: ['a'],
      },
    },
  });
  t.deepEqual(dataA.conn, {
    'via': {
      edge: { length: 40 },
      through: [],  // "via" can't go anywhere through us
    },
  });

  // split AGAIN and check (through stuff)
  // a --40-- via --25-- via2 --35-- b

  g.addNode('via2');
  g.split('via', 'via2', 'b', 25);
  t.deepEqual(dataVia.conn, {
    'a': {
      edge: { length: 40 },
      through: ['via2'],  // "a" can get to "via2" through us
    },
    'via2': {
      edge: { length: 25 },
      through: ['a'],  // "via2" can get to "a" through us
    },
  });

});
