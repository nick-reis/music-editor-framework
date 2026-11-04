import { ChangeEmitter } from "../events/ChangeEmitter";
import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";
import type {
  ElementChange,
  ElementState,
  ChangedProperties,
} from "../events/ModelChange";

import type { ElementId } from "../types/ids";
import type { RowIndex } from "../types/coordinates";
import type { Tick } from "../types/time";

export abstract class EditableElement {
  public readonly id: ElementId;

  private readonly changes = new ChangeEmitter<ElementChange>();

  private _row: RowIndex;
  private _locked = false;

  protected constructor(
    row: RowIndex,
    private _startTick: Tick,
    private _durationTicks: Tick,
    id: ElementId = crypto.randomUUID(),
  ) {
    this.validateTiming(_startTick, _durationTicks);

    this.id = id;
    this._row = row;
  }

  abstract readonly resizable: boolean;

  onChange(listener: ChangeListener<ElementChange>): Unsubscribe {
    return this.changes.subscribe(listener);
  }

  protected notifyChange(properties: ChangedProperties<ElementState>): void {
    this.changes.emit({
      elementId: this.id,
      properties,
    });
  }

  get row(): RowIndex {
    return this._row;
  }

  set row(value: RowIndex) {
    if (this._row === value) return;

    this._row = value;
    this.notifyChange(["row"]);
  }

  get locked(): boolean {
    return this._locked;
  }

  set locked(value: boolean) {
    if (this._locked === value) return;

    this._locked = value;
    this.notifyChange(["locked"]);
  }

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

    if (this._startTick === startTick) return;

    this._startTick = startTick;
    this.notifyChange(["startTick"]);
  }

  resizeToDuration(durationTicks: Tick): void {
    if (!this.resizable) {
      throw new Error("Element cannot be resized");
    }

    this.updateTiming(this._startTick, durationTicks);
  }

  protected updateTiming(startTick: Tick, durationTicks: Tick): void {
    this.validateTiming(startTick, durationTicks);

    const properties: (keyof ElementState)[] = [];

    if (this._startTick !== startTick) {
      properties.push("startTick");
    }

    if (this._durationTicks !== durationTicks) {
      properties.push("durationTicks");
    }

    if (properties.length === 0) return;

    this._startTick = startTick;
    this._durationTicks = durationTicks;

    this.notifyChange(properties);
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
