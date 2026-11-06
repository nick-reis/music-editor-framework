import { ChangeEmitter } from "../events/ChangeEmitter";
import { MutationCapture } from "../mutations/MutationCapture";
import { getElementGrid, getOwningWorkspace } from "../internal/ModelOwnership";

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

type FullState<TExtra extends object> = ElementState & TExtra;

type InitialState<TExtra extends object> = Omit<ElementState, "locked"> &
  TExtra & {
    locked?: boolean;
  };

export abstract class EditableElement<
  TExtra extends object = Record<never, never>,
> {
  public readonly id: ElementId;

  private readonly changes = new ChangeEmitter<ElementChange>(
    () => getOwningWorkspace(this),
  );
  private _state: Readonly<FullState<TExtra>>;

  protected constructor(
    initialState: InitialState<TExtra>,
    id: ElementId = crypto.randomUUID(),
  ) {
    const state = Object.freeze({
      locked: false,
      ...initialState,
    }) as Readonly<FullState<TExtra>>;

    this.validateSharedState(state);

    this.id = id;
    this._state = state;
  }

  abstract readonly resizable: boolean;

  get grid(): Grid | null {
    return getElementGrid(this);
  }

  protected get state(): Readonly<FullState<TExtra>> {
    return this._state;
  }

  onChange(listener: ChangeListener<ElementChange>): Unsubscribe {
    return this.changes.subscribe(listener);
  }

  /** @internal Used by Grid to forward element changes. */
  onInternalChange(listener: ChangeListener<ElementChange>): Unsubscribe {
    return this.changes.subscribeInternal(listener);
  }

  protected notifyChange(
    properties: ChangedProperties<FullState<TExtra>>,
  ): void {
    this.changes.emit({
      elementId: this.id,
      properties,
    });
  }

  protected assertEditable(): void {
    if (this._state.locked) {
      throw new Error(`Element ${this.id} is locked`);
    }
  }

  get row(): RowIndex {
    return this._state.row;
  }

  set row(value: RowIndex) {
    this.updateState({ row: value });
  }

  get locked(): boolean {
    return this._state.locked;
  }

  set locked(value: boolean) {
    this.updateState({ locked: value });
  }

  setLocked(value: boolean): void {
    this.locked = value;
  }

  get startTick(): Tick {
    return this._state.startTick;
  }

  get durationTicks(): Tick {
    return this._state.durationTicks;
  }

  getStartTick(): Tick {
    return this._state.startTick;
  }

  getEndTick(): Tick {
    return this._state.startTick + this._state.durationTicks;
  }

  moveToTick(startTick: Tick): void {
    this.updateState({ startTick });
  }

  resizeToDuration(durationTicks: Tick): void {
    if (!this.resizable) {
      throw new Error("Element cannot be resized");
    }

    this.updateState({ durationTicks });
  }

  protected updateTiming(startTick: Tick, durationTicks: Tick): void {
    this.updateState({ startTick, durationTicks });
  }

  protected updateState(patch: Partial<ElementState> | Partial<TExtra>): void {
    for (const key of Object.keys(patch)) {
      if (!Object.hasOwn(this._state, key)) {
        throw new Error(`Unknown element state property: ${key}`);
      }
    }

    const next = Object.freeze({
      ...this._state,
      ...patch,
    }) as Readonly<FullState<TExtra>>;

    this.applyState(next, true);
  }

  protected validateState(_next: Readonly<FullState<TExtra>>): void {}

  private applyState(
    next: Readonly<FullState<TExtra>>,
    capture: boolean,
  ): void {
    const before = this._state;

    const properties = (
      Object.keys(before) as Extract<keyof FullState<TExtra>, string>[]
    ).filter((key) => !Object.is(before[key], next[key]));

    if (properties.length === 0) return;

    this.validateSharedState(next);
    this.validateState(next);

    const changesLock = properties.includes("locked");
    const changesOther = properties.some((property) => property !== "locked");

    if (changesOther) {
      this.assertEditable();
    }

    if (changesLock && changesOther) {
      throw new Error("Lock status must be changed separately");
    }

    if (capture) {
      MutationCapture.assertTarget(this);
    }

    this._state = next;

    MutationCapture.record({
      target: this,
      before,
      after: next,
      undo: () => this.restoreState(next, before),
      redo: () => this.restoreState(before, next),
    });

    this.notifyChange(properties);
  }

  private restoreState(
    expected: Readonly<FullState<TExtra>>,
    target: Readonly<FullState<TExtra>>,
  ): void {
    if (MutationCapture.isRecording(this)) {
      throw new Error("Cannot replay during mutation capture");
    }

    if (this._state !== expected) {
      throw new Error(`Element ${this.id} was modified outside this mutation`);
    }

    this.applyState(target, false);
  }

  private validateSharedState(state: Readonly<ElementState>): void {
    if (!Number.isInteger(state.row) || state.row < 0) {
      throw new Error("Element row must be a non-negative integer");
    }

    if (this.grid !== null && state.row >= this.grid.rowCount) {
      throw new Error("Element row is outside grid bounds");
    }

    if (
      !Number.isFinite(state.startTick) ||
      !Number.isFinite(state.durationTicks) ||
      state.durationTicks <= 0
    ) {
      throw new Error("Invalid element timing");
    }

    if (typeof state.locked !== "boolean") {
      throw new TypeError("Locked must be a boolean");
    }
  }
}
