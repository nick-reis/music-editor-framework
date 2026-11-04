import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "../elements/MidiNote";
import { MidiGrid } from "./MidiGrid";

const rows = [
  { id: "c4", label: "C4", pitch: 60 },
  { id: "d4", label: "D4", pitch: 62 },
];

function createGrid(id: string, rowCount = 2): MidiGrid {
  return new MidiGrid(rows.slice(0, rowCount), id);
}

describe("Grid element ownership and row invariants", () => {
  it("rejects attaching the same instance to a second grid", () => {
    const first = createGrid("first");
    const second = createGrid("second");
    const note = new MidiNote(0, 0, 120, "note");

    first.addElement(note);

    expect(() => second.addElement(note)).toThrow("already belongs to a grid");
    expect(first.getElement(note.id)).toBe(note);
    expect(second.getElements()).toEqual([]);
  });

  it("releases ownership upon removal and allows reattachment", () => {
    const first = createGrid("first");
    const second = createGrid("second");
    const note = new MidiNote(0, 0, 120, "note");

    first.addElement(note);
    expect(first.removeElement(note.id)).toBe(true);
    second.addElement(note);

    expect(first.getElement(note.id)).toBeUndefined();
    expect(second.getElement(note.id)).toBe(note);
  });

  it("rejects a row beyond the owning grid without changing state", () => {
    const grid = createGrid("grid");
    const note = new MidiNote(0, 0, 120, "note");
    grid.addElement(note);

    const listener = vi.fn();
    grid.onChange(listener);

    expect(() => { note.row = 2; }).toThrow("outside grid bounds");
    expect(() => { note.row = -1; }).toThrow("non-negative integer");
    expect(() => { note.row = 0.5; }).toThrow("non-negative integer");
    expect(() => { note.row = Number.NaN; }).toThrow("non-negative integer");

    expect(note.row).toBe(0);
    expect(listener).not.toHaveBeenCalled();

    note.row = 1;
    expect(note.row).toBe(1);
    expect(listener).toHaveBeenCalledExactlyOnceWith([
      { type: "element-updated", elementId: "note", properties: ["row"] },
    ]);
  });

  it("does not reserve ownership when attachment fails", () => {
    const shortGrid = createGrid("short", 1);
    const validGrid = createGrid("valid", 2);
    const note = new MidiNote(1, 0, 120, "note");

    expect(() => shortGrid.addElement(note)).toThrow("outside grid bounds");
    expect(shortGrid.getElements()).toEqual([]);

    validGrid.addElement(note);
    expect(validGrid.getElement(note.id)).toBe(note);
  });

  it("rejects negative and fractional rows during construction", () => {
    for (const row of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new MidiNote(row, 0, 120)).toThrow(
        "Element row must be a non-negative integer",
      );
    }
  });
});
