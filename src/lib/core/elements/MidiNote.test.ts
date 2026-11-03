import { describe, expect, it } from "vitest";
import { MidiNote } from "./MidiNote";

describe("MidiNote", () => {
  it("is resizable and changes duration without changing start tick", () => {
    const note = new MidiNote("note-1", 2, 240, 120);

    expect(note.resizable).toBe(true);
    note.resizeToDuration(360);

    expect(note.startTick).toBe(240);
    expect(note.durationTicks).toBe(360);
    expect(note.getEndTick()).toBe(600);
  });

  it("rejects invalid resized durations", () => {
    const note = new MidiNote("note-1", 0, 0, 120);

    expect(() => note.resizeToDuration(0)).toThrow("Invalid element timing");
    expect(() => note.resizeToDuration(Number.NaN)).toThrow(
      "Invalid element timing",
    );
  });
});
