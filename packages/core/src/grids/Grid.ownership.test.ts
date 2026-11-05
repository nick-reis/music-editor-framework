import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "../elements/MidiNote";
import { EditorWorkspace } from "../workspace/EditorWorkspace";
import { GridContainer } from "./GridContainer";
import { MidiGrid } from "./MidiGrid";

const rows = [{ id: "pitch-60", label: "C4", pitch: 60 }];

function makeGrid(id: string): MidiGrid {
  return new MidiGrid(rows, id);
}

describe("Grid ownership and scoped identities", () => {
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
