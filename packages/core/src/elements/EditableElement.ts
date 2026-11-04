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
import type { Grid } from "../grids/Grid";

export abstract class EditableElement {
  public readonly id: ElementId;

  private readonly changes = new ChangeEmitter<ElementChange>();

  private owningGrid: Grid | null = null;

  private _row: RowIndex;
  private _locked = false;

  constructor(
    row: RowIndex,
    private _startTick: Tick,
    private _durationTicks: Tick,
    id: ElementId = crypto.randomUUID(),
  ) {
    this.validateRow(row);
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
    this.validateRow(value);

    if (this.owningGrid !== null && value >= this.owningGrid.rowCount) {
      throw new Error("Element row is outside grid bounds");
    }

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

  private validateRow(row: RowIndex): void {
    if (!Number.isInteger(row) || row < 0) {
      throw new Error("Element row must be a non-negative integer");
    }
  }

  /** @internal Called by Grid.addElement(). */
  attachToGrid(grid: Grid): void {
    if (this.owningGrid !== null) {
      throw new Error(`Element ${this.id} already belongs to a grid`);
    }

    if (this._row >= grid.rowCount) {
      throw new Error("Element row is outside grid bounds");
    }

    this.owningGrid = grid;
  }

  /** @internal Called by Grid.removeElement(). */
  detachFromGrid(grid: Grid): void {
    if (this.owningGrid !== grid) {
      throw new Error(`Element ${this.id} does not belong to this grid`);
    }

    this.owningGrid = null;
  }
}
