import { Grid } from "./Grid";
import { ToolId } from "../tools/ToolId";
import type { GridId, ElementId } from "../types/ids";
import type { EditableElement } from "../elements/EditableElement";
import type { RowIndex } from "../types/coordinates";
import type { Position, Seconds } from "../types/time";
import { AudioClip } from "../elements/AudioClip";
import type { GridRow } from "./rows/GridRow";

/** Audio remains native-time for source duration; start uses project coordinates. */
export interface AudioClipCreation {
  readonly row: RowIndex;
  readonly start: Position;
  readonly sourceDurationSeconds: Seconds;
  readonly id?: ElementId;
}

export class AudioGrid<TRow extends GridRow = GridRow> extends Grid<
  AudioClip,
  TRow
> {
  readonly supportedTools: ReadonlySet<ToolId> = new Set([
    ToolId.Pointer,
    ToolId.Eraser,
  ]);

  readonly toolFallbacks: Readonly<Partial<Record<ToolId, ToolId>>> = {
    [ToolId.Brush]: ToolId.Pointer,
  };

  protected override acceptsTransferredElement(element: EditableElement): boolean {
    return element instanceof AudioClip;
  }

  constructor(rows: readonly TRow[], id?: GridId) {
    super(rows, id);
  }

  /** Creates and attaches an audio clip using this grid's authoritative timeline. */
  createElement(input: AudioClipCreation): AudioClip {
    const timeline = this.requireTimeline();
    const startTick = timeline.toTick(input.start);
    const clip = AudioClip.fromSeconds(
      input.row, startTick, input.sourceDurationSeconds, timeline, input.id,
    );
    this.addElement(clip);
    return clip;
  }
}
