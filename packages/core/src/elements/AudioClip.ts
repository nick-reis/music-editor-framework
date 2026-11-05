import { EditableElement } from "./EditableElement";
import type { ElementId } from "../types/ids";
import type { RowIndex } from "../types/coordinates";
import type { Tick, Seconds } from "../types/time";

export class AudioClip extends EditableElement {
  readonly resizable = false;

  constructor(
    row: RowIndex,
    startTick: Tick,
    durationTicks: Tick,
    public readonly durationSeconds: Seconds,
    id?: ElementId,
  ) {
    super({ row, startTick, durationTicks }, id);

    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error("Invalid audio duration");
    }
  }

  syncToTempo(durationTicks: Tick): void {
    this.updateTiming(this.startTick, durationTicks);
  }
}
