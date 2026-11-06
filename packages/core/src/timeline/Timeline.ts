import { ChangeEmitter } from "../events/ChangeEmitter";
import { MutationCapture } from "../mutations/MutationCapture";
import { getOwningWorkspace } from "../internal/ModelOwnership";
import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";
import type { TimelineChange } from "../events/ModelChange";
import type { EditableElement } from "../elements/EditableElement";
import type {
  Tick, Seconds, BPM, Position, MusicalPosition, Duration, Offset,
  TimeSignature,
} from "../types/time";
import { TICKS_PER_QUARTER_NOTE } from "../types/time";

export interface TimelineOptions {
  readonly bpm?: BPM;
  readonly ticksPerQuarter?: number;
  readonly timeSignature?: TimeSignature;
  /** A finite, positive musical or seconds duration. Defaults to 16 bars. */
  readonly length?: Duration;
}

type TimelineState = Readonly<{
  bpm: BPM;
  timeSignature: TimeSignature;
  lengthTicks: Tick;
}>;

/**
 * One bounded, tick-based project timeline.
 * Musical and real-time coordinates are conversions at the public boundary.
 * Time signature is currently constant; changing it preserves absolute ticks.
 */
export class Timeline {
  private readonly _ticksPerQuarter: number;
  private _state: TimelineState;

  private readonly changes = new ChangeEmitter<TimelineChange>(
    () => getOwningWorkspace(this),
  );

  constructor(bpm?: BPM);
  constructor(options?: TimelineOptions);
  constructor(config: BPM | TimelineOptions = 120) {
    const options: TimelineOptions =
      typeof config === "number" ? { bpm: config } : config;
    const bpm = options.bpm ?? 120;
    const ticksPerQuarter =
      options.ticksPerQuarter ?? TICKS_PER_QUARTER_NOTE;
    const signature = options.timeSignature ?? [4, 4];

    this.validateBpm(bpm);
    if (!Number.isSafeInteger(ticksPerQuarter) || ticksPerQuarter <= 0) {
      throw new RangeError("Ticks per quarter must be a positive safe integer");
    }
    this.validateSignature(signature);

    this._ticksPerQuarter = ticksPerQuarter;
    const timeSignature = Object.freeze([...signature]) as unknown as TimeSignature;
    this.validateDuration(options.length ?? { bars: 16 });
    const lengthTicks = this.deltaToTicks(options.length ?? { bars: 16 }, timeSignature, bpm);
    this.validateLength(lengthTicks);
    this._state = Object.freeze({ bpm, timeSignature, lengthTicks });
  }

  onChange(listener: ChangeListener<TimelineChange>): Unsubscribe {
    return this.changes.subscribe(listener);
  }

  /** @internal Workspace propagation remains synchronous during transactions. */
  onInternalChange(listener: ChangeListener<TimelineChange>): Unsubscribe {
    return this.changes.subscribeInternal(listener);
  }

  get ticksPerQuarter(): number {
    return this._ticksPerQuarter;
  }

  get bpm(): BPM {
    return this._state.bpm;
  }

  get timeSignature(): TimeSignature {
    return this._state.timeSignature;
  }

  get lengthTicks(): Tick {
    return this._state.lengthTicks;
  }

  setBpm(bpm: BPM): void {
    this.validateBpm(bpm);
    this.applyState({ ...this._state, bpm }, true);
  }

  setTimeSignature(signature: TimeSignature): void {
    this.validateSignature(signature);
    const timeSignature = Object.freeze([...signature]) as unknown as TimeSignature;
    this.applyState({ ...this._state, timeSignature }, true);
  }

  setLength(length: Duration): void {
    this.validateDuration(length);
    const lengthTicks = this.deltaToTicks(length, this.timeSignature, this.bpm);
    this.validateLength(lengthTicks);
    this.applyState({ ...this._state, lengthTicks }, true);
  }

  /** Convert a one-based musical location or an absolute time into ticks. */
  toTick(position: Position): Tick {
    let tick: Tick;
    if ("seconds" in position) {
      this.assertSecondsObject(position);
      tick = this.secondsToTicks(position.seconds);
    } else {
      tick = this.musicalToTick(position, this.timeSignature);
    }
    this.assertPosition(tick);
    return tick;
  }

  /** Convert an absolute tick into a one-based musical location. */
  fromTick(tick: Tick): Required<MusicalPosition> {
    this.assertPosition(tick);
    const beatTicks = this.beatTicks(this.timeSignature);
    const barTicks = beatTicks * this.timeSignature[0];
    const barIndex = Math.floor(tick / barTicks);
    const remainder = tick - barIndex * barTicks;
    const beatIndex = Math.floor(remainder / beatTicks);
    return {
      bar: barIndex + 1,
      beat: beatIndex + 1,
      tick: remainder - beatIndex * beatTicks,
    };
  }

  /**
   * Convert a signed musical/seconds offset into ticks. startTick is reserved
   * for position-dependent conversions when meter/tempo maps are supported.
   */
  toTickDelta(offset: Offset, startTick: Tick = 0): Tick {
    this.validateFinite(startTick, "Ticks");
    return this.deltaToTicks(offset, this.timeSignature, this.bpm);
  }

