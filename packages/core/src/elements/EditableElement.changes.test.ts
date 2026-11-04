import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "./MidiNote";
import { AudioClip } from "./AudioClip";

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
