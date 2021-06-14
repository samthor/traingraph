

export interface GraphType {

  /**
   * Iterates through all nodes in this graph.
   */
  allNodes(): Iterable<string>;

  /**
   * Adds a new edge of given length to this string. Adds a new edge and its low/high nodes.
   */
  add(length: number): EdgeDetails;

  /**
   * Finds the low and high nodes for this edge. These nodes are at [0,1] respectively.
   */
  edgeDetails(edge: string): EdgeDetails;

  /**
   * Finds the nearest edge node to the given position. Edges always have at least a start and end
   * node, so this always returns a value.
   */
  findNode(edge: string, at: number, dir?: -1|0|1): AtNode;

  /**
   * Finds any exact matching node, or, the absence of a node. Returns the optional prior and
   * after nodes. Used for trying to match new additions.
   *
   * TODO: almost the same as findNode
   */
  nodeAround(edge: string, at: number): AtNode;

  /**
   * Returns information about a specific node on this edge.
   */
  nodeOnEdge(edge: string, node: string): AtNode;

  /**
   * Returns all the positions of this given node on all its lines. This will return one result at
   * minimum.
   */
  linesAtNode(node: string): Iterable<AtNode>;

  /**
   * Returns any valid position of this node (e.g., for rendering), although it may be on multiple
   * lines.
   */
  nodePos(node: string): AtNode;

  /**
   * Merges two nodes, including their existing pairs. One node wins, returns the resulting node.
   * This cannot merge two nodes on the same edge (edge that wraps on itself).
   *
   * @return the resulting node, the other is removed
   */
  mergeNode(a: string, b: string): string;

  /**
   * Joins two nodes via another node. This expects that the three nodes are in sequence and will
   * crash otherwise.
   */
  join(a: string, via: string, b: string): void;

  /**
   * Finds all pairs at this node. This might not include all lines, because they may intersect here
   * without actually being paired up.
   */
  pairsAtNode(node: string): Iterable<[string, string]>;

  /**
   * Splits the given edge at the specified position and creates a brand new node. This will always
   * join the two resulting virtual edges (the long edge must remain continuous).
   */
  splitEdge(edge: string, at: number): AtNode;

  /**
   * Finds the unambiguous segment between these two nodes.
   */
  findSegment(lowNode: string, highNode: string): {edge: string, at: number, dir: -1|1, segmentLength: number};
}


export interface EdgeDetails {
  edge: string;
  highNode: string;
  lowNode: string;
  length: number;
}


/**
 * The position of a node on an edge.
 */
export interface AtNode {
  edge: string;
  at: number;
  node: string;
  priorNode: string;
  afterNode: string;
}



export interface LineSearch {
  line: Line?;
  nodeId: string,
  offset: number;
  x: number;
  y: number;
  dist: number;
}


export interface Point {
  x: number;
  y: number;
}


export interface Line {
  low: Point;
  high: Point;
  length: number;
  id: string;
}

