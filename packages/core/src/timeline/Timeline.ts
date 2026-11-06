import { ChangeEmitter } from "../events/ChangeEmitter";
import { EditExecutor } from "../editing/EditExecutor";
import { getOwningWorkspace } from "../internal/ModelOwnership";
import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";
import type {
  TimelineChange,
  TimelineTransportChange,
} from "../events/ModelChange";
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

  // Transport is runtime state, intentionally separate from _state and
  // EditExecutor/MutationCapture. Subscriptions are not workspace notifications.
  private _playheadTick: Tick = 0;
  private _isPlaying = false;
  private transportAnchorTick: Tick = 0;
  private transportAnchorMs = 0;
  private transportTimer: ReturnType<typeof setInterval> | null = null;
  private readonly transportChanges = new ChangeEmitter<TimelineTransportChange>();

  /** UI update cadence, NOT a musical time step. Elapsed time drives position. */
  private static readonly TRANSPORT_REFRESH_MS = 16;

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

  /**
   * Runtime transport events. These never enter document undo/redo, and are
   * intentionally absent from workspace timeline-changed notifications.
   */
  onTransportChange(
    listener: ChangeListener<TimelineTransportChange>,
  ): Unsubscribe {
    return this.transportChanges.subscribe(listener);
  }

  /**
   * Read the continuously projected tick (including between timer callbacks).
   * Reading this property does not publish events or modify document state.
   */
  get playheadTick(): Tick {
    return this.projectPlayhead(performance.now());
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  /** Begin/resume playback, restarting from zero if already at the end. */
  play(): void {
    if (this._isPlaying) return;
    if (this._playheadTick >= this.lengthTicks) {
      this.setPlayheadTick(0);
    }

    this.transportAnchorTick = this._playheadTick;
    this.transportAnchorMs = performance.now();
    this._isPlaying = true;
    this.transportTimer = setInterval(
      () => this.advanceTransport(performance.now()),
      Timeline.TRANSPORT_REFRESH_MS,
    );
    this.transportChanges.emit({ type: "playback-changed", isPlaying: true });
  }

  /** Freeze at the exact position reached according to the monotonic clock. */
  pause(): void {
    if (!this._isPlaying) return;
    this.advanceTransport(performance.now());
    this.stopTransport();
  }

  /** Pause and return to the first tick. Safe to call repeatedly. */
  resetPlayhead(): void {
    this.stopTransport();
    this.setPlayheadTick(0);
  }

  /** Seek using the same musical/seconds Position as moveTo() and toTick(). */
  seekPlayhead(position: Position): void {
    this.seekPlayheadTick(this.toTick(position));
  }

  /**
   * Seek to a raw finite tick in [0, lengthTicks], including fractional ticks.
   * Seeking during playback restarts the clock anchor without changing BPM.
   * Seeking to the end stops playback; later play() starts at zero.
   */
  seekPlayheadTick(tick: Tick): void {
    this.assertPosition(tick);
    if (this._isPlaying) {
      this.transportAnchorTick = tick;
      this.transportAnchorMs = performance.now();
    }
    this.setPlayheadTick(tick);
    if (this._isPlaying && tick >= this.lengthTicks) {
      this.stopTransport();
    }
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
    this.applyState({ ...this._state, bpm });
  }

  setTimeSignature(signature: TimeSignature): void {
    this.validateSignature(signature);
    const timeSignature = Object.freeze([...signature]) as unknown as TimeSignature;
    this.applyState({ ...this._state, timeSignature });
  }

  setLength(length: Duration): void {
    this.validateDuration(length);
    const lengthTicks = this.deltaToTicks(length, this.timeSignature, this.bpm);
    this.validateLength(lengthTicks);
    this.applyState({ ...this._state, lengthTicks });
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

  /** Project elapsed wall-clock time at the current quarter-note BPM. */
  private projectPlayhead(now: number): Tick {
    if (!this._isPlaying) return this._playheadTick;

    // Timers can be throttled or clocks can lose precision. Never move back.
    const elapsedMs = Math.max(0, now - this.transportAnchorMs);
    const advancedTicks =
      (elapsedMs * this.bpm * this.ticksPerQuarter) / 60_000;
    return Math.min(
      this.lengthTicks,
      Math.max(this._playheadTick, this.transportAnchorTick + advancedTicks),
    );
  }

  private setPlayheadTick(tick: Tick): void {
    const previousTick = this._playheadTick;
    if (Object.is(previousTick, tick)) return;
    this._playheadTick = tick;
    this.transportChanges.emit({
      type: "playhead-moved",
      previousTick,
      tick,
    });
  }

  /** Materialize the current clock position and stop automatically at the end. */
  private advanceTransport(now: number): void {
    if (!this._isPlaying) return;
    this.setPlayheadTick(this.projectPlayhead(now));
    if (this._playheadTick >= this.lengthTicks) {
      this.stopTransport();
    }
  }

  private stopTransport(): void {
    if (!this._isPlaying) return;
    this._isPlaying = false;
    if (this.transportTimer !== null) {
      clearInterval(this.transportTimer);
      this.transportTimer = null;
    }
    this.transportChanges.emit({ type: "playback-changed", isPlaying: false });
  }

  /**
   * Coordinate document timing transitions with an independent live clock.
   * Advance at OLD BPM first; then switch the anchor to the new BPM.
   * Truncating the timeline clamps and stops playback without editing history.
   */
  private applyTimingState(next: TimelineState): void {
    if (this._state === next) return;
    const now = performance.now();
    this.advanceTransport(now);
    this._state = next;

    if (this._playheadTick >= next.lengthTicks) {
      this.setPlayheadTick(Math.min(this._playheadTick, next.lengthTicks));
      this.stopTransport();
    } else if (this._isPlaying) {
      this.transportAnchorTick = this._playheadTick;
      this.transportAnchorMs = now;
    }
  }

  private applyState(nextInput: TimelineState): void {
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

    const next: TimelineState = Object.freeze({
      bpm: nextInput.bpm,
      timeSignature: meterChanged
        ? Object.freeze([...nextInput.timeSignature]) as unknown as TimeSignature
        : previous.timeSignature,
      lengthTicks: nextInput.lengthTicks,
    });

    const workspace = getOwningWorkspace(this);
    const assertProjection = (state: TimelineState): void => {
      if (!workspace) return;
      for (const grid of workspace.getGrids()) {
        for (const element of grid.getElements()) {
          this.assertFitsElement(element, {
            bpm: state.bpm,
            lengthTicks: state.lengthTicks,
          });
        }
      }
    };

    const changes = (forward: boolean): void => {
      const before = forward ? previous : next;
      const after = forward ? next : previous;
      if (bpmChanged) this.changes.emit({
        type: "bpm",
        previousBpm: before.bpm,
        bpm: after.bpm,
      });
      if (meterChanged) this.changes.emit({
        type: "time-signature",
        previousTimeSignature: before.timeSignature,
        timeSignature: after.timeSignature,
      });
      if (lengthChanged) this.changes.emit({
        type: "length",
        previousLengthTicks: before.lengthTicks,
        lengthTicks: after.lengthTicks,
      });
    };

    const step = {
      before: previous,
      after: next,
      targets: [this],
      stateOwner: this,
      validate: (direction: "forward" | "backward") => {
        const forward = direction === "forward";
        if (this._state !== (forward ? previous : next)) {
          throw new Error("Timeline was modified outside this mutation");
        }
        assertProjection(forward ? next : previous);
      },
      apply: (direction: "forward" | "backward") => {
        const forward = direction === "forward";
        if (this._state !== (forward ? previous : next)) {
          throw new Error("Timeline was modified outside this mutation");
        }
        this.applyTimingState(forward ? next : previous);
      },
      recover: (direction: "forward" | "backward") => {
        const expected = direction === "forward" ? previous : next;
        const destination = direction === "forward" ? next : previous;
        if (this._state !== expected && this._state !== destination) {
          throw new Error("Timeline recovery was incomplete");
        }
        this.applyTimingState(expected);
      },
      publish: (direction: "forward" | "backward") => {
        changes(direction === "forward");
      },
    };
    EditExecutor.execute({
      target: this,
      steps: [step],
    });
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
