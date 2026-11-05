import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "../elements/MidiNote";
import { MutationCapture } from "./MutationCapture";

describe("MutationCapture", () => {
  it("records element state changes with their before and after values", () => {
    const note = new MidiNote(0, 120, 240, "note");
    const capture = new MutationCapture();

    const result = capture.run(() => {
      note.moveToTick(480);
      return "completed";
    });

    expect(result).toBe("completed");
    expect(capture.mutations).toHaveLength(1);
    expect(capture.mutations[0].target).toBe(note);
    expect(capture.mutations[0].before).toMatchObject({
      row: 0,
      startTick: 120,
      durationTicks: 240,
      locked: false,
    });
    expect(capture.mutations[0].after).toMatchObject({
      row: 0,
      startTick: 480,
      durationTicks: 240,
      locked: false,
    });
    expect(Object.isFrozen(capture.mutations[0].before)).toBe(true);
    expect(Object.isFrozen(capture.mutations[0].after)).toBe(true);
  });

  it("does not record ordinary mutations made outside capture", () => {
    const note = new MidiNote(0, 0, 120);
    note.moveToTick(240);

    const capture = new MutationCapture();
    capture.run(() => note.moveToTick(480));

    note.moveToTick(720);

    expect(capture.mutations).toHaveLength(1);
    expect(capture.mutations[0].before).toMatchObject({ startTick: 240 });
    expect(capture.mutations[0].after).toMatchObject({ startTick: 480 });
  });

  it("does not record no-op changes", () => {
    const note = new MidiNote(0, 0, 120);
    const capture = new MutationCapture();

    capture.run(() => {
      note.moveToTick(0);
      note.resizeToDuration(120);
      note.row = 0;
      note.locked = false;
    });

    expect(capture.mutations).toHaveLength(0);
  });

  it("supports sequential changes to one element in recorded order", () => {
    const note = new MidiNote(0, 0, 120);
    const capture = new MutationCapture();

    capture.run(() => {
      note.moveToTick(240);
      note.moveToTick(480);
      note.resizeToDuration(360);
    });

    expect(capture.mutations).toHaveLength(3);
    expect(capture.mutations[0].before).toMatchObject({ startTick: 0 });
    expect(capture.mutations[0].after).toMatchObject({ startTick: 240 });
    expect(capture.mutations[1].before).toMatchObject({ startTick: 240 });
    expect(capture.mutations[1].after).toMatchObject({ startTick: 480 });
    expect(capture.mutations[2].before).toMatchObject({ durationTicks: 120 });
    expect(capture.mutations[2].after).toMatchObject({ durationTicks: 360 });
  });

  it("does not record invalid mutations and preserves state", () => {
    const note = new MidiNote(0, 0, 120);
    const capture = new MutationCapture();

    capture.run(() => {
      expect(() => note.resizeToDuration(0)).toThrow("Invalid element timing");
      expect(() => note.moveToTick(Number.NaN)).toThrow("Invalid element timing");
      note.moveToTick(240);
    });

    expect(capture.mutations).toHaveLength(1);
    expect(note.startTick).toBe(240);
    expect(note.durationTicks).toBe(120);
  });

  it("rejects out-of-scope mutations before modifying the target", () => {
    const allowed = new MidiNote(0, 0, 120, "allowed");
    const outside = new MidiNote(0, 0, 120, "outside");
    const capture = new MutationCapture((target) => target === allowed);
    const listener = vi.fn();
    outside.onChange(listener);

    capture.run(() => {
      allowed.moveToTick(240);
      expect(() => outside.moveToTick(480)).toThrow(/outside the recording scope/);
    });

    expect(capture.mutations).toHaveLength(1);
    expect(allowed.startTick).toBe(240);
    expect(outside.startTick).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it("rejects nested captures while leaving the outer capture functional", () => {
    const note = new MidiNote(0, 0, 120);
    const outer = new MutationCapture();
    const inner = new MutationCapture();

    outer.run(() => {
      expect(() => inner.run(() => note.moveToTick(240))).toThrow(
        "A mutation capture is already active",
      );
      note.moveToTick(480);
    });

    expect(outer.mutations).toHaveLength(1);
    expect(inner.mutations).toHaveLength(0);
    expect(note.startTick).toBe(480);
  });

  it("allows a capture rejected as nested to run after the outer capture ends", () => {
    const note = new MidiNote(0, 0, 120);
    const outer = new MutationCapture();
    const inner = new MutationCapture();

    outer.run(() => {
      expect(() => inner.run(() => undefined)).toThrow(/already active/);
    });

    inner.run(() => note.moveToTick(240));

    expect(inner.mutations).toHaveLength(1);
  });

  it("rejects reusing the same capture", () => {
    const capture = new MutationCapture();
    capture.run(() => "first");

    expect(() => capture.run(() => "second")).toThrow(/already been used/);
  });

  it("retains successful changes when a callback throws and clears the active capture", () => {
    const note = new MidiNote(0, 0, 120);
    const capture = new MutationCapture();

    expect(() => capture.run(() => {
      note.moveToTick(240);
      throw new Error("operation failed");
    })).toThrow("operation failed");

    expect(note.startTick).toBe(240);
    expect(capture.mutations).toHaveLength(1);
    expect(MutationCapture.recording).toBe(false);

    const later = new MutationCapture();
    later.run(() => note.moveToTick(480));
    expect(later.mutations).toHaveLength(1);
  });

  it("refuses asynchronous callbacks without leaving recording active", () => {
    const capture = new MutationCapture();

    expect(() => capture.run(() => Promise.resolve("later"))).toThrow(
      "Mutation capture must be synchronous",
    );

    expect(MutationCapture.recording).toBe(false);
    const next = new MutationCapture();
    expect(() => next.run(() => undefined)).not.toThrow();
  });

  it("exposes a frozen copy of the mutation list", () => {
    const note = new MidiNote(0, 0, 120);
    const capture = new MutationCapture();

    capture.run(() => note.moveToTick(240));

    const snapshot = capture.mutations;
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Reflect.set(snapshot, 0, undefined)).toBe(false);
    expect(capture.mutations).toHaveLength(1);
  });

  it("replays a single mutation with normal element notifications", () => {
    const note = new MidiNote(0, 120, 240, "note");
    const capture = new MutationCapture();
    capture.run(() => note.moveToTick(480));
    const listener = vi.fn();
    note.onChange(listener);

    const mutation = capture.mutations[0];
    mutation.undo();
    mutation.redo();

    expect(note.startTick).toBe(480);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, {
      elementId: "note",
      properties: ["startTick"],
    });
    expect(listener).toHaveBeenNthCalledWith(2, {
      elementId: "note",
      properties: ["startTick"],
    });
    expect(capture.mutations).toHaveLength(1);
  });

  it("can reverse multiple mutations when undone in reverse order", () => {
    const note = new MidiNote(0, 0, 120);
    const capture = new MutationCapture();
    capture.run(() => {
      note.moveToTick(480);
      note.row = 2;
      note.resizeToDuration(240);
    });

    for (const mutation of [...capture.mutations].reverse()) mutation.undo();
    expect([note.startTick, note.row, note.durationTicks]).toEqual([0, 0, 120]);

    for (const mutation of capture.mutations) mutation.redo();
    expect([note.startTick, note.row, note.durationTicks]).toEqual([480, 2, 240]);
  });

  it("detects an intervening edit even when the original value is restored", () => {
    const note = new MidiNote(0, 0, 120);
    const capture = new MutationCapture();
    capture.run(() => note.moveToTick(480));

    note.moveToTick(240);
    note.moveToTick(480);

    expect(() => capture.mutations[0].undo()).toThrow(
      /modified outside this mutation/,
    );
    expect(note.startTick).toBe(480);
  });

  it("prevents mutation replay inside another active capture", () => {
    const note = new MidiNote(0, 0, 120);
    const first = new MutationCapture();
    first.run(() => note.moveToTick(480));
    const second = new MutationCapture();

    second.run(() => {
      expect(() => first.mutations[0].undo()).toThrow(
        /Cannot replay during mutation capture/,
      );
    });

    expect(note.startTick).toBe(480);
    expect(second.mutations).toHaveLength(0);
  });

  it("respects hard locking when replaying previously recorded edits", () => {
    const note = new MidiNote(0, 0, 120);
    const capture = new MutationCapture();
    capture.run(() => note.moveToTick(480));
    note.setLocked(true);

    expect(() => capture.mutations[0].undo()).toThrow(
      /modified outside this mutation/,
    );
    expect(note.startTick).toBe(480);

    note.setLocked(false);
    expect(() => capture.mutations[0].undo()).toThrow(
      /modified outside this mutation/,
    );
  });

  it("captures reversible lock state changes", () => {
    const note = new MidiNote(0, 0, 120, "locked");
    const capture = new MutationCapture();

    capture.run(() => note.locked = true);

    const mutation = capture.mutations[0];
    expect(note.locked).toBe(true);
    expect(mutation.before).toMatchObject({ locked: false });
    expect(mutation.after).toMatchObject({ locked: true });

    mutation.undo();
    expect(note.locked).toBe(false);
    mutation.redo();
    expect(note.locked).toBe(true);
  });
});
