import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "../elements/MidiNote";
import { MoveElementsCommand } from "../commands/MoveElementsCommand";
import { MidiGrid } from "./MidiGrid";

const rows = [
  { id: "c4", label: "C4", pitch: 60 },
  { id: "d4", label: "D4", pitch: 62 },
];

describe("Grid hard locking", () => {
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
