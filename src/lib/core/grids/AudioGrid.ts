import { Grid } from "./Grid";
import { ToolId } from "../tools/ToolId";
import type { GridId } from "../types/ids";
import type { AudioClip } from "../elements/AudioClip";
import type { GridRow } from "./rows/GridRow";

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

  constructor(rows: readonly TRow[], id?: GridId) {
    super(rows, id);
  }
}
