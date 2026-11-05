import { describe, expect, it, vi } from "vitest";
import { GridContainer } from "./GridContainer";
import { MidiGrid } from "./MidiGrid";
import { AudioClip } from "../elements/AudioClip";
import { AudioGrid } from "./AudioGrid";
import { MidiNote } from "../elements/MidiNote";
import { EditorWorkspace } from "../workspace/EditorWorkspace";

describe("GridContainer", () => {
  const rows = [{ id: "row-1", label: "First", pitch: 60 }];

  it("adds and retrieves grids by ID", () => {
    const container = new GridContainer();
    const grid = new MidiGrid(rows, "grid-1");

    container.addGrid(grid);

    expect(container.getGrid("grid-1")).toBe(grid);
    expect(container.gridCount).toBe(1);
  });

  it("removes grids and reports whether they existed", () => {
    const container = new GridContainer();
    const grid = new MidiGrid(rows, "grid-1");
    container.addGrid(grid);

    expect(container.removeGrid("grid-1")).toBe(true);
    expect(container.removeGrid("grid-1")).toBe(false);
    expect(container.getGrid("grid-1")).toBeUndefined();
    expect(container.gridCount).toBe(0);
  });

  it("returns grids in insertion order", () => {
    const first = new MidiGrid(rows, "grid-1");
    const second = new MidiGrid(rows, "grid-2");
    const container = new GridContainer([first, second]);

    expect(container.getGrids()).toEqual([first, second]);
  });

  it("rejects duplicate grid IDs", () => {
    const container = new GridContainer();
    const first = new MidiGrid(rows, "grid-1");
    const duplicate = new MidiGrid(rows, "grid-1");
    container.addGrid(first);

    expect(() => container.addGrid(duplicate)).toThrow(
      "Grid grid-1 already exists",
    );
  });
});

