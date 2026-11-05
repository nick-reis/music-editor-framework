import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "./MidiNote";
import { AudioClip } from "./AudioClip";

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

  it("requires an explicit unlock before changing position or duration", () => {
    const note = new MidiNote(0, 120, 240, "note-1");
    note.locked = true;

    expect(() => note.moveToTick(480)).toThrow(/locked/i);
    expect(() => note.resizeToDuration(360)).toThrow(/locked/i);
    expect(note.startTick).toBe(120);
    expect(note.durationTicks).toBe(240);

    note.setLocked(false);
    note.moveToTick(480);
    note.resizeToDuration(360);

    expect(note.locked).toBe(false);
    expect(note.startTick).toBe(480);
    expect(note.durationTicks).toBe(360);
  });
});

describe("EditableElement change notifications", () => {
  it("notifies listeners when an element moves", () => {
    const note = new MidiNote(0, 120, 240, "note-1");
    const listener = vi.fn();

    note.onChange(listener);
    note.moveToTick(480);

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      elementId: "note-1",
      properties: ["startTick"],
    });
  });

  it("notifies listeners when an element resizes", () => {
    const note = new MidiNote(0, 120, 240, "note-1");
    const listener = vi.fn();

    note.onChange(listener);
    note.resizeToDuration(480);

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      elementId: "note-1",
      properties: ["durationTicks"],
    });
  });

  it("observes direct property assignments", () => {
    const note = new MidiNote(0, 120, 240, "note-1");
    const listener = vi.fn();

    note.onChange(listener);

    note.row = 2;
    note.locked = true;

    expect(listener).toHaveBeenNthCalledWith(1, {
      elementId: "note-1",
      properties: ["row"],
    });

    expect(listener).toHaveBeenNthCalledWith(2, {
      elementId: "note-1",
      properties: ["locked"],
    });
  });

  it("does not notify listeners for unchanged values", () => {
    const note = new MidiNote(0, 120, 240, "note-1");
    const listener = vi.fn();

    note.onChange(listener);

    note.moveToTick(120);
    note.resizeToDuration(240);
    note.row = 0;
    note.locked = false;

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not notify listeners when validation fails", () => {
    const note = new MidiNote(0, 120, 240, "note-1");
    const listener = vi.fn();

    note.onChange(listener);

    expect(() => note.moveToTick(NaN)).toThrow();
    expect(() => note.resizeToDuration(-1)).toThrow();

    expect(listener).not.toHaveBeenCalled();
    expect(note.startTick).toBe(120);
    expect(note.durationTicks).toBe(240);
  });

  it("stops notifying after unsubscribing", () => {
    const note = new MidiNote(0, 120, 240, "note-1");
    const listener = vi.fn();

    const unsubscribe = note.onChange(listener);

    note.moveToTick(480);
    unsubscribe();
    note.moveToTick(960);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("supports notifications inherited by AudioClip", () => {
    const clip = new AudioClip(0, 0, 120, 1, "clip-1");
    const listener = vi.fn();

    clip.onChange(listener);
    clip.syncToTempo(240);

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      elementId: "clip-1",
      properties: ["durationTicks"],
    });
  });
});

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
