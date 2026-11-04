import type { GridRow } from "./GridRow";

export interface MidiRow extends GridRow {
  readonly pitch: number;
}
