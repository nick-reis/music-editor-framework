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

describe("GridContainer history integration", () => {
  const rows = [{ id: "row-1", label: "C4", pitch: 60 }];

  function grid(id: string): MidiGrid {
    return new MidiGrid(rows, id);
  }

  function setup() {
    const first = new GridContainer([], "first");
    const second = new GridContainer([], "second");
    const workspace = new EditorWorkspace([first, second], "workspace");
    return { first, second, workspace };
  }

  it("undoes and redoes adding a grid using the same grid object", () => {
    const { first, workspace } = setup();
    const piano = grid("piano");

    workspace.history.execute("Add grid", () => first.addGrid(piano));

    expect(first.getGrid("piano")).toBe(piano);
    expect(piano.container).toBe(first);
    expect(workspace.history.undoLabel).toBe("Add grid");

    workspace.history.undo();
    expect(first.getGrids()).toEqual([]);
    expect(piano.container).toBeNull();

    workspace.history.redo();
    expect(first.getGrids()).toEqual([piano]);
    expect(piano.container).toBe(first);
  });

  it("restores the original order when undoing the removal of a middle grid", () => {
    const a = grid("a");
    const b = grid("b");
    const c = grid("c");
    const first = new GridContainer([a, b, c], "first");
    const workspace = new EditorWorkspace([first]);

    workspace.history.execute("Remove middle", () => first.removeGrid(b.id));

    expect(first.getGrids()).toEqual([a, c]);
    workspace.history.undo();
    expect(first.getGrids()).toEqual([a, b, c]);

    workspace.history.redo();
    expect(first.getGrids()).toEqual([a, c]);
    expect(b.container).toBeNull();
  });

  it("restores grid subscriptions after undoing a removal", () => {
    const { first, workspace } = setup();
    const piano = grid("piano");
    const note = new MidiNote(0, 0, 120, "note");
    piano.addElement(note);
    first.addGrid(piano);

    workspace.history.execute("Remove", () => first.removeGrid(piano.id));
    const listener = vi.fn();
    workspace.onChange(listener);

    workspace.history.undo();
    listener.mockClear();
    note.moveToTick(240);

    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "container-changed",
      containerId: "first",
      change: {
        type: "grid-changed",
        gridId: "piano",
        change: {
          type: "element-updated",
          elementId: "note",
          properties: ["startTick"],
        },
      },
    }]);
  });

  it("undoes and redoes grid reordering without replacing any grid", () => {
    const a = grid("a");
    const b = grid("b");
    const c = grid("c");
    const first = new GridContainer([a, b, c]);
    const workspace = new EditorWorkspace([first]);

    workspace.history.execute("Reorder", () => first.reorderGrid(a, 2));

    expect(first.getGrids()).toEqual([b, c, a]);
    workspace.history.undo();
    expect(first.getGrids()).toEqual([a, b, c]);
    expect(a.container).toBe(first);

    workspace.history.redo();
    expect(first.getGrids()).toEqual([b, c, a]);
  });

  it("treats a transfer within the same container as an undoable reorder", () => {
    const a = grid("a");
    const b = grid("b");
    const first = new GridContainer([a, b]);
    const workspace = new EditorWorkspace([first]);

    workspace.history.execute("Reorder", () => {
      first.transferGridTo(a, first, 1);
    });

    expect(first.getGrids()).toEqual([b, a]);
    workspace.history.undo();
    expect(first.getGrids()).toEqual([a, b]);
    workspace.history.redo();
    expect(first.getGrids()).toEqual([b, a]);
  });

  it("undoes a transfer across owned containers and restores both positions", () => {
    const { first, second, workspace } = setup();
    const a = grid("a");
    const b = grid("b");
    const c = grid("c");
    const d = grid("d");
    first.addGrid(a);
    first.addGrid(b);
    second.addGrid(c);
    second.addGrid(d);

    workspace.history.execute("Transfer", () => {
      workspace.moveGrid(b, second, 1);
    });

    expect(first.getGrids()).toEqual([a]);
    expect(second.getGrids()).toEqual([c, b, d]);
    expect(b.container).toBe(second);

    workspace.history.undo();
    expect(first.getGrids()).toEqual([a, b]);
    expect(second.getGrids()).toEqual([c, d]);
    expect(b.container).toBe(first);

    workspace.history.redo();
    expect(first.getGrids()).toEqual([a]);
    expect(second.getGrids()).toEqual([c, b, d]);
    expect(b.container).toBe(second);
  });

  it("keeps locked notes intact when transferring their grid and undoing", () => {
    const { first, second, workspace } = setup();
    const piano = grid("piano");
    const note = new MidiNote(0, 0, 120, "locked");
    piano.addElement(note);
    note.locked = true;
    first.addGrid(piano);

    workspace.history.execute("Transfer", () => workspace.moveGrid(piano, second));

    expect(piano.container).toBe(second);
    expect(note.locked).toBe(true);
    workspace.history.undo();
    expect(piano.container).toBe(first);
    expect(note.grid).toBe(piano);
    expect(note.locked).toBe(true);
  });

  it("rolls back adding a grid and a note when a later edit fails", () => {
    const { first, workspace } = setup();
    const piano = grid("piano");
    const note = new MidiNote(0, 0, 120, "note");

    expect(() => workspace.history.execute("Invalid create", () => {
      first.addGrid(piano);
      piano.addElement(note);
      note.moveToTick(240);
      note.resizeToDuration(-1);
    })).toThrow("Invalid element timing");

    expect(first.getGrids()).toEqual([]);
    expect(piano.container).toBeNull();
    expect(piano.getElements()).toEqual([]);
    expect(note.grid).toBeNull();
    expect(note.startTick).toBe(0);
    expect(workspace.history.canUndo).toBe(false);
  });

  it("restores a removed grid before reversing previous changes to its notes", () => {
    const { first, workspace } = setup();
    const piano = grid("piano");
    const note = new MidiNote(0, 0, 120, "note");
    piano.addElement(note);
    first.addGrid(piano);

    workspace.history.execute("Edit then remove", () => {
      note.moveToTick(480);
      first.removeGrid(piano.id);
    });

    expect(first.getGrid(piano.id)).toBeUndefined();
    workspace.history.undo();
    expect(first.getGrid(piano.id)).toBe(piano);
    expect(note.startTick).toBe(0);

    workspace.history.redo();
    expect(first.getGrid(piano.id)).toBeUndefined();
    expect(note.startTick).toBe(480);
  });

  it("groups reorders and transfers in a single undo entry", () => {
    const { first, second, workspace } = setup();
    const a = grid("a");
    const b = grid("b");
    const c = grid("c");
    first.addGrid(a);
    first.addGrid(b);
    second.addGrid(c);

    workspace.history.execute("Organize", () => {
      first.reorderGrid(a, 1);
      workspace.moveGrid(b, second, 0);
    });

    expect(first.getGrids()).toEqual([a]);
    expect(second.getGrids()).toEqual([b, c]);
    workspace.history.undo();
    expect(first.getGrids()).toEqual([a, b]);
    expect(second.getGrids()).toEqual([c]);
    expect(workspace.history.canUndo).toBe(false);

    workspace.history.redo();
    expect(first.getGrids()).toEqual([a]);
    expect(second.getGrids()).toEqual([b, c]);
  });

  it("records only its own grid additions while another workspace changes", () => {
    const left = setup();
    const right = setup();
    const piano = grid("piano");
    const outside = grid("outside");

    left.workspace.history.execute("Add grid in left", () => {
      left.first.addGrid(piano);
      right.first.addGrid(outside);
    });

    expect(left.first.getGrids()).toEqual([piano]);
    expect(right.first.getGrids()).toEqual([outside]);
    expect(left.workspace.history.canUndo).toBe(true);
    expect(right.workspace.history.canUndo).toBe(false);

    left.workspace.history.undo();
    expect(left.first.getGrids()).toEqual([]);
    expect(right.first.getGrids()).toEqual([outside]);
    expect(piano.container).toBeNull();
    expect(outside.container).toBe(right.first);

    left.workspace.history.redo();
    expect(left.first.getGrids()).toEqual([piano]);
    expect(right.first.getGrids()).toEqual([outside]);
  });

  it("rejects deletion of a locked grid without recording a history entry", () => {
    const { first, workspace } = setup();
    const piano = grid("piano");
    const note = new MidiNote(0, 0, 120, "locked");
    piano.addElement(note);
    note.locked = true;
    first.addGrid(piano);

    expect(() => workspace.history.execute("Remove", () => {
      first.removeGrid(piano.id);
    })).toThrow(/locked/);

    expect(first.getGrid(piano.id)).toBe(piano);
    expect(workspace.history.canUndo).toBe(false);
  });

  it("does not create history for a no-op reorder or missing removal", () => {
    const { first, workspace } = setup();
    const piano = grid("piano");
    first.addGrid(piano);

    workspace.history.execute("No change", () => {
      first.reorderGrid(piano, 0);
      first.removeGrid("missing");
    });

    expect(workspace.history.canUndo).toBe(false);
    expect(first.getGrids()).toEqual([piano]);
  });

  it("refuses stale undo after an independent reorder returned to the same order", () => {
    const a = grid("a");
    const b = grid("b");
    const c = grid("c");
    const first = new GridContainer([a, b, c], "first");
    const workspace = new EditorWorkspace([first]);

    workspace.history.execute("Reorder", () => first.reorderGrid(a, 2));
    first.reorderGrid(a, 0);
    first.reorderGrid(a, 2);

    expect(() => workspace.history.undo()).toThrow(
      /modified outside this mutation/,
    );
    expect(first.getGrids()).toEqual([b, c, a]);
    expect(workspace.history.canUndo).toBe(true);
  });

  it("blocks container membership operations inside history but allows them outside", () => {
    const { workspace } = setup();
    const added = new GridContainer([], "added");

    expect(() => workspace.history.execute("Add container", () => {
      workspace.addContainer(added);
    })).toThrow(/not undoable yet/);
    expect(added.workspace).toBeNull();
    expect(workspace.getContainer(added.id)).toBeUndefined();

    workspace.addContainer(added);
    expect(added.workspace).toBe(workspace);

    expect(() => workspace.history.execute("Remove container", () => {
      workspace.removeContainer(added.id);
    })).toThrow(/not undoable yet/);
    expect(added.workspace).toBe(workspace);

    expect(workspace.removeContainer(added.id)).toBe(true);
    expect(added.workspace).toBeNull();
  });
});


