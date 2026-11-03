import { EditableElement } from "./EditableElement";
import type { ElementId } from "../types/ids";
import type { RowIndex } from "../types/coordinates";
import type { Tick } from "../types/time";

export class MidiNote extends EditableElement {
  readonly resizable = true;

  constructor(
    id: ElementId,
    row: RowIndex,
    startTick: Tick,
    durationTicks: Tick,
  ) {
    super(id, row, startTick, durationTicks);
  }
}
