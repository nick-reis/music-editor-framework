import { Grid } from "./Grid";
import { ToolId } from "../tools/ToolId";
import type { GridId } from "../types/ids";
import type { MidiNote } from "../elements/MidiNote";
import type { MidiRow } from "./rows/MidiRow";

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

  constructor(rows: readonly TRow[], id?: GridId) {
    super(rows, id);
  }
}