describe("GridContainer scoped history isolation", () => {
  const rows = [{ id: "row-1", label: "C4", pitch: 60 }];

  function setup(id: string) {
    const a = new MidiGrid(rows, "a");
    const b = new MidiGrid(rows, "b");
    const first = new GridContainer([a, b], "first");
    const second = new GridContainer([], "second");
    const workspace = new EditorWorkspace([first, second], id);
    return { a, b, first, second, workspace };
  }

  it("does not capture unrelated grid reorders or transfers", () => {
    const left = setup("left");
    const right = setup("right");
    const created = new MidiGrid(rows, "created");

    left.workspace.history.execute("Add in left", () => {
      left.first.addGrid(created);
      right.first.reorderGrid(right.a, 1);
      right.workspace.moveGrid(right.b, right.second);
    });

    expect(left.first.getGrids()).toEqual([left.a, left.b, created]);
    expect(right.first.getGrids()).toEqual([right.a]);
    expect(right.second.getGrids()).toEqual([right.b]);

    left.workspace.history.undo();
    expect(left.first.getGrids()).toEqual([left.a, left.b]);
    expect(right.first.getGrids()).toEqual([right.a]);
    expect(right.second.getGrids()).toEqual([right.b]);
    expect(right.workspace.history.canUndo).toBe(false);
  });

  it("maintains independent undo stacks for nested structural transactions", () => {
    const left = setup("left");
    const right = setup("right");

    left.workspace.history.execute("Reorder left", () => {
      left.first.reorderGrid(left.a, 1);
      right.workspace.history.execute("Move right grid", () => {
        right.workspace.moveGrid(right.a, right.second);
      });
    });

    expect(left.first.getGrids()).toEqual([left.b, left.a]);
    expect(right.first.getGrids()).toEqual([right.b]);
    expect(right.second.getGrids()).toEqual([right.a]);

    left.workspace.history.undo();
    expect(left.first.getGrids()).toEqual([left.a, left.b]);
    expect(right.second.getGrids()).toEqual([right.a]);

    right.workspace.history.undo();
    expect(right.first.getGrids()).toEqual([right.a, right.b]);
    expect(right.second.getGrids()).toEqual([]);
  });
});
