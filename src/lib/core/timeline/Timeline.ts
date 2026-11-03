import type { Tick, Seconds, BPM } from "../types/time";
import { TICKS_PER_QUARTER_NOTE } from "../types/time";

export class Timeline {
  private _bpm: BPM;

  constructor(bpm: BPM = 120) {
    this.validateBpm(bpm);
    this._bpm = bpm;
  }

  get bpm(): BPM {
    return this._bpm;
  }

  setBpm(bpm: BPM): void {
    this.validateBpm(bpm);
    this._bpm = bpm;
  }

  ticksToSeconds(ticks: Tick): Seconds {
    return (ticks / TICKS_PER_QUARTER_NOTE) * (60 / this._bpm);
  }

  secondsToTicks(seconds: Seconds): Tick {
    return ((seconds * this._bpm) / 60) * TICKS_PER_QUARTER_NOTE;
  }

  private validateBpm(bpm: BPM): void {
    if (!Number.isFinite(bpm) || bpm <= 0) {
      throw new Error("BPM must be a positive finite number");
    }
  }
}
