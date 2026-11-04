import { describe, expect, it } from "vitest";
import { MidiNote } from "./MidiNote";

describe("EditableElement behavior through MidiNote", () => {
  it("initializes identifiers, row, start tick, and duration", () => {
    const note = new MidiNote(3, 120, 240, "note-1");

    expect(note.id).toBe("note-1");
    expect(note.row).toBe(3);
    expect(note.startTick).toBe(120);
    expect(note.durationTicks).toBe(240);
  });

  it("returns start and end ticks", () => {
    const note = new MidiNote(0, 120, 240, "note-1");

    expect(note.getStartTick()).toBe(120);
    expect(note.getEndTick()).toBe(360);
  });

  it("moves without changing duration", () => {
    const note = new MidiNote(0, 120, 240, "note-1");

    note.moveToTick(480);

    expect(note.getStartTick()).toBe(480);
    expect(note.durationTicks).toBe(240);
  });

  it.each([
    [Number.NaN, 240],
    [Number.POSITIVE_INFINITY, 240],
    [120, 0],
    [120, -1],
    [120, Number.NaN],
  ])("rejects invalid timing values (%s, %s)", (startTick, durationTicks) => {
    expect(() => new MidiNote(0, startTick, durationTicks, "note-1")).toThrow(
      "Invalid element timing",
    );
  });

  it("preserves existing locking behavior", () => {
    const note = new MidiNote(0, 120, 240, "note-1");
    note.locked = true;

    note.moveToTick(480);
    note.resizeToDuration(360);

    expect(note.locked).toBe(true);
    expect(note.startTick).toBe(480);
    expect(note.durationTicks).toBe(360);
  });
});
