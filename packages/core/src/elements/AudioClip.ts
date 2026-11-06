import { EditableElement } from "./EditableElement";
import type { ElementId } from "../types/ids";
import type { RowIndex } from "../types/coordinates";
import type { Tick, Seconds } from "../types/time";
import type { Timeline } from "../timeline/Timeline";

/**
 * Audio spans are time-based; their editable coordinates are still ticks.
 * The source duration never changes when BPM changes.
 */
export class AudioClip extends EditableElement {
  readonly resizable = false;
  private readonly _sourceDurationSeconds: Seconds;

  // The import timeline is only used before the clip belongs to a workspace.
  // Once attached, the owning workspace's timeline is authoritative.
  private importTimeline: Timeline | null = null;

  constructor(
    row: RowIndex,
    startTick: Tick,
    durationTicks: Tick,
    durationSeconds: Seconds,
    id?: ElementId,
  ) {
    super({ row, startTick, durationTicks }, id);

    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error("Invalid audio duration");
    }
    this._sourceDurationSeconds = durationSeconds;
  }

  static fromSeconds(
    row: RowIndex,
    startTick: Tick,
    sourceDurationSeconds: Seconds,
    timeline: Timeline,
    id?: ElementId,
  ): AudioClip {
    if (
      !Number.isFinite(sourceDurationSeconds) ||
      sourceDurationSeconds <= 0
    ) {
      throw new Error("Invalid audio duration");
    }

    const clip = new AudioClip(
      row,
      startTick,
      timeline.durationSecondsToTicks(startTick, sourceDurationSeconds),
      sourceDurationSeconds,
      id,
    );
    clip.importTimeline = timeline;
    return clip;
  }

  get sourceDurationSeconds(): Seconds {
    return this._sourceDurationSeconds;
  }

  get durationSeconds(): Seconds {
    return this.sourceDurationSeconds;
  }

  override get durationTicks(): Tick {
    const timeline = this.grid?.container?.workspace?.timeline
      ?? this.importTimeline;

    return timeline
      ? timeline.durationSecondsToTicks(this.startTick, this.sourceDurationSeconds)
      : super.durationTicks;
  }
}
