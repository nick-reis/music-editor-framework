import { ChangeEmitter } from "../events/ChangeEmitter";
import { MutationCapture } from "../mutations/MutationCapture";
import { getOwningWorkspace } from "../internal/ModelOwnership";
import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";
import type { TimelineChange } from "../events/ModelChange";
import type { Tick, Seconds, BPM } from "../types/time";
import { TICKS_PER_QUARTER_NOTE } from "../types/time";

export interface TimelineOptions {
  readonly bpm?: BPM;
  readonly ticksPerQuarter?: number;
}

type BpmState = Readonly<{ bpm: BPM }>;

/**
 * Shared project timeline. Editable elements use ticks; consumers translate
 * at this boundary. Tempo is recorded as a single mutation, never as one
 * mutation per audio clip.
 */
export class Timeline {
  private _bpm: BPM;
  private readonly _ticksPerQuarter: number;

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

    this.validateBpm(bpm);
    if (!Number.isSafeInteger(ticksPerQuarter) || ticksPerQuarter <= 0) {
      throw new RangeError(
        "Ticks per quarter must be a positive safe integer",
      );
    }

    this._bpm = bpm;
    this._ticksPerQuarter = ticksPerQuarter;
  }

  onChange(listener: ChangeListener<TimelineChange>): Unsubscribe {
    return this.changes.subscribe(listener);
  }

  /** @internal Workspace propagation stays synchronous during transactions. */
  onInternalChange(listener: ChangeListener<TimelineChange>): Unsubscribe {
    return this.changes.subscribeInternal(listener);
  }

  get ticksPerQuarter(): number {
    return this._ticksPerQuarter;
  }

  get bpm(): BPM {
    return this._bpm;
  }

  setBpm(bpm: BPM): void {
    this.applyBpm(bpm, true);
  }

  ticksToSeconds(ticks: Tick): Seconds {
    this.validateFinite(ticks, "Ticks");

    return this.checked(
      (ticks / this.ticksPerQuarter) * (60 / this._bpm),
      "Seconds",
    );
  }

  secondsToTicks(seconds: Seconds): Tick {
    this.validateFinite(seconds, "Seconds");

    // Fractional ticks are intentional. Quantization belongs to snap tools.
    return this.checked(
      (seconds * this._bpm * this.ticksPerQuarter) / 60,
      "Ticks",
    );
  }

  /**
   * Project a real-time duration into a tick span at a particular start tick.
   * The start position is intentionally part of the contract so a future
   * tempo map can integrate over the interval without changing callers.
   */
  durationSecondsToTicks(startTick: Tick, seconds: Seconds): Tick {
    this.validateFinite(startTick, "Ticks");
    this.validateFinite(seconds, "Seconds");

    if (seconds <= 0) {
      throw new RangeError("Audio duration must be positive");
    }

    // Constant tempo: independent of startTick. Avoid subtraction of two
    // large absolute tick values, which would lose precision.
    const result = this.secondsToTicks(seconds);
    if (result <= 0) {
      throw new RangeError("Audio duration is too small to represent in ticks");
    }

    return result;
  }

  private applyBpm(bpm: BPM, capture: boolean): void {
    this.validateBpm(bpm);

    if (Object.is(this._bpm, bpm)) return;

    if (capture) MutationCapture.assertTarget(this);

    const before: BpmState = Object.freeze({ bpm: this._bpm });
    const after: BpmState = Object.freeze({ bpm });

    this._bpm = bpm;

    MutationCapture.record({
      target: this,
      before,
      after,
      undo: () => this.restoreBpm(after, before),
      redo: () => this.restoreBpm(before, after),
    });

    this.changes.emit({
      previousBpm: before.bpm,
      bpm,
    });
  }

  private restoreBpm(expected: BpmState, target: BpmState): void {
    if (MutationCapture.isRecording(this)) {
      throw new Error("Cannot replay during mutation capture");
    }
    if (!Object.is(this._bpm, expected.bpm)) {
      throw new Error("Timeline BPM was modified outside this mutation");
    }
    this.applyBpm(target.bpm, false);
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
