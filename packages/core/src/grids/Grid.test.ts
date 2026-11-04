import { describe, expect, it } from "vitest";
import { MidiNote } from "../elements/MidiNote";
import { ToolId } from "../tools/ToolId";
import type { GridId } from "../types/ids";
import { Grid } from "./Grid";
import type { GridRow } from "./rows/GridRow";

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

describe("Grid", () => {
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
