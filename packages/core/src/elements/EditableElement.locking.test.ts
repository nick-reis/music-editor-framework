import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "./MidiNote";
import { AudioClip } from "./AudioClip";

describe("EditableElement hard locking", () => {
  it("blocks direct movement, row changes and resizing when locked", () => {
    const note = new MidiNote(0, 120, 240, "locked-note");
    const changes = vi.fn();
    note.onChange(changes);
    note.setLocked(true);
    changes.mockClear();

    expect(() => note.moveToTick(480)).toThrow(/locked/i);
    expect(() => { note.row = 1; }).toThrow(/locked/i);
    expect(() => note.resizeToDuration(480)).toThrow(/locked/i);

    expect([note.startTick, note.row, note.durationTicks]).toEqual([120, 0, 240]);
    expect(changes).not.toHaveBeenCalled();
  });

  it("keeps no-op edits harmless and silent even while locked", () => {
    const note = new MidiNote(0, 120, 240, "same-note");
    note.setLocked(true);
    const changes = vi.fn();
    note.onChange(changes);

    note.moveToTick(120);
    note.row = 0;
    note.resizeToDuration(240);
    note.setLocked(true);

    expect(changes).not.toHaveBeenCalled();
  });

  it("requires an explicit unlock before changes become legal", () => {
    const note = new MidiNote(0, 0, 120, "author-note");
    const changes = vi.fn();
    note.onChange(changes);

    note.setLocked(true);
    expect(note.locked).toBe(true);
    expect(() => note.moveToTick(240)).toThrow(/locked/i);

    note.setLocked(false);
    note.moveToTick(240);
    note.row = 1;
    note.resizeToDuration(360);

    expect([note.locked, note.startTick, note.row, note.durationTicks])
      .toEqual([false, 240, 1, 360]);
    expect(changes).toHaveBeenCalledWith({
      elementId: "author-note",
      properties: ["locked"],
    });
  });

  it("retains a lock-enforcing property setter for compatibility", () => {
    const note = new MidiNote(0, 0, 120);
    note.locked = true;
    expect(() => note.moveToTick(240)).toThrow(/locked/i);
    note.locked = false;
    expect(() => note.moveToTick(240)).not.toThrow();
  });

  it("does not let a subclass bypass locking via updateTiming", () => {
    class CustomNote extends MidiNote {
      retime(startTick: number, durationTicks: number) {
        this.updateTiming(startTick, durationTicks);
      }
    }
    const note = new CustomNote(0, 10, 120);
    note.setLocked(true);

    expect(() => note.retime(20, 240)).toThrow(/locked/i);
    expect([note.startTick, note.durationTicks]).toEqual([10, 120]);
  });

  it("currently blocks audio tick projection changes while locked", () => {
    const clip = new AudioClip(0, 0, 480, 2, "audio-clip");
    clip.setLocked(true);

    expect(() => clip.syncToTempo(960)).toThrow(/locked/i);
    expect(clip.durationSeconds).toBe(2);
    expect(clip.durationTicks).toBe(480);
  });
});
