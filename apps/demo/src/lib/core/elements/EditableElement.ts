import type { ElementId } from "../types/ids";
import type { RowIndex } from "../types/coordinates";
import type { Tick } from "../types/time";

export abstract class EditableElement {
  public locked = false;
  public readonly id: ElementId;

  protected constructor(
    public row: RowIndex,
    private _startTick: Tick,
    private _durationTicks: Tick,
    id: ElementId = crypto.randomUUID(),
  ) {
    this.id = id;
    this.validateTiming(_startTick, _durationTicks);
  }

  abstract readonly resizable: boolean;

  get startTick(): Tick {
    return this._startTick;
  }

  get durationTicks(): Tick {
    return this._durationTicks;
  }

  getStartTick(): Tick {
    return this._startTick;
  }

  getEndTick(): Tick {
    return this._startTick + this._durationTicks;
  }

  moveToTick(startTick: Tick): void {
    this.validateTiming(startTick, this._durationTicks);
    this._startTick = startTick;
  }

  resizeToDuration(durationTicks: Tick): void {
    if (!this.resizable) {
      throw new Error("Element cannot be resized");
    }

    this.validateTiming(this._startTick, durationTicks);
    this._durationTicks = durationTicks;
  }

  protected updateTiming(startTick: Tick, durationTicks: Tick): void {
    this.validateTiming(startTick, durationTicks);

    this._startTick = startTick;
    this._durationTicks = durationTicks;
  }

  private validateTiming(startTick: Tick, durationTicks: Tick): void {
    if (
      !Number.isFinite(startTick) ||
      !Number.isFinite(durationTicks) ||
      durationTicks <= 0
    ) {
      throw new Error("Invalid element timing");
    }
  }
}
