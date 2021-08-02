Work in progress train graph + game demo on top.

# Play

Fetch, run `npm install`, and run with `dhost` or something that will rewrite your ESM imports:

```js
dhost -m
```

Focus and tap "a" to add a line.
Use your mouse and click to finish the line (potentially joining to other lines).

Tap "s" to add a train (it's basically a snake).
Trains just bounce around forever.

Tap "p" to start pathfinding when focused on a line.
This is just a demo and nothing uses this yet.

## Configure

Some constants are in "src/shared.js", around units and so on.

# Design

The `Game` class uses `GraphType` for its graph code, as well as `SnakeMan` to manage trains.
Trains are basically snakes, and move by growing on one side and shrinking on another.

## Graph

This is based on a generic `GraphType` interface (and `Graph` implementation in "src/graph.js") which contains edges and nodes.

* Each edge has at least two nodes (end nodes) and can be split by adding further nodes.

* These edges don't exist in physical space, and can be joined in non-euclidian ways, although do have physical length (as an integer).

* Nodes can be merged with other nodes (although they don't _have_ to "pair"&mdash;think a line crossing over another).
  * They can be paired via `Graph.join`, which creates a path between them (in the game, this is where a red line appear to show connectivity).
  * Nodes will be on at least one edge, but perhaps multiple.

* There are some restrictions on graph operations for sanity.
  * Nodes cannot exist at multiple places on the same edge.
  * Edges can only be joined together at one place.
  * Because of this, it's possible to unambiguously match a segment via a request for two distinct nodes on the same edge.

# Goals

The SVG renderer is really just a demo over the graph code.
I have a personal goal to write a train game&mdash;while this might be used for casual games, I'm inspiring more from Factorio or similar in terms of the feature set.
