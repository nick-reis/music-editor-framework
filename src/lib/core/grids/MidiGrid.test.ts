import { describe, expect, it } from "vitest";
import { MidiNote } from "../elements/MidiNote";
import { ToolId } from "../tools/ToolId";
import { MidiGrid } from "./MidiGrid";
import type { MidiRow } from "./rows/MidiRow";

type CustomMidiRow = MidiRow & { clef: "treble" | "bass" };

const rows: readonly CustomMidiRow[] = [
  { id: "c4", label: "C4", pitch: 60, clef: "treble" },
  { id: "d4", label: "D4", pitch: 62, clef: "treble" },
];

describe("MidiGrid", () => {
  it("supports custom MIDI row types and explicit IDs", () => {
    const grid = new MidiGrid<CustomMidiRow>(rows, "midi-grid");

    expect(grid.id).toBe("midi-grid");
    expect(grid.rows).toEqual(rows);
    expect(grid.getRow(0)?.pitch).toBe(60);
    expect(grid.getRow(1)?.clef).toBe("treble");
  });

  it("supports pointer, brush, and eraser tools without fallbacks", () => {
    const grid = new MidiGrid(rows);

    expect(grid.supportedTools).toEqual(
      new Set([ToolId.Pointer, ToolId.Brush, ToolId.Eraser]),
    );
    expect(grid.toolFallbacks).toEqual({});
    expect(grid.toolFallbacks[ToolId.Brush]).toBeUndefined();
  });

  it("accepts MIDI notes at valid row positions", () => {
    const grid = new MidiGrid(rows);
    const note = new MidiNote(1, 0, 480, "note-1");

    grid.addElement(note);

    expect(grid.getElement("note-1")).toBe(note);
  });
});
