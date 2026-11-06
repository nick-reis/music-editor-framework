import { Grid } from "./Grid";
import { ToolId } from "../tools/ToolId";
import type { GridId, ElementId } from "../types/ids";
import type { EditableElement } from "../elements/EditableElement";
import type { RowIndex } from "../types/coordinates";
import type { Position, Duration } from "../types/time";
import { MidiNote } from "../elements/MidiNote";
import type { MidiRow } from "./rows/MidiRow";

/** Preferred, project-relative way to create a MIDI note on its owning grid. */
export interface MidiNoteCreation {
  readonly row: RowIndex;
  readonly start: Position;
  readonly duration: Duration;
  readonly id?: ElementId;
}

export class MidiGrid<TRow extends MidiRow = MidiRow> extends Grid<
  MidiNote,
  TRow
> {
  readonly supportedTools: ReadonlySet<ToolId> = new Set([
    ToolId.Pointer,
    ToolId.Brush,
    ToolId.Eraser,
  ]);

  readonly toolFallbacks: Readonly<Partial<Record<ToolId, ToolId>>> = {};

  protected override acceptsTransferredElement(element: EditableElement): boolean {
    return element instanceof MidiNote;
  }

  constructor(rows: readonly TRow[], id?: GridId) {
    super(rows, id);
  }

  /** Creates and attaches the note atomically using this grid's workspace timeline. */
  createElement(input: MidiNoteCreation): MidiNote {
    const timeline = this.requireTimeline();
    const startTick = timeline.toTick(input.start);
    const durationTicks = timeline.toTickDuration(input.duration, startTick);
    timeline.assertInterval(startTick, durationTicks);

    const note = new MidiNote(input.row, startTick, durationTicks, input.id);
    this.addElement(note);
    return note;
  }
}