  /**
   * Convert a positive musical or real-time duration to ticks.
   * Unlike toTickDelta(), negative components and zero durations are invalid.
   */
  toTickDuration(duration: Duration, startTick: Tick = 0): Tick {
    this.validateDuration(duration);
    const span = this.toTickDelta(duration, startTick);
    this.validateLength(span);
    return span;
  }

  ticksToSeconds(ticks: Tick): Seconds {
    this.validateFinite(ticks, "Ticks");
    return this.checked(
      (ticks / this.ticksPerQuarter) * (60 / this.bpm),
      "Seconds",
    );
  }

  secondsToTicks(seconds: Seconds): Tick {
    this.validateFinite(seconds, "Seconds");
    return this.checked(
      (seconds * this.bpm * this.ticksPerQuarter) / 60,
      "Ticks",
    );
  }

  durationSecondsToTicks(startTick: Tick, seconds: Seconds): Tick {
    return this.durationAtBpm(startTick, seconds, this.bpm);
  }

  /** @internal Computes a source duration against a proposed BPM. */
  durationAtBpm(startTick: Tick, seconds: Seconds, bpm: BPM): Tick {
    this.validateFinite(startTick, "Ticks");
    this.validateFinite(seconds, "Seconds");
    this.validateBpm(bpm);
    if (seconds <= 0) {
      throw new RangeError("Audio duration must be positive");
    }
    const result = this.checked(
      (seconds * bpm * this.ticksPerQuarter) / 60,
      "Ticks",
    );
    if (result <= 0) {
      throw new RangeError("Audio duration is too small to represent in ticks");
    }
    return result;
  }

  /**
   * @internal Shared validation for initial attachment, direct edits,
   * low-level tick editing, timeline changes, and history replay.
   */
  assertFitsElement(
    element: EditableElement,
    options: {
      readonly startTick?: Tick;
      readonly durationTicks?: Tick;
      readonly bpm?: BPM;
      readonly lengthTicks?: Tick;
    } = {},
  ): void {
    const startTick = options.startTick ?? element.startTick;
    const span = element.durationTicksForTimeline(
      this,
      startTick,
      options.durationTicks ?? element.durationTicks,
      options.bpm ?? this.bpm,
    );
    this.assertInterval(startTick, span, options.lengthTicks ?? this.lengthTicks);
  }

  /** @internal Inclusive end boundary, positive element duration. */
  assertInterval(startTick: Tick, durationTicks: Tick, limit = this.lengthTicks): void {
    if (
      !Number.isFinite(startTick) ||
      !Number.isFinite(durationTicks) ||
      durationTicks <= 0 ||
      startTick < 0 ||
      startTick >= limit ||
      !Number.isFinite(startTick + durationTicks) ||
      startTick + durationTicks > limit
    ) {
      throw new RangeError("Element timing is outside timeline bounds");
    }
  }

  private musicalToTick(position: MusicalPosition, signature: TimeSignature): Tick {
    if (!position || typeof position !== "object") {
      throw new TypeError("Invalid musical position");
    }
    const { bar, beat = 1, tick = 0 } = position;
    const beatTicks = this.beatTicks(signature);
    const insideBar = (beat - 1) * beatTicks + tick;
    if (
      !Number.isSafeInteger(bar) || bar < 1 ||
      !Number.isFinite(beat) || beat < 1 ||
      !Number.isFinite(tick) || tick < 0 || tick >= beatTicks ||
      !Number.isFinite(insideBar) || insideBar >= signature[0] * beatTicks ||
      !Object.keys(position).every((key) => ["bar", "beat", "tick"].includes(key))
    ) {
      throw new RangeError("Invalid musical position");
    }
    return this.checked(
      (bar - 1) * signature[0] * beatTicks + insideBar,
      "Ticks",
    );
  }

  private deltaToTicks(
    offset: Offset,
    signature: TimeSignature,
    bpm: BPM,
  ): Tick {
    if (!offset || typeof offset !== "object") {
      throw new TypeError("Invalid duration or offset");
    }
    if ("seconds" in offset) {
      this.assertSecondsObject(offset);
      const seconds = offset.seconds;
      if (seconds === undefined) {
        throw new RangeError("Seconds coordinates require one finite seconds value");
      }
      return this.checked(
        (seconds * bpm * this.ticksPerQuarter) / 60,
        "Ticks",
      );
    }
    if (
      !Object.keys(offset).every((key) => ["bars", "beats", "ticks"].includes(key)) ||
      offset.bars !== undefined && !Number.isSafeInteger(offset.bars) ||
      offset.beats !== undefined && !Number.isFinite(offset.beats) ||
      offset.ticks !== undefined && !Number.isFinite(offset.ticks)
    ) {
      throw new RangeError("Invalid musical duration or offset");
    }
    const beatTicks = this.beatTicks(signature);
    return this.checked(
      (offset.bars ?? 0) * signature[0] * beatTicks +
      (offset.beats ?? 0) * beatTicks +
      (offset.ticks ?? 0),
      "Ticks",
    );
  }

