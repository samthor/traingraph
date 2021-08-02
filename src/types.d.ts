

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
   * Finds the nearest node to the given position, possibly in the given direction.
   */
  findNode(edge: string, at: number, dir?: -1|0|1): AtNode;

  /**
   * Finds an exact node, or approximates that node.
   */
  exactNode(edge: string, at: number): AtNode;

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
   *
   * This cannot merge two nodes on the same edge (edge that wraps on itself), and cannot create
   * edges that join more than once.
   *
   * @return the resulting node, the other is removed
   */
  mergeNode(a: string, b: string): string;

  /**
   * Joins two nodes via another node. This expects that the three nodes are in sequence and will
   * crash otherwise. This creates a pair on the middle node.
   *
   * Returns true if a join was added, otherwise false.
   */
  join(a: string, via: string, b: string): boolean;

  /**
   * Finds all pairs at this node. This might not include all lines, because they may intersect here
   * without actually being paired up.
   */
  pairsAtNode(node: string): Iterable<[string, string]>;

  /**
   * Finds all possible adjcent nodes from this node.
   */
  dirsFromNode(node: string): Iterable<string>;

  /**
   * Splits the given edge at the specified position and creates a brand new node, unless a node
   * already exists here (returns existing).
   *
   * This will always join the two resulting virtual edges (the long edge must remain continuous).
   */
  splitEdge(edge: string, at: number): AtNode;

  /**
   * Finds the segment between these two nodes, as long as they share the same edge.
   */
  findBetween(lowNode: string, highNode: string): SegmentInfo;

  /**
   * Perform a search from the source to the destination.
   */
  search(from: AtNodeDirRequest, to: AtNodeRequest): null|AtNode[];
}


export interface EdgeDetails {
  edge: string;
  highNode: string;
  lowNode: string;
  length: number;
  other: Iterable<string>;  // connected edges
}


export interface SegmentInfo {
  dir: -1|1;
  length: number;
  edge: string;

  lowNode: string;
  lowAt: number;
  highNode: string;
  highAt: number;

  inner: string[];
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


export interface AtNodeRequest {
  node?: string;
  edge?: string;
  at?: number;
}


export interface AtNodeDirRequest extends AtNodeRequest {
  prevNode?: string;
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

