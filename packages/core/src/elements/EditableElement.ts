import { ChangeEmitter } from "../events/ChangeEmitter";
import { EditExecutor } from "../editing/EditExecutor";
import type { EditStep } from "../editing/EditPlan";
import { getElementGrid, getOwningWorkspace } from "../internal/ModelOwnership";

import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";
import type {
  ElementChange,
  ElementState,
  ChangedProperties,
} from "../events/ModelChange";

import type { ElementId } from "../types/ids";
import type { RowIndex } from "../types/coordinates";
import type { Tick, BPM, Position, Offset } from "../types/time";
import type { Timeline } from "../timeline/Timeline";
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
    return this.startTick + this.durationTicks;
  }

  /**
   * Move to an absolute musical or seconds position.
   * Detached elements require an explicit timeline.
   */
  moveTo(position: Position, timeline?: Timeline): void {
    const context = this.resolveTimeline(timeline);
    const startTick = context.toTick(position);
    context.assertFitsElement(this, { startTick });
    this.moveToTick(startTick);
  }

  /** Move by a signed musical or seconds displacement. */
  moveBy(offset: Offset, timeline?: Timeline): void {
    const context = this.resolveTimeline(timeline);
    const startTick = this.startTick + context.toTickDelta(offset, this.startTick);
    context.assertFitsElement(this, { startTick });
    this.moveToTick(startTick);
  }

  /**
   * Grow or shrink the duration by a signed displacement.
   * This is additive, not a replacement for resizeToDuration().
   */
  resizeBy(offset: Offset, timeline?: Timeline): void {
    if (!this.resizable) {
      throw new Error("Element cannot be resized");
    }
    const context = this.resolveTimeline(timeline);
    const durationTicks = this.durationTicks + context.toTickDelta(offset, this.getEndTick());
    context.assertFitsElement(this, { durationTicks });
    this.resizeToDuration(durationTicks);
  }

  /** @internal Subclasses can project source durations against proposed tempo. */
  durationTicksForTimeline(
    _timeline: Timeline,
    _startTick: Tick,
    storedDurationTicks: Tick,
    _bpm: BPM,
  ): Tick {
    return storedDurationTicks;
  }

  /** @internal Validate custom state once the concrete subclass is initialized. */
  assertValidState(): void {
    this.validateSharedState(this._state);
    this.validateState(this._state as Readonly<TExtra>);
  }

  /**
   * @internal An inert state transition; suitable for one-element and compound
   * operations. In particular, transfers validate the DESTINATION row count.
   */
  preparePosition(
    row: RowIndex,
    startTick: Tick,
    targetRowCount: number,
    timeline: Timeline,
    originalRowCount: number = this.grid?.rowCount ?? targetRowCount,
  ): EditStep {
    return this.prepareStateUpdate({ row, startTick }, {
      forwardRowCount: targetRowCount,
      backwardRowCount: originalRowCount,
      timeline,
    });
  }

  /**
   * @internal Consolidate all changes to one element in a single edit step.
   * Prefer this over preparing several steps for the same element.
   */
  prepareStateUpdate(
    patch: Partial<ElementState> | Partial<TExtra>,
    options: {
      forwardRowCount?: number | null;
      backwardRowCount?: number | null;
      timeline?: Timeline | null;
    } = {},
  ): EditStep {
    for (const key of Object.keys(patch)) {
      if (!Object.hasOwn(this._state, key)) {
        throw new Error(`Unknown element state property: ${key}`);
      }
    }
    const next = Object.freeze({
      ...this._state,
      ...patch,
    }) as Readonly<FullState<TExtra>>;
    return this.prepareTransition(next, options);
  }

  private prepareTransition(
    next: Readonly<FullState<TExtra>>,
    options: {
      forwardRowCount?: number | null;
      backwardRowCount?: number | null;
      timeline?: Timeline | null;
    } = {},
  ): EditStep {
    const before = this._state;
    const properties = (
      Object.keys(before) as Extract<keyof FullState<TExtra>, string>[]
    ).filter((key) => !Object.is(before[key], next[key]));
    const after = properties.length === 0 ? before : next;
    const timeline = options.timeline
      ?? this.grid?.container?.workspace?.timeline
      ?? null;

    const validateDestination = (
      state: Readonly<FullState<TExtra>>,
      rowCount: number | null | undefined,
    ) => {
      this.validateSharedState(state, rowCount);
      this.validateState(state as Readonly<TExtra>);
      timeline?.assertFitsElement(this, {
        startTick: state.startTick,
        durationTicks: state.durationTicks,
      });
    };
    if (properties.length > 0) {
      const changesLock = properties.includes("locked");
      const changesOther = properties.some((key) => key !== "locked");
      if (changesOther) this.assertEditable();
      if (changesLock && changesOther) {
        throw new Error("Lock status must be changed separately");
      }
    }
    validateDestination(after, options.forwardRowCount);
    return {
      before,
      after,
      targets: [this],
      stateOwner: this,
      validate: (direction) => {
        const forward = direction === "forward";
        if (this._state !== (forward ? before : after)) {
          throw new Error(`Element ${this.id} was modified outside this mutation`);
        }
        validateDestination(
          forward ? after : before,
          forward ? options.forwardRowCount : options.backwardRowCount,
        );
      },
      apply: (direction) => {
        const forward = direction === "forward";
        const expected = forward ? before : after;
        if (this._state !== expected) {
          throw new Error(`Element ${this.id} was modified outside this mutation`);
        }
        this._state = forward ? after : before;
      },
      recover: (direction) => {
        const forward = direction === "forward";
        const expected = forward ? before : after;
        const destination = forward ? after : before;
        if (this._state !== expected && this._state !== destination) {
          throw new Error(`Element ${this.id} could not recover its state`);
        }
        this._state = expected;
      },
      publish: () => {
        if (properties.length > 0) this.notifyChange(properties);
      },
    };
  }

  private resolveTimeline(explicit?: Timeline): Timeline {
    const attached = this.grid?.container?.workspace?.timeline;
    if (attached) {
      if (explicit && attached !== explicit) {
        throw new Error("Element belongs to a different timeline");
      }
      return attached;
    }
    if (!explicit) {
      throw new Error("Detached element requires an explicit timeline");
    }
    return explicit;
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
    const step = this.prepareStateUpdate(patch);
    if (step.before === step.after) return;
    EditExecutor.execute({
      target: this,
      steps: [step],
    });
  }

  /**
   * Validate only custom fields. Built-in row, timing and locking invariants
   * are enforced by the framework. This hook is optional.
   */
  protected validateState(_next: Readonly<TExtra>): void {}

  private validateSharedState(
    state: Readonly<ElementState>,
    rowCount: number | null = this.grid?.rowCount ?? null,
  ): void {
    if (!Number.isInteger(state.row) || state.row < 0) {
      throw new Error("Element row must be a non-negative integer");
    }

    if (rowCount !== null && state.row >= rowCount) {
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
