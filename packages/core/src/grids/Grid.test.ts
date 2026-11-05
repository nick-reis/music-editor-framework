import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "../elements/MidiNote";
import { ToolId } from "../tools/ToolId";
import type { GridId } from "../types/ids";
import { Grid } from "./Grid";
import type { GridRow } from "./rows/GridRow";
import { AudioClip } from "../elements/AudioClip";
import { AudioGrid } from "./AudioGrid";
import { MoveElementsCommand } from "../commands/MoveElementsCommand";
import { MidiGrid } from "./MidiGrid";
import { EditorWorkspace } from "../workspace/EditorWorkspace";
import { GridContainer } from "./GridContainer";

describe("Grid", () => {
  class TestGrid extends Grid<MidiNote> {
    readonly supportedTools = new Set([ToolId.Pointer]);
    readonly toolFallbacks = {};

    constructor(rows: readonly GridRow[], id?: GridId) {
      super(rows, id);
    }
  }

  const rows: readonly GridRow[] = [
    { id: "row-1", label: "First" },
    { id: "row-2", label: "Second" },
  ];

  it("generates an ID when one is not supplied and preserves an explicit ID", () => {
    const generated = new TestGrid(rows);
    const explicit = new TestGrid(rows, "grid-1");

    expect(generated.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[4-9][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(explicit.id).toBe("grid-1");
  });

  it("reports row counts and looks up rows by index", () => {
    const grid = new TestGrid(rows);

    expect(grid.rowCount).toBe(2);
    expect(grid.getRow(0)).toEqual(rows[0]);
    expect(grid.getRow(1)).toEqual(rows[1]);
    expect(grid.getRow(-1)).toBeUndefined();
    expect(grid.getRow(2)).toBeUndefined();
  });

  it("rejects empty rows and duplicate row IDs", () => {
    expect(() => new TestGrid([])).toThrow("Grid must contain at least one row");
    expect(
      () =>
        new TestGrid([
          { id: "duplicate", label: "First" },
          { id: "duplicate", label: "Second" },
        ]),
    ).toThrow("Grid row IDs must be unique");
  });

  it("adds, looks up, lists, and removes elements", () => {
    const grid = new TestGrid(rows);
    const first = new MidiNote(0, 0, 120, "note-1");
    const second = new MidiNote(1, 120, 240, "note-2");

    grid.addElement(first);
    grid.addElement(second);

    expect(grid.getElement("note-1")).toBe(first);
    expect(grid.getElements()).toEqual([first, second]);
    expect(grid.removeElement("note-1")).toBe(true);
    expect(grid.removeElement("missing")).toBe(false);
    expect(grid.getElement("note-1")).toBeUndefined();
    expect(grid.getElements()).toEqual([second]);
  });

  it("rejects duplicate IDs and element rows outside the grid", () => {
    const grid = new TestGrid(rows);
    grid.addElement(new MidiNote(0, 0, 120, "note-1"));

    expect(() =>
      grid.addElement(new MidiNote(1, 120, 120, "note-1")),
    ).toThrow("Element note-1 already exists");
    expect(() => grid.addElement(new MidiNote(-1, 0, 120, "negative"))).toThrow(
      "Element row must be a non-negative integer",
    );
    expect(() => grid.addElement(new MidiNote(2, 0, 120, "too-large"))).toThrow(
      "Element row is outside grid bounds",
    );
    expect(() =>
      grid.addElement(new MidiNote(0.5, 0, 120, "fractional")),
    ).toThrow("Element row must be a non-negative integer");
  });
});

describe("Grid change notifications", () => {
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

describe("Grid hard locking", () => {
  const rows = [
    { id: "c4", label: "C4", pitch: 60 },
    { id: "d4", label: "D4", pitch: 62 },
  ];

  it("rejects removal of a locked element without changing ownership or subscriptions", () => {
    const grid = new MidiGrid(rows);
    const note = new MidiNote(0, 0, 240, "reference");
    grid.addElement(note);
    note.setLocked(true);
    const changes = vi.fn();
    grid.onChange(changes);

    expect(() => grid.removeElement(note.id)).toThrow(/locked/i);
    expect(grid.getElement(note.id)).toBe(note);
    expect(grid.getElements()).toEqual([note]);
    expect(changes).not.toHaveBeenCalled();

    note.setLocked(false);
    expect(grid.removeElement(note.id)).toBe(true);
    expect(grid.getElement(note.id)).toBeUndefined();
  });

  it("rejects an entire legacy multi-note move when any member is locked", () => {
    const grid = new MidiGrid(rows);
    const first = new MidiNote(0, 0, 120, "first");
    const second = new MidiNote(0, 120, 120, "second");
    grid.addElement(first);
    grid.addElement(second);
    second.setLocked(true);
    const changes = vi.fn();
    grid.onChange(changes);

    const command = new MoveElementsCommand([
      { grid, element: first, to: { tick: 480, row: 1 } },
      { grid, element: second, to: { tick: 600, row: 1 } },
    ]);

    expect(() => command.execute()).toThrow(/locked/i);
    expect([first.startTick, first.row, second.startTick, second.row])
      .toEqual([0, 0, 120, 0]);
    expect(changes).not.toHaveBeenCalled();
  });
});

describe("Grid ownership and scoped identities", () => {
  const rows = [{ id: "pitch-60", label: "C4", pitch: 60 }];

  function makeGrid(id: string): MidiGrid {
    return new MidiGrid(rows, id);
  }

  it("accepts elements without constructing a container or workspace", () => {
    const grid = makeGrid("piano");
    const note = new MidiNote(0, 0, 480, "note");

    expect(grid.container).toBeNull();
    expect(note.grid).toBeNull();

    grid.addElement(note);
    note.moveToTick(960);

    expect(note.grid).toBe(grid);
    expect(note.startTick).toBe(960);
    expect(grid.getElement("note")).toBe(note);
  });

  it("allows equal element IDs in different grids in the same workspace", () => {
    const first = makeGrid("piano");
    const second = makeGrid("guitar");
    const a = new MidiNote(0, 0, 480, "same-id");
    const b = new MidiNote(0, 480, 480, "same-id");
    const workspace = new EditorWorkspace([
      new GridContainer([first, second], "tracks"),
    ]);

    first.addElement(a);
    second.addElement(b);

    expect(workspace.getGrids()).toEqual([first, second]);
    expect(first.getElement("same-id")).toBe(a);
    expect(second.getElement("same-id")).toBe(b);
    expect(a.grid).toBe(first);
    expect(b.grid).toBe(second);
  });

  it("rejects duplicate IDs within one grid without reparenting the rejected note", () => {
    const grid = makeGrid("piano");
    const first = new MidiNote(0, 0, 480, "duplicate");
    const second = new MidiNote(0, 480, 480, "duplicate");
    grid.addElement(first);
    const listener = vi.fn();
    grid.onChange(listener);

    expect(() => grid.addElement(second)).toThrow("Element duplicate already exists");
    expect(grid.getElements()).toEqual([first]);
    expect(second.grid).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not allow the same note object in multiple grids", () => {
    const piano = makeGrid("piano");
    const guitar = makeGrid("guitar");
    const note = new MidiNote(0, 0, 480, "shared");

    piano.addElement(note);

    expect(() => guitar.addElement(note)).toThrow(/already belongs to a grid/);
    expect(note.grid).toBe(piano);
    expect(guitar.getElements()).toEqual([]);
  });

  it("releases element ownership on removal and allows reattachment", () => {
    const piano = makeGrid("piano");
    const guitar = makeGrid("guitar");
    const note = new MidiNote(0, 0, 480, "reusable");
    piano.addElement(note);

    expect(piano.removeElement(note.id)).toBe(true);
    expect(note.grid).toBeNull();

    guitar.addElement(note);

    expect(note.grid).toBe(guitar);
    expect(guitar.getElement(note.id)).toBe(note);
  });

  it("stops forwarding events from removed elements", () => {
    const piano = makeGrid("piano");
    const note = new MidiNote(0, 0, 480, "note");
    piano.addElement(note);
    piano.removeElement(note.id);
    const listener = vi.fn();
    piano.onChange(listener);

    note.moveToTick(240);

    expect(listener).not.toHaveBeenCalled();
  });
});
