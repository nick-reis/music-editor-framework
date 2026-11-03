import { describe, expect, it } from "vitest";
import { AudioClip } from "../elements/AudioClip";
import { ToolId } from "../tools/ToolId";
import { AudioGrid } from "./AudioGrid";
import type { GridRow } from "./rows/GridRow";

type AudioRow = GridRow & { channel: "music" | "effects" };

const rows: readonly AudioRow[] = [
  { id: "music", label: "Music", channel: "music" },
  { id: "effects", label: "Effects", channel: "effects" },
];

describe("AudioGrid", () => {
  it("supports custom audio row configurations", () => {
    const grid = new AudioGrid<AudioRow>(rows, "audio-grid");

    expect(grid.id).toBe("audio-grid");
    expect(grid.rowCount).toBe(2);
    expect(grid.getRow(1)).toEqual(rows[1]);
    expect(grid.getRow(1)?.channel).toBe("effects");
  });

  it("supports pointer and eraser, and falls back from brush to pointer", () => {
    const grid = new AudioGrid(rows);

    expect(grid.supportedTools).toEqual(new Set([ToolId.Pointer, ToolId.Eraser]));
    expect(grid.toolFallbacks).toEqual({ [ToolId.Brush]: ToolId.Pointer });
    expect(grid.toolFallbacks[ToolId.Brush]).toBe(ToolId.Pointer);
  });

  it("adds audio clips and rejects clips outside configured rows", () => {
    const grid = new AudioGrid(rows);
    const clip = new AudioClip(0, 0, 480, 1, "clip-1");

    grid.addElement(clip);

    expect(grid.getElement("clip-1")).toBe(clip);
    expect(() =>
      grid.addElement(new AudioClip(2, 0, 480, 1, "invalid-clip")),
    ).toThrow("Element row is outside grid bounds");
  });
});