  private assertSecondsObject(value: { readonly seconds?: number }): void {
    if (
      typeof value.seconds !== "number" ||
      !Number.isFinite(value.seconds) ||
      Object.keys(value).length !== 1
    ) {
      throw new RangeError("Seconds coordinates require one finite seconds value");
    }
  }

  private assertPosition(tick: Tick): void {
    if (!Number.isFinite(tick) || tick < 0 || tick > this.lengthTicks) {
      throw new RangeError("Position is outside timeline bounds");
    }
  }

  private applyState(nextInput: TimelineState, capture: boolean): void {
    const previous = this._state;
    this.validateBpm(nextInput.bpm);
    this.validateSignature(nextInput.timeSignature);
    this.validateLength(nextInput.lengthTicks);

    const bpmChanged = !Object.is(previous.bpm, nextInput.bpm);
    const meterChanged =
      previous.timeSignature[0] !== nextInput.timeSignature[0] ||
      previous.timeSignature[1] !== nextInput.timeSignature[1];
    const lengthChanged = !Object.is(previous.lengthTicks, nextInput.lengthTicks);

    if (!bpmChanged && !meterChanged && !lengthChanged) return;

    // Replay must restore the SAME frozen snapshot object. Allocating a new
    // equivalent object would break the identity checks in subsequent redo.
    const next: TimelineState = Object.isFrozen(nextInput)
      ? nextInput
      : Object.freeze({
          bpm: nextInput.bpm,
          timeSignature: meterChanged
            ? Object.freeze([...nextInput.timeSignature]) as unknown as TimeSignature
            : previous.timeSignature,
          lengthTicks: nextInput.lengthTicks,
        });

    // Preflight every existing element BEFORE any state or history changes.
    const workspace = getOwningWorkspace(this);
    if (workspace) {
      for (const grid of workspace.getGrids()) {
        for (const element of grid.getElements()) {
          this.assertFitsElement(element, {
            bpm: next.bpm,
            lengthTicks: next.lengthTicks,
          });
        }
      }
    }

    if (capture) MutationCapture.assertTarget(this);
    this._state = next;

    MutationCapture.record({
      target: this,
      before: previous,
      after: next,
      undo: () => this.restoreState(next, previous),
      redo: () => this.restoreState(previous, next),
    });

    if (bpmChanged) {
      this.changes.emit({
        type: "bpm",
        previousBpm: previous.bpm,
        bpm: next.bpm,
      });
    }
    if (meterChanged) {
      this.changes.emit({
        type: "time-signature",
        previousTimeSignature: previous.timeSignature,
        timeSignature: next.timeSignature,
      });
    }
    if (lengthChanged) {
      this.changes.emit({
        type: "length",
        previousLengthTicks: previous.lengthTicks,
        lengthTicks: next.lengthTicks,
      });
    }
  }

  private restoreState(expected: TimelineState, next: TimelineState): void {
    if (MutationCapture.isRecording(this)) {
      throw new Error("Cannot replay during mutation capture");
    }
    if (this._state !== expected) {
      throw new Error("Timeline was modified outside this mutation");
    }
    this.applyState(next, false);
  }

  private beatTicks(signature: TimeSignature): Tick {
    return (this.ticksPerQuarter * 4) / signature[1];
  }

  private validateDuration(length: Duration): void {
    if (!length || typeof length !== "object") {
      throw new RangeError("Invalid timeline length");
    }
    if ("seconds" in length) {
      this.assertSecondsObject(length);
      if (length.seconds === undefined || length.seconds <= 0) {
        throw new RangeError("Timeline length must be positive and finite");
      }
      return;
    }
    if (
      length.bars !== undefined && length.bars < 0 ||
      length.beats !== undefined && length.beats < 0 ||
      length.ticks !== undefined && length.ticks < 0
    ) {
      throw new RangeError("Timeline duration components cannot be negative");
    }
  }

  private validateSignature(signature: TimeSignature): void {
    if (
      !Array.isArray(signature) ||
      signature.length !== 2 ||
      !Number.isSafeInteger(signature[0]) ||
      signature[0] <= 0 ||
      !Number.isSafeInteger(signature[1]) ||
      signature[1] <= 0 ||
      !Number.isInteger(Math.log2(signature[1]))
    ) {
      throw new RangeError("Time signature must have a positive numerator and a power-of-two denominator");
    }
  }

  private validateLength(lengthTicks: Tick): void {
    if (!Number.isFinite(lengthTicks) || lengthTicks <= 0) {
      throw new RangeError("Timeline length must be positive and finite");
    }
  }

  private validateBpm(bpm: BPM): void {
    if (!Number.isFinite(bpm) || bpm <= 0) {
      throw new Error("BPM must be a positive finite number");
    }
  }

  private validateFinite(value: number, name: string): void {
    if (!Number.isFinite(value)) {
      throw new RangeError(name + " must be finite");
    }
  }

  private checked(value: number, name: string): number {
    if (!Number.isFinite(value)) {
      throw new RangeError(name + " conversion overflow");
    }
    return value;
  }
}
