import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "./MidiNote";
import { AudioClip } from "./AudioClip";
import { EditableElement } from "./EditableElement";
import { MutationCapture } from "../mutations/MutationCapture";

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

  it("supports ordinary movement notifications inherited by AudioClip", () => {
    const clip = new AudioClip(0, 0, 120, 1, "clip-1");
    const listener = vi.fn();

    clip.onChange(listener);
    clip.moveToTick(240);

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      elementId: "clip-1",
      properties: ["startTick"],
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

  it("keeps locked audio immutable but allows derived tick duration changes", () => {
    const clip = new AudioClip(0, 0, 480, 2, "audio-clip");
    clip.setLocked(true);

    expect(() => clip.moveToTick(960)).toThrow(/locked/i);
    expect(clip.durationSeconds).toBe(2);
    expect(clip.durationTicks).toBe(480);
  });
});


describe("EditableElement custom state extension", () => {
  class VelocityNote extends EditableElement<{ velocity: number }> {
    readonly resizable = true;

    constructor(velocity = 100, id = "velocity-note") {
      super({
        row: 0,
        startTick: 0,
        durationTicks: 120,
        velocity,
      }, id);
    }

    get velocity(): number {
      return this.state.velocity;
    }

    set velocity(value: number) {
      if (!Number.isInteger(value) || value < 0 || value > 127) {
        throw new RangeError("Invalid velocity");
      }

      this.updateState({ velocity: value });
    }

    retime(startTick: number, durationTicks: number): void {
      this.updateTiming(startTick, durationTicks);
    }
  }

  it("initializes custom state while inheriting the shared element state", () => {
    const note = new VelocityNote(90);

    expect(note.velocity).toBe(90);
    expect(note.startTick).toBe(0);
    expect(note.durationTicks).toBe(120);
    expect(note.locked).toBe(false);
  });

  it("updates custom properties through a normal setter", () => {
    const note = new VelocityNote();
    note.velocity = 112;
    expect(note.velocity).toBe(112);
  });

  it("notifies observers when a custom state property changes", () => {
    const note = new VelocityNote();
    const listener = vi.fn();
    note.onChange(listener);

    note.velocity = 108;

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      elementId: "velocity-note",
      properties: ["velocity"],
    });
  });

  it("captures custom property mutations without subclass history code", () => {
    const note = new VelocityNote();
    const capture = new MutationCapture();

    capture.run(() => {
      note.velocity = 110;
      note.moveToTick(240);
    });

    expect(capture.mutations).toHaveLength(2);
    expect(capture.mutations[0].before).toMatchObject({ velocity: 100 });
    expect(capture.mutations[0].after).toMatchObject({ velocity: 110 });
    expect(capture.mutations[1].before).toMatchObject({ startTick: 0 });
    expect(capture.mutations[1].after).toMatchObject({ startTick: 240 });

    for (const mutation of [...capture.mutations].reverse()) mutation.undo();
    expect([note.velocity, note.startTick]).toEqual([100, 0]);

    for (const mutation of capture.mutations) mutation.redo();
    expect([note.velocity, note.startTick]).toEqual([110, 240]);
  });

  it("rejects invalid custom values before recording or notifying", () => {
    const note = new VelocityNote();
    const capture = new MutationCapture();
    const listener = vi.fn();
    note.onChange(listener);

    capture.run(() => {
      expect(() => { note.velocity = 128; }).toThrow("Invalid velocity");
      expect(() => { note.velocity = -1; }).toThrow("Invalid velocity");
      expect(() => { note.velocity = 1.5; }).toThrow("Invalid velocity");
      expect(() => { note.velocity = Number.NaN; }).toThrow("Invalid velocity");
    });

    expect(note.velocity).toBe(100);
    expect(capture.mutations).toHaveLength(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it("prevents custom property changes on locked elements", () => {
    const note = new VelocityNote();
    note.locked = true;
    const listener = vi.fn();
    note.onChange(listener);

    expect(() => { note.velocity = 101; }).toThrow(/locked/);
    expect(note.velocity).toBe(100);
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not produce a mutation for a no-op custom setter", () => {
    const note = new VelocityNote(100);
    const capture = new MutationCapture();
    const listener = vi.fn();
    note.onChange(listener);

    capture.run(() => { note.velocity = 100; });

    expect(capture.mutations).toHaveLength(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it("rejects invalid shared timing in combined updates without partial changes", () => {
    const note = new VelocityNote();
    const listener = vi.fn();
    note.onChange(listener);

    expect(() => note.retime(480, -1)).toThrow("Invalid element timing");

    expect(note.startTick).toBe(0);
    expect(note.durationTicks).toBe(120);
    expect(listener).not.toHaveBeenCalled();

    note.retime(480, 240);
    expect([note.startTick, note.durationTicks]).toEqual([480, 240]);
    expect(listener).toHaveBeenCalledExactlyOnceWith({
      elementId: "velocity-note",
      properties: ["startTick", "durationTicks"],
    });
  });
});
