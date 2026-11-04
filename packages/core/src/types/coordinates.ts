import type { Tick } from "./time";

export type RowIndex = number;

export interface GridPosition {
  tick: Tick;
  row: RowIndex;
}

export interface ScreenPoint {
  x: number;
  y: number;
}
