

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


export interface LineSearch {
  line: Line?;
  nodeId: string,
  offset: number;
  x: number;
  y: number;
  dist: number;
}
