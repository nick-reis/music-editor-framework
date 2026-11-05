import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "../elements/MidiNote";
import { AudioClip } from "../elements/AudioClip";
import { AudioGrid } from "./AudioGrid";
import { Grid } from "./Grid";
import { ToolId } from "../tools/ToolId";

class TestGrid extends Grid<MidiNote> {
  readonly supportedTools = new Set([ToolId.Pointer]);
  readonly toolFallbacks = {};

  constructor() {
    super(
      [
        { id: "row-0", label: "First" },
        { id: "row-1", label: "Second" },
      ],
      "grid-1",
    );
  }
}

describe("Grid change notifications", () => {
  it("notifies when an element is added", () => {
    const grid = new TestGrid();
    const listener = vi.fn();

    grid.onChange(listener);
    grid.addElement(new MidiNote(0, 120, 240, "note-1"));

    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "element-added",
      elementId: "note-1",
    }]);
  });

  it("forwards element property changes", () => {
    const grid = new TestGrid();
    const note = new MidiNote(0, 120, 240, "note-1");

    grid.addElement(note);

    const listener = vi.fn();
    grid.onChange(listener);

    note.moveToTick(480);
    note.resizeToDuration(360);
    note.row = 1;
    note.setLocked(true);

    expect(listener).toHaveBeenNthCalledWith(1, [{
      type: "element-updated",
      elementId: "note-1",
      properties: ["startTick"],
    }]);

    expect(listener).toHaveBeenNthCalledWith(2, [{
      type: "element-updated",
      elementId: "note-1",
      properties: ["durationTicks"],
    }]);

    expect(listener).toHaveBeenNthCalledWith(3, [{
      type: "element-updated",
      elementId: "note-1",
      properties: ["row"],
    }]);

    expect(listener).toHaveBeenNthCalledWith(4, [{
      type: "element-updated",
      elementId: "note-1",
      properties: ["locked"],
    }]);

    expect(() => { note.row = 0; }).toThrow(/locked/i);
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it("notifies when an element is removed", () => {
    const grid = new TestGrid();
    const note = new MidiNote(0, 0, 120, "note-1");

    grid.addElement(note);

    const listener = vi.fn();
    grid.onChange(listener);

    expect(grid.removeElement(note.id)).toBe(true);

    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "element-removed",
      elementId: "note-1",
    }]);
  });

  it("stops forwarding changes after removal", () => {
    const grid = new TestGrid();
    const note = new MidiNote(0, 0, 120, "note-1");

    grid.addElement(note);
    grid.removeElement(note.id);

    const listener = vi.fn();
    grid.onChange(listener);

    note.moveToTick(480);

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not emit changes for unsuccessful removals", () => {
    const grid = new TestGrid();
    const listener = vi.fn();

    grid.onChange(listener);

    expect(grid.removeElement("missing")).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not emit changes for rejected additions", () => {
    const grid = new TestGrid();

    grid.addElement(new MidiNote(0, 0, 120, "note-1"));

    const listener = vi.fn();
    grid.onChange(listener);

    expect(() => {
      grid.addElement(new MidiNote(0, 0, 120, "note-1"));
    }).toThrow();

    expect(() => {
      grid.addElement(new MidiNote(5, 0, 120, "invalid"));
    }).toThrow();

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not forward unchanged element values", () => {
    const grid = new TestGrid();
    const note = new MidiNote(0, 120, 240, "note-1");

    grid.addElement(note);

    const listener = vi.fn();
    grid.onChange(listener);

    note.moveToTick(120);
    note.resizeToDuration(240);

    expect(listener).not.toHaveBeenCalled();
  });

  it("allows listeners to unsubscribe from the grid", () => {
    const grid = new TestGrid();
    const listener = vi.fn();

    const unsubscribe = grid.onChange(listener);

    grid.addElement(new MidiNote(0, 0, 120, "note-1"));
    unsubscribe();
    grid.addElement(new MidiNote(0, 120, 120, "note-2"));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate subscriptions when re-adding an element", () => {
    const grid = new TestGrid();
    const note = new MidiNote(0, 0, 120, "note-1");

    grid.addElement(note);
    grid.removeElement(note.id);
    grid.addElement(note);

    const listener = vi.fn();
    grid.onChange(listener);

    note.moveToTick(480);

    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "element-updated",
      elementId: "note-1",
      properties: ["startTick"],
    }]);
  });

  it("does not forward changes from a replaced element", () => {
    const grid = new TestGrid();
    const oldNote = new MidiNote(0, 0, 120, "note-1");
    const newNote = new MidiNote(0, 120, 120, "note-1");

    grid.addElement(oldNote);
    grid.removeElement(oldNote.id);
    grid.addElement(newNote);

    const listener = vi.fn();
    grid.onChange(listener);

    oldNote.moveToTick(480);
    newNote.moveToTick(960);

    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "element-updated",
      elementId: "note-1",
      properties: ["startTick"],
    }]);
  });

  it("supports AudioGrid through the same base implementation", () => {
    const grid = new AudioGrid(
      [{ id: "audio-row", label: "Audio" }],
      "audio-grid",
    );

    const clip = new AudioClip(0, 0, 120, 1, "clip-1");

    grid.addElement(clip);

    const listener = vi.fn();
    grid.onChange(listener);

    clip.syncToTempo(240);

    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "element-updated",
      elementId: "clip-1",
      properties: ["durationTicks"],
    }]);
  });

  it("rejects out-of-range row assignments on attached elements", () => {
    const grid = new TestGrid();
    const note = new MidiNote(0, 0, 120, "note-1");
    grid.addElement(note);
    const listener = vi.fn();
    grid.onChange(listener);

    expect(() => { note.row = grid.rowCount; }).toThrow(
      "Element row is outside grid bounds",
    );
    expect(note.row).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });
});
