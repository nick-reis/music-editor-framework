import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "../elements/MidiNote";
import { MidiGrid } from "../grids/MidiGrid";
import { MoveElementsCommand } from "./MoveElementsCommand";

function createGrid(id = "grid-1"): MidiGrid {
  return new MidiGrid(
    [
      { id: "c4", label: "C4", pitch: 60 },
      { id: "d4", label: "D4", pitch: 62 },
    ],
    id,
  );
}

describe("MoveElementsCommand", () => {
  it("executes, undoes, and redoes multiple moves", () => {
    const grid = createGrid();
    const first = new MidiNote(0, 0, 120, "first");
    const second = new MidiNote(1, 120, 120, "second");

    grid.addElement(first);
    grid.addElement(second);

    const listener = vi.fn();
    grid.onChange(listener);

    const command = new MoveElementsCommand([
      { grid, element: first, to: { tick: 480, row: 1 } },
      { grid, element: second, to: { tick: 960, row: 0 } },
    ]);

    command.execute();

    expect([first.startTick, first.row]).toEqual([480, 1]);
    expect([second.startTick, second.row]).toEqual([960, 0]);

    // One grid notification containing four property changes.
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toHaveLength(4);

    command.undo();

    expect([first.startTick, first.row]).toEqual([0, 0]);
    expect([second.startTick, second.row]).toEqual([120, 1]);
    expect(listener).toHaveBeenCalledTimes(2);

    command.execute();

    expect([first.startTick, first.row]).toEqual([480, 1]);
    expect([second.startTick, second.row]).toEqual([960, 0]);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("batches each affected grid independently", () => {
    const gridA = createGrid("a");
    const gridB = createGrid("b");

    const first = new MidiNote(0, 0, 120, "first");
    const second = new MidiNote(0, 0, 120, "second");

    gridA.addElement(first);
    gridB.addElement(second);

    const listenerA = vi.fn();
    const listenerB = vi.fn();

    gridA.onChange(listenerA);
    gridB.onChange(listenerB);

    new MoveElementsCommand([
      { grid: gridA, element: first, to: { tick: 240, row: 1 } },
      { grid: gridB, element: second, to: { tick: 480, row: 1 } },
    ]).execute();

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);
    expect(listenerA.mock.calls[0][0]).toHaveLength(2);
    expect(listenerB.mock.calls[0][0]).toHaveLength(2);
  });

  it("rejects invalid positions and locked elements", () => {
    const grid = createGrid();
    const note = new MidiNote(0, 0, 120, "note");

    grid.addElement(note);

    expect(() => {
      new MoveElementsCommand([
        { grid, element: note, to: { tick: 240, row: 99 } },
      ]).execute();
    }).toThrow("Element row is outside grid bounds");

    note.locked = true;

    expect(() => {
      new MoveElementsCommand([
        { grid, element: note, to: { tick: 240, row: 1 } },
      ]).execute();
    }).toThrow("locked");

    expect([note.startTick, note.row]).toEqual([0, 0]);
  });

  it("rolls back earlier movements if a later move fails", () => {
    class FailingNote extends MidiNote {
      override moveToTick(tick: number): void {
        if (tick === 720) {
          throw new Error("Simulated movement failure");
        }
        super.moveToTick(tick);
      }
    }

    const grid = createGrid();
    const first = new MidiNote(0, 0, 120, "first");
    const second = new FailingNote(0, 120, 120, "second");

    grid.addElement(first);
    grid.addElement(second);

    const listener = vi.fn();
    grid.onChange(listener);

    const command = new MoveElementsCommand([
      { grid, element: first, to: { tick: 480, row: 1 } },
      { grid, element: second, to: { tick: 720, row: 1 } },
    ]);

    expect(() => command.execute()).toThrow(
      "Simulated movement failure",
    );

    expect([first.startTick, first.row]).toEqual([0, 0]);
    expect([second.startTick, second.row]).toEqual([120, 0]);

    // Successful mutations and their rollback are notified together.
    expect(listener).toHaveBeenCalledTimes(1);

    expect(() => command.undo()).toThrow(
      "Command has not been executed",
    );
  });

  it("rejects changes made outside an executed command", () => {
    const grid = createGrid();
    const note = new MidiNote(0, 0, 120, "note");

    grid.addElement(note);

    const command = new MoveElementsCommand([
      { grid, element: note, to: { tick: 480, row: 1 } },
    ]);

    command.execute();
    note.moveToTick(600);

    expect(() => command.undo()).toThrow(
      "was modified outside this command",
    );
  });
});
