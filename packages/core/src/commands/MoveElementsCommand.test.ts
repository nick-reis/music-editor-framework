import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "../elements/MidiNote";
import { MidiGrid } from "../grids/MidiGrid";
import { MoveElementsCommand } from "./MoveElementsCommand";
import { CommandHistory } from "./CommandHistory";

describe("MoveElementsCommand", () => {
  function createGrid(id = "grid-1"): MidiGrid {
    return new MidiGrid(
      [
        { id: "c4", label: "C4", pitch: 60 },
        { id: "d4", label: "D4", pitch: 62 },
      ],
      id,
    );
  }

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

describe("MoveElementsCommand edge cases", () => {
  function grid(id = "grid"): MidiGrid {
    return new MidiGrid([
      { id: "c4", label: "C4", pitch: 60 },
      { id: "d4", label: "D4", pitch: 62 },
    ], id);
  }

  it("rejects empty and duplicate moves", () => {
    const g = grid();
    const note = new MidiNote(0, 0, 120, "note");
    g.addElement(note);

    expect(() => new MoveElementsCommand([])).toThrow("At least one element");
    expect(() => new MoveElementsCommand([
      { grid: g, element: note, to: { tick: 120, row: 0 } },
      { grid: g, element: note, to: { tick: 240, row: 1 } },
    ])).toThrow("Duplicate elements");
  });

  it("rejects an element that does not belong to the supplied grid", () => {
    const a = grid("a");
    const b = grid("b");
    const note = new MidiNote(0, 0, 120, "note");
    a.addElement(note);

    const command = new MoveElementsCommand([
      { grid: b, element: note, to: { tick: 240, row: 1 } },
    ]);

    expect(() => command.execute()).toThrow("does not belong");
    expect([note.startTick, note.row]).toEqual([0, 0]);
  });

  it("copies target coordinates instead of trusting a mutable caller object", () => {
    const g = grid();
    const note = new MidiNote(0, 0, 120, "note");
    g.addElement(note);
    const target = { tick: 480, row: 1 };
    const command = new MoveElementsCommand([
      { grid: g, element: note, to: target },
    ]);

    target.tick = 960;
    target.row = 0;
    command.execute();

    expect([note.startTick, note.row]).toEqual([480, 1]);
  });

  it("rejects double execution and undo before execution", () => {
    const g = grid();
    const note = new MidiNote(0, 0, 120, "note");
    g.addElement(note);
    const command = new MoveElementsCommand([
      { grid: g, element: note, to: { tick: 480, row: 1 } },
    ]);

    expect(() => command.undo()).toThrow("has not been executed");
    command.execute();
    expect(() => command.execute()).toThrow("already executed");
    expect([note.startTick, note.row]).toEqual([480, 1]);
  });

  it("does not send an update for a no-op movement", () => {
    const g = grid();
    const note = new MidiNote(0, 120, 120, "note");
    g.addElement(note);
    const listener = vi.fn();
    g.onChange(listener);

    new MoveElementsCommand([
      { grid: g, element: note, to: { tick: 120, row: 0 } },
    ]).execute();

    expect(listener).not.toHaveBeenCalled();
  });

  it("rejects undo after an external lock without corrupting command state", () => {
    const g = grid();
    const note = new MidiNote(0, 0, 120, "note");
    g.addElement(note);
    const command = new MoveElementsCommand([
      { grid: g, element: note, to: { tick: 480, row: 1 } },
    ]);

    command.execute();
    note.setLocked(true);
    expect(() => command.undo()).toThrow(/locked/i);
    expect([note.startTick, note.row]).toEqual([480, 1]);

    note.setLocked(false);
    command.undo();
    expect([note.startTick, note.row]).toEqual([0, 0]);
  });

  it("allows retry after a failed move whose rollback succeeded", () => {
    class FailsOnceNote extends MidiNote {
      private shouldFail = true;

      override moveToTick(tick: number): void {
        if (tick === 720 && this.shouldFail) {
          this.shouldFail = false;
          throw new Error("transient failure");
        }
        super.moveToTick(tick);
      }
    }

    const g = grid();
    const first = new MidiNote(0, 0, 120, "first");
    const second = new FailsOnceNote(0, 120, 120, "second");
    g.addElement(first);
    g.addElement(second);

    const command = new MoveElementsCommand([
      { grid: g, element: first, to: { tick: 480, row: 1 } },
      { grid: g, element: second, to: { tick: 720, row: 1 } },
    ]);

    expect(() => command.execute()).toThrow("transient failure");
    expect([first.startTick, first.row]).toEqual([0, 0]);
    expect([second.startTick, second.row]).toEqual([120, 0]);

    command.execute();
    expect([first.startTick, first.row]).toEqual([480, 1]);
    expect([second.startTick, second.row]).toEqual([720, 1]);
  });

  it("works through CommandHistory without extra undo entries", () => {
    const g = grid();
    const first = new MidiNote(0, 0, 120, "first");
    const second = new MidiNote(0, 120, 120, "second");
    g.addElement(first);
    g.addElement(second);
    const history = new CommandHistory();

    history.execute(new MoveElementsCommand([
      { grid: g, element: first, to: { tick: 480, row: 1 } },
      { grid: g, element: second, to: { tick: 600, row: 1 } },
    ]));

    expect(history.canUndo).toBe(true);
    history.undo();
    expect(history.canUndo).toBe(false);
    expect([first.startTick, first.row]).toEqual([0, 0]);
    expect([second.startTick, second.row]).toEqual([120, 0]);
  });
});