describe("GridContainer change notifications", () => {
  function createGrid(id = "grid-1") {
    return new AudioGrid(
      [{ id: "row-0", label: "Audio" }],
      id,
    );
  }

  it("emits an event when a grid is added", () => {
    const container = new GridContainer();
    const listener = vi.fn();

    container.onChange(listener);
    container.addGrid(createGrid());

    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "grid-added",
      gridId: "grid-1",
    }]);
  });

  it("forwards element additions from child grids", () => {
    const grid = createGrid();
    const container = new GridContainer([grid]);
    const listener = vi.fn();

    container.onChange(listener);
    grid.addElement(new AudioClip(0, 0, 120, 1, "clip-1"));

    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "grid-changed",
      gridId: "grid-1",
      change: {
        type: "element-added",
        elementId: "clip-1",
      },
    }]);
  });

  it("forwards element updates with their original metadata", () => {
    const grid = createGrid();
    const container = new GridContainer([grid]);
    const clip = new AudioClip(0, 0, 120, 1, "clip-1");

    grid.addElement(clip);

    const listener = vi.fn();
    container.onChange(listener);

    clip.moveToTick(480);

    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "grid-changed",
      gridId: "grid-1",
      change: {
        type: "element-updated",
        elementId: "clip-1",
        properties: ["startTick"],
      },
    }]);
  });

  it("forwards element removals", () => {
    const grid = createGrid();
    const container = new GridContainer([grid]);
    const clip = new AudioClip(0, 0, 120, 1, "clip-1");

    grid.addElement(clip);

    const listener = vi.fn();
    container.onChange(listener);

    grid.removeElement(clip.id);

    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "grid-changed",
      gridId: "grid-1",
      change: {
        type: "element-removed",
        elementId: "clip-1",
      },
    }]);
  });

  it("emits an event when a grid is removed", () => {
    const grid = createGrid();
    const container = new GridContainer([grid]);
    const listener = vi.fn();

    container.onChange(listener);
    expect(container.removeGrid(grid.id)).toBe(true);

    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "grid-removed",
      gridId: "grid-1",
    }]);
  });

  it("stops forwarding changes from removed grids", () => {
    const grid = createGrid();
    const container = new GridContainer([grid]);

    container.removeGrid(grid.id);

    const listener = vi.fn();
    container.onChange(listener);

    grid.addElement(new AudioClip(0, 0, 120, 1, "clip-1"));

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not emit events for unsuccessful removals", () => {
    const container = new GridContainer();
    const listener = vi.fn();

    container.onChange(listener);

    expect(container.removeGrid("missing")).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("rejects duplicate grid IDs without notifying", () => {
    const container = new GridContainer([createGrid()]);
    const listener = vi.fn();

    container.onChange(listener);

    expect(() => container.addGrid(createGrid())).toThrow(
      "Grid grid-1 already exists",
    );

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not duplicate subscriptions after re-adding a grid", () => {
    const grid = createGrid();
    const container = new GridContainer();

    container.addGrid(grid);
    container.removeGrid(grid.id);
    container.addGrid(grid);

    const listener = vi.fn();
    container.onChange(listener);

    grid.addElement(new AudioClip(0, 0, 120, 1, "clip-1"));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not forward changes from replaced grid instances", () => {
    const oldGrid = createGrid();
    const newGrid = createGrid();
    const container = new GridContainer([oldGrid]);

    container.removeGrid(oldGrid.id);
    container.addGrid(newGrid);

    const listener = vi.fn();
    container.onChange(listener);

    oldGrid.addElement(new AudioClip(0, 0, 120, 1, "old"));
    newGrid.addElement(new AudioClip(0, 0, 120, 1, "new"));

    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "grid-changed",
      gridId: "grid-1",
      change: {
        type: "element-added",
        elementId: "new",
      },
    }]);
  });

  it("supports unsubscribing from container notifications", () => {
    const container = new GridContainer();
    const listener = vi.fn();

    const unsubscribe = container.onChange(listener);

    container.addGrid(createGrid("grid-1"));
    unsubscribe();
    container.addGrid(createGrid("grid-2"));

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("GridContainer ownership and transfers", () => {
  const rows = [{ id: "row-1", label: "C4", pitch: 60 }];

  function grid(id: string): MidiGrid {
    return new MidiGrid(rows, id);
  }

  it("prevents a grid from being owned by two containers", () => {
    const piano = grid("piano");
    const first = new GridContainer([piano], "first");
    const second = new GridContainer([], "second");

    expect(() => second.addGrid(piano)).toThrow(/already belongs to a container/);
    expect(piano.container).toBe(first);
    expect(first.getGrid("piano")).toBe(piano);
    expect(second.gridCount).toBe(0);
  });

  it("moves grids between detached containers without a workspace", () => {
    const piano = grid("piano");
    const audio = grid("audio");
    const guitar = grid("guitar");
    const first = new GridContainer([piano], "first");
    const second = new GridContainer([audio, guitar], "second");
    const note = new MidiNote(0, 0, 480, "note");
    piano.addElement(note);

    first.transferGridTo(piano, second, 1);

    expect(first.getGrids()).toEqual([]);
    expect(second.getGrids()).toEqual([audio, piano, guitar]);
    expect(piano.container).toBe(second);
    expect(note.grid).toBe(piano);
    expect(piano.getElement(note.id)).toBe(note);
    expect(first.workspace).toBeNull();
    expect(second.workspace).toBeNull();
  });

  it("moves a grid within a workspace and retains element selection", () => {
    const piano = grid("piano");
    const note = new MidiNote(0, 0, 480, "note");
    piano.addElement(note);
    const first = new GridContainer([piano], "first");
    const second = new GridContainer([], "second");
    const workspace = new EditorWorkspace([first, second]);
    workspace.selection.select(note);
    const workspaceListener = vi.fn();
    workspace.onChange(workspaceListener);

    workspace.moveGrid(piano, second);

    expect(piano.container).toBe(second);
    expect(first.gridCount).toBe(0);
    expect(second.getGrids()).toEqual([piano]);
    expect(workspace.getGrid(piano.id)).toBe(piano);
    expect(workspace.selection.isSelected(note)).toBe(true);
    expect(workspaceListener).toHaveBeenCalledExactlyOnceWith([
      {
        type: "container-changed",
        containerId: "first",
        change: { type: "grid-removed", gridId: "piano" },
      },
      {
        type: "container-changed",
        containerId: "second",
        change: { type: "grid-added", gridId: "piano" },
      },
    ]);
  });

  it("forwards changes only through the destination after transferring", () => {
    const piano = grid("piano");
    const note = new MidiNote(0, 0, 480, "note");
    piano.addElement(note);
    const first = new GridContainer([piano], "first");
    const second = new GridContainer([], "second");
    const oldListener = vi.fn();
    const newListener = vi.fn();
    first.onChange(oldListener);
    second.onChange(newListener);

    first.transferGridTo(piano, second);
    oldListener.mockClear();
    newListener.mockClear();

    note.moveToTick(240);

    expect(oldListener).not.toHaveBeenCalled();
    expect(newListener).toHaveBeenCalledExactlyOnceWith([
      {
        type: "grid-changed",
        gridId: "piano",
        change: {
          type: "element-updated",
          elementId: "note",
          properties: ["startTick"],
        },
      },
    ]);
  });

  it("reorders grids without detaching or replacing them", () => {
    const a = grid("a");
    const b = grid("b");
    const c = grid("c");
    const container = new GridContainer([a, b, c]);
    const listener = vi.fn();
    container.onChange(listener);

    container.reorderGrid(a, 2);

    expect(container.getGrids()).toEqual([b, c, a]);
    expect(a.container).toBe(container);
    expect(listener).toHaveBeenCalledExactlyOnceWith([
      {
        type: "grid-reordered",
        gridId: "a",
        fromIndex: 0,
        toIndex: 2,
      },
    ]);

    container.transferGridTo(a, container, 0);
    expect(container.getGrids()).toEqual([a, b, c]);
  });

  it("does not publish events for a no-op reorder", () => {
    const piano = grid("piano");
    const container = new GridContainer([piano]);
    const listener = vi.fn();
    container.onChange(listener);

    container.transferGridTo(piano, container, 0);

    expect(listener).not.toHaveBeenCalled();
  });

  it("rejects invalid transfer positions without altering either container", () => {
    const piano = grid("piano");
    const guitar = grid("guitar");
    const first = new GridContainer([piano]);
    const second = new GridContainer([guitar]);
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    first.onChange(firstListener);
    second.onChange(secondListener);

    for (const index of [-1, 3, 0.5, Number.NaN]) {
      expect(() => first.transferGridTo(piano, second, index)).toThrow(
        /Invalid destination index/,
      );
    }

    expect(first.getGrids()).toEqual([piano]);
    expect(second.getGrids()).toEqual([guitar]);
    expect(piano.container).toBe(first);
    expect(firstListener).not.toHaveBeenCalled();
    expect(secondListener).not.toHaveBeenCalled();
  });

  it("rejects duplicate grid IDs at destination without changing ownership", () => {
    const original = grid("same-id");
    const replacement = grid("same-id");
    const first = new GridContainer([original]);
    const second = new GridContainer([replacement]);

    expect(() => first.transferGridTo(original, second)).toThrow(
      /already exists in destination/,
    );
    expect(original.container).toBe(first);
    expect(replacement.container).toBe(second);
    expect(first.getGrids()).toEqual([original]);
    expect(second.getGrids()).toEqual([replacement]);
  });

  it("rejects transfers between different workspaces", () => {
    const piano = grid("piano");
    const first = new GridContainer([piano]);
    const second = new GridContainer();
    const workspaceA = new EditorWorkspace([first]);
    const workspaceB = new EditorWorkspace([second]);

    expect(() => first.transferGridTo(piano, second)).toThrow(
      /same workspace or detached containers/,
    );
    expect(() => workspaceA.moveGrid(piano, second)).toThrow(
      /must belong to this workspace/,
    );

    expect(piano.container).toBe(first);
    expect(workspaceA.getGrid(piano.id)).toBe(piano);
    expect(workspaceB.getGrid(piano.id)).toBeUndefined();
  });

  it("rejects transfers between an attached and a detached container", () => {
    const piano = grid("piano");
    const first = new GridContainer([piano]);
    const second = new GridContainer();
    new EditorWorkspace([first]);

    expect(() => first.transferGridTo(piano, second)).toThrow(
      /same workspace or detached containers/,
    );
    expect(piano.container).toBe(first);
  });

  it("allows moving a grid with locked notes within the same workspace", () => {
    const piano = grid("piano");
    const note = new MidiNote(0, 0, 480, "locked");
    piano.addElement(note);
    note.setLocked(true);
    const first = new GridContainer([piano]);
    const second = new GridContainer();
    const workspace = new EditorWorkspace([first, second]);

    workspace.moveGrid(piano, second);

    expect(piano.container).toBe(second);
    expect(note.grid).toBe(piano);
    expect(note.locked).toBe(true);
    expect(() => second.removeGrid(piano.id)).toThrow(/locked/);
    expect(piano.container).toBe(second);
  });

  it("preserves grid ownership after removing a container from its workspace", () => {
    const piano = grid("piano");
    const container = new GridContainer([piano]);
    const workspace = new EditorWorkspace([container]);

    workspace.removeContainer(container.id);

    expect(container.workspace).toBeNull();
    expect(piano.container).toBe(container);
    expect(container.getGrid(piano.id)).toBe(piano);
  });

  it("releases grid ownership when explicitly removing an unlocked grid", () => {
    const piano = grid("piano");
    const first = new GridContainer([piano]);
    const second = new GridContainer();

    expect(first.removeGrid(piano.id)).toBe(true);
    expect(piano.container).toBeNull();

    second.addGrid(piano);
    expect(piano.container).toBe(second);
  });

  it("rejects duplicate grid IDs during construction without partial ownership", () => {
    const first = grid("duplicate");
    const second = grid("duplicate");

    expect(() => new GridContainer([first, second])).toThrow(
      /already exists/,
    );

    expect(first.container).toBeNull();
    expect(second.container).toBeNull();
  });
});
