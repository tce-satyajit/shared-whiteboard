export type Tool = 'pencil' | 'eraser' | 'rect' | 'circle' | 'select';

export interface Point {
  x: number;
  y: number;
}

export interface DrawingElement {
  id: string;
  type: Tool;
  points?: number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number;
  color: string;
  strokeWidth: number;
}

export interface BoardState {
  elements: DrawingElement[];
}
