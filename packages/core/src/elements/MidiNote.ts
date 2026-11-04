import { EditableElement } from "./EditableElement";
import type { ElementId } from "../types/ids";
import type { RowIndex } from "../types/coordinates";
import type { Tick } from "../types/time";

export class MidiNote extends EditableElement {
  readonly resizable = true;

  constructor(
    row: RowIndex,
    startTick: Tick,
    durationTicks: Tick,
    id?: ElementId,
  ) {
    super(row, startTick, durationTicks, id);
  }
}
