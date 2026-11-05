import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "../elements/MidiNote";
import { GridContainer } from "../grids/GridContainer";
import { MidiGrid } from "../grids/MidiGrid";
import { EditorWorkspace } from "./EditorWorkspace";

const rows = [{ id: "row-1", label: "C4", pitch: 60 }];

function makeGrid(id: string): MidiGrid {
  return new MidiGrid(rows, id);
}

describe("EditorWorkspace ownership and selection lifecycle", () => {
  it("enforces unique grid IDs across containers", () => {
    const original = makeGrid("piano");
    const duplicate = makeGrid("piano");
    const first = new GridContainer([original], "first");
    const second = new GridContainer([duplicate], "second");
    const workspace = new EditorWorkspace([first]);

    expect(() => workspace.addContainer(second)).toThrow(
      /Grid piano already exists/,
    );

    expect(workspace.getContainers()).toEqual([first]);
    expect(first.workspace).toBe(workspace);
    expect(second.workspace).toBeNull();
    expect(duplicate.container).toBe(second);
    expect(workspace.getGrid("piano")).toBe(original);
  });

  it("enforces unique grid IDs when adding to an attached container", () => {
    const original = makeGrid("piano");
    const duplicate = makeGrid("piano");
    const first = new GridContainer([original], "first");
    const second = new GridContainer([], "second");
    const workspace = new EditorWorkspace([first, second]);

    expect(() => second.addGrid(duplicate)).toThrow(
      /Grid piano already exists/,
    );
    expect(duplicate.container).toBeNull();
    expect(workspace.getGrid("piano")).toBe(original);
    expect(second.getGrids()).toEqual([]);
  });

  it("rejects reuse of one container across workspaces", () => {
    const container = new GridContainer([makeGrid("piano")], "shared");
    const first = new EditorWorkspace([container]);
    const second = new EditorWorkspace();

    expect(() => second.addContainer(container)).toThrow(
      /already belongs to a workspace/,
    );
    expect(container.workspace).toBe(first);
    expect(first.getContainer(container.id)).toBe(container);
    expect(second.containerCount).toBe(0);
  });

  it("validates incoming containers before attaching any in constructor", () => {
    const first = new GridContainer([makeGrid("duplicate")], "first");
    const second = new GridContainer([makeGrid("duplicate")], "second");

    expect(() => new EditorWorkspace([first, second])).toThrow(
      /Grid duplicate already exists/,
    );

    expect(first.workspace).toBeNull();
    expect(second.workspace).toBeNull();
    expect(first.gridCount).toBe(1);
    expect(second.gridCount).toBe(1);
  });

  it("allows equal element IDs across grids while selecting them independently", () => {
    const piano = makeGrid("piano");
    const guitar = makeGrid("guitar");
    const first = new MidiNote(0, 0, 480, "same");
    const second = new MidiNote(0, 0, 480, "same");
    piano.addElement(first);
    guitar.addElement(second);
    const workspace = new EditorWorkspace([
      new GridContainer([piano, guitar]),
    ]);

    workspace.selection.setSelection([first, second]);

    expect(workspace.selection.count).toBe(2);
    expect(workspace.selection.isSelected(first)).toBe(true);
    expect(workspace.selection.isSelected(second)).toBe(true);

    piano.removeElement("same");

    expect(workspace.selection.isSelected(first)).toBe(false);
    expect(workspace.selection.isSelected(second)).toBe(true);
    expect(workspace.selection.count).toBe(1);
    expect(second.grid).toBe(guitar);
  });

  it("clears selection for removed elements but not unrelated selections", () => {
    const piano = makeGrid("piano");
    const guitar = makeGrid("guitar");
    const first = new MidiNote(0, 0, 480, "first");
    const second = new MidiNote(0, 0, 480, "second");
    piano.addElement(first);
    guitar.addElement(second);
    const container = new GridContainer([piano, guitar]);
    const workspace = new EditorWorkspace([container]);

    workspace.selection.setSelection([first, second]);
    container.removeGrid(piano.id);

    expect(workspace.selection.isSelected(first)).toBe(false);
    expect(workspace.selection.isSelected(second)).toBe(true);
    expect(first.grid).toBe(piano);
    expect(piano.container).toBeNull();
  });

  it("cleans up selection after removing a container", () => {
    const piano = makeGrid("piano");
    const note = new MidiNote(0, 0, 480, "note");
    piano.addElement(note);
    const container = new GridContainer([piano]);
    const workspace = new EditorWorkspace([container]);
    workspace.selection.select(note);
    const listener = vi.fn();
    workspace.selection.onChange(listener);

    workspace.removeContainer(container.id);

    expect(workspace.selection.count).toBe(0);
    expect(listener).toHaveBeenCalledExactlyOnceWith({
      addedElements: [],
      removedElements: [note],
    });
    expect(note.grid).toBe(piano);
    expect(piano.container).toBe(container);
    expect(container.workspace).toBeNull();
  });

  it("retains selection during grid reordering and transfers", () => {
    const piano = makeGrid("piano");
    const other = makeGrid("other");
    const note = new MidiNote(0, 0, 480, "note");
    piano.addElement(note);
    const first = new GridContainer([piano, other]);
    const second = new GridContainer();
    const workspace = new EditorWorkspace([first, second]);
    workspace.selection.select(note);
    const listener = vi.fn();
    workspace.selection.onChange(listener);

    first.reorderGrid(piano, 1);
    workspace.moveGrid(piano, second);

    expect(workspace.selection.isSelected(note)).toBe(true);
    expect(note.grid).toBe(piano);
    expect(listener).not.toHaveBeenCalled();
  });

  it("rejects removal of a container containing locked elements", () => {
    const piano = makeGrid("piano");
    const note = new MidiNote(0, 0, 480, "locked");
    piano.addElement(note);
    note.setLocked(true);
    const container = new GridContainer([piano]);
    const workspace = new EditorWorkspace([container]);
    const listener = vi.fn();
    workspace.onChange(listener);

    expect(() => workspace.removeContainer(container.id)).toThrow(
      /locked/,
    );
    expect(container.workspace).toBe(workspace);
    expect(piano.container).toBe(container);
    expect(workspace.getGrid("piano")).toBe(piano);
    expect(listener).not.toHaveBeenCalled();
  });

  it("rejects a grid transfer if destination belongs to another workspace", () => {
    const piano = makeGrid("piano");
    const source = new GridContainer([piano]);
    const target = new GridContainer();
    const first = new EditorWorkspace([source]);
    new EditorWorkspace([target]);

    expect(() => first.moveGrid(piano, target)).toThrow(
      /must belong to this workspace/,
    );
    expect(piano.container).toBe(source);
    expect(source.getGrid(piano.id)).toBe(piano);
  });

  it("rejects a move when the grid is not attached to the workspace", () => {
    const piano = makeGrid("piano");
    const container = new GridContainer();
    const workspace = new EditorWorkspace([container]);

    expect(() => workspace.moveGrid(piano, container)).toThrow(
      /must belong to this workspace/,
    );
    expect(piano.container).toBeNull();
  });
});
