import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "../elements/MidiNote";
import { EditorWorkspace } from "../workspace/EditorWorkspace";
import { GridContainer } from "./GridContainer";
import { MidiGrid } from "./MidiGrid";

const rows = [{ id: "row-1", label: "C4", pitch: 60 }];

function grid(id: string): MidiGrid {
  return new MidiGrid(rows, id);
}

describe("GridContainer ownership and transfers", () => {
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
