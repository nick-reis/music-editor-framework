export type Tick = number;
export type Seconds = number;
export type BPM = number;

export const TICKS_PER_QUARTER_NOTE = 480;

/** One-based bar and beat coordinates; tick is an offset within the beat. */
export interface MusicalPosition {
  readonly bar: number;
  readonly beat?: number;
  readonly tick?: number;
}

export interface SecondsPosition {
  readonly seconds: number;
  readonly bar?: never;
  readonly beat?: never;
  readonly tick?: never;
}

export type Position = MusicalPosition | SecondsPosition;

/** A count of whole bars, potentially fractional beats, and ticks. */
export interface MusicalDuration {
  readonly bars?: number;
  readonly beats?: number;
  readonly ticks?: number;
  readonly seconds?: never;
}

export interface SecondsDuration {
  readonly seconds: number;
  readonly bars?: never;
  readonly beats?: never;
  readonly ticks?: never;
}

export type Duration = MusicalDuration | SecondsDuration;

/** Signed displacement: the same units as Duration, but may be negative. */
export type MusicalOffset = MusicalDuration;
export type Offset = MusicalOffset | SecondsDuration;

export type TimeSignature = readonly [numerator: number, denominator: number];
