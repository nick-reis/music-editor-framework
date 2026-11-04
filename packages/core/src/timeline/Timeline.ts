import { ChangeEmitter } from "../events/ChangeEmitter";
import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";
import type { TimelineChange } from "../events/ModelChange";

import type { Tick, Seconds, BPM } from "../types/time";
import { TICKS_PER_QUARTER_NOTE } from "../types/time";

export class Timeline {
  private _bpm: BPM;

  private readonly changes = new ChangeEmitter<TimelineChange>();

  constructor(bpm: BPM = 120) {
    this.validateBpm(bpm);
    this._bpm = bpm;
  }

  onChange(listener: ChangeListener<TimelineChange>): Unsubscribe {
    return this.changes.subscribe(listener);
  }

  get bpm(): BPM {
    return this._bpm;
  }

  setBpm(bpm: BPM): void {
    this.validateBpm(bpm);

    if (this._bpm === bpm) return;

    const previousBpm = this._bpm;
    this._bpm = bpm;

    this.changes.emit({
      previousBpm,
      bpm,
    });
  }

  ticksToSeconds(ticks: Tick): Seconds {
    return (ticks / TICKS_PER_QUARTER_NOTE) * (60 / this._bpm);
  }

  secondsToTicks(seconds: Seconds): Tick {
    return (seconds * this._bpm * TICKS_PER_QUARTER_NOTE) / 60;
  }

  private validateBpm(bpm: BPM): void {
    if (!Number.isFinite(bpm) || bpm <= 0) {
      throw new Error("BPM must be a positive finite number");
    }
  }
}
