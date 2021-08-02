
import test from 'ava';
import { Graph } from '../src/graph.js';

test('basic merge', t => {
  const g = new Graph();

  const e1 = g.add(100);
  const e2 = g.add(10);

  const split = g.splitEdge(e1.edge, 50);
  const out = g.mergeNode(split.node, e2.lowNode);

  t.is(out, e2.lowNode);

  t.throws(() => {
    g.mergeNode(e2.lowNode, e2.highNode);
  }, null, `can't merge on same edge`);
});


test('cannot join edges twice', t => {

  const g = new Graph();

  const e1 = g.add(100);
  const e2 = g.add(10);

  // merge and fetch again (results are always snapshots)
  const out = g.mergeNode(e1.lowNode, e2.lowNode);
  t.is(out, g.edgeDetails(e2.edge).lowNode);
  t.is(out, g.edgeDetails(e1.edge).lowNode);

  // try to merge highNode, will fail (already connected another way)
  t.throws(() => {
    const out = g.mergeNode(e1.highNode, e2.highNode)
  });
});


test('can create triangle of edges', t => {
  const g = new Graph();

  const e1 = g.add(100);  // E1
  const e2 = g.add(100);  // E4
  const e3 = g.add(100);  // E7

  g.mergeNode(e1.highNode, e2.lowNode);
  g.mergeNode(e2.highNode, e3.lowNode);

  t.notThrows(() => {
    g.mergeNode(e3.highNode, e1.lowNode);
  });
});


test('join', t => {
  const g = new Graph();

  const e1 = g.add(100);  // E1
  const e2 = g.add(20);  // E4

  const midE1 = g.splitEdge(e1.edge, 50);
  const resultingMid = g.mergeNode(midE1.node, e2.lowNode);

  const success = g.join(e2.highNode, resultingMid, e1.lowNode);
  t.true(success, 'node should join');

  // const e1Details = g.edgeDetails(e1.edge);
  // console.info('e1 is', e1Details, 'seg', g.findBetween(e1Details.lowNode, e1Details.highNode));
  // const e2Details = g.edgeDetails(e2.edge);
  // console.info('e2 is', e2Details, 'seg', g.findBetween(e2Details.lowNode, e2Details.highNode));

  t.deepEqual(g.pairsAtNode(resultingMid), [ [ e1.lowNode, e2.highNode ], [ e1.lowNode, e1.highNode ] ]);

});