import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "../elements/MidiNote";
import { GridContainer } from "../grids/GridContainer";
import { EditorWorkspace } from "./EditorWorkspace";
import { AudioClip } from "../elements/AudioClip";
import { AudioGrid } from "../grids/AudioGrid";
import { MidiGrid } from "../grids/MidiGrid";

describe("EditorWorkspace", () => {
  it("initializes with no containers and restores an explicit ID", () => {
    const workspace = new EditorWorkspace([], "workspace-1");

    expect(workspace.id).toBe("workspace-1");
    expect(workspace.getContainers()).toEqual([]);
    expect(workspace.containerCount).toBe(0);
  });

  it("generates an ID when one is not supplied", () => {
    const workspace = new EditorWorkspace();

    expect(workspace.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[4-9][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("initializes with restored containers in insertion order", () => {
    const first = new GridContainer([], "container-1");
    const second = new GridContainer([], "container-2");
    const workspace = new EditorWorkspace([first, second]);

    expect(workspace.getContainers()).toEqual([first, second]);
    expect(workspace.containerCount).toBe(2);
  });

  it("rejects duplicate container IDs", () => {
    const first = new GridContainer([], "container-1");
    const duplicate = new GridContainer([], "container-1");

    expect(() => new EditorWorkspace([first, duplicate])).toThrow(
      "GridContainer container-1 already exists",
    );
  });

  it("adds and removes containers", () => {
    const workspace = new EditorWorkspace();
    const container = new GridContainer([], "container-1");

    workspace.addContainer(container);

    expect(workspace.getContainer("container-1")).toBe(container);
    expect(workspace.removeContainer("container-1")).toBe(true);
    expect(workspace.removeContainer("container-1")).toBe(false);
    expect(workspace.getContainer("container-1")).toBeUndefined();
    expect(workspace.containerCount).toBe(0);
  });

  it("preserves insertion order when adding containers", () => {
    const first = new GridContainer([], "container-1");
    const second = new GridContainer([], "container-2");
    const workspace = new EditorWorkspace();

    workspace.addContainer(first);
    workspace.addContainer(second);

    expect(workspace.getContainers()).toEqual([first, second]);
  });

  it("maintains independent selections when workspaces share an element", () => {
    const sharedElement = new MidiNote(0, 0, 120, "shared-element");
    const firstWorkspace = new EditorWorkspace();
    const secondWorkspace = new EditorWorkspace();

    firstWorkspace.selection.select(sharedElement);

    expect(firstWorkspace.selection.isSelected(sharedElement)).toBe(true);
    expect(secondWorkspace.selection.isSelected(sharedElement)).toBe(false);

    secondWorkspace.selection.select(sharedElement);
    firstWorkspace.selection.deselect(sharedElement);

    expect(firstWorkspace.selection.isSelected(sharedElement)).toBe(false);
    expect(secondWorkspace.selection.isSelected(sharedElement)).toBe(true);
  });
});

describe("EditorWorkspace change notifications", () => {
  function createHierarchy() {
    const clip = new AudioClip(0, 0, 120, 1, "clip-1");

    const grid = new AudioGrid(
      [{ id: "row-1", label: "Audio" }],
      "grid-1",
    );

    const container = new GridContainer([grid], "container-1");
    const workspace = new EditorWorkspace(
      [container],
      "workspace-1",
    );

    return { clip, grid, container, workspace };
  }

  it("notifies when a container is added", () => {
    const workspace = new EditorWorkspace();
    const listener = vi.fn();

    workspace.onChange(listener);
    workspace.addContainer(
      new GridContainer([], "container-1"),
    );

    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "container-added",
      containerId: "container-1",
    }]);
  });

  it("notifies when a container is removed", () => {
    const { workspace, container } = createHierarchy();
    const listener = vi.fn();

    workspace.onChange(listener);
    workspace.removeContainer(container.id);

    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "container-removed",
      containerId: "container-1",
    }]);
  });

  it("propagates element additions through the entire hierarchy", () => {
    const { workspace, grid, clip } = createHierarchy();
    const listener = vi.fn();

    workspace.onChange(listener);
    grid.addElement(clip);

    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "container-changed",
      containerId: "container-1",
      change: {
        type: "grid-changed",
        gridId: "grid-1",
        change: {
          type: "element-added",
          elementId: "clip-1",
        },
      },
    }]);
  });

  it("propagates element updates with property metadata", () => {
    const { workspace, grid, clip } = createHierarchy();

    grid.addElement(clip);

    const listener = vi.fn();
    workspace.onChange(listener);

    clip.moveToTick(480);

    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "container-changed",
      containerId: "container-1",
      change: {
        type: "grid-changed",
        gridId: "grid-1",
        change: {
          type: "element-updated",
          elementId: "clip-1",
          properties: ["startTick"],
        },
      },
    }]);
  });

  it("propagates element removals", () => {
    const { workspace, grid, clip } = createHierarchy();

    grid.addElement(clip);

    const listener = vi.fn();
    workspace.onChange(listener);

    grid.removeElement(clip.id);

    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "container-changed",
      containerId: "container-1",
      change: {
        type: "grid-changed",
        gridId: "grid-1",
        change: {
          type: "element-removed",
          elementId: "clip-1",
        },
      },
    }]);
  });

  it("stops forwarding changes after removing a container", () => {
    const { workspace, container, grid, clip } =
      createHierarchy();

    workspace.removeContainer(container.id);

    const listener = vi.fn();
    workspace.onChange(listener);

    grid.addElement(clip);
    clip.moveToTick(480);

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not duplicate subscriptions after re-adding a container", () => {
    const { workspace, container, grid, clip } =
      createHierarchy();

    workspace.removeContainer(container.id);
    workspace.addContainer(container);

    const listener = vi.fn();
    workspace.onChange(listener);

    grid.addElement(clip);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not forward changes from replaced container instances", () => {
    const { workspace, container: oldContainer } =
      createHierarchy();

    workspace.removeContainer(oldContainer.id);

    const replacement = new GridContainer(
      [],
      "container-1",
    );

    workspace.addContainer(replacement);

    const listener = vi.fn();
    workspace.onChange(listener);

    oldContainer.addGrid(
      new AudioGrid(
        [{ id: "old-row", label: "Old" }],
        "old-grid",
      ),
    );

    replacement.addGrid(
      new AudioGrid(
        [{ id: "new-row", label: "New" }],
        "new-grid",
      ),
    );

    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "container-changed",
      containerId: "container-1",
      change: {
        type: "grid-added",
        gridId: "new-grid",
      },
    }]);
  });

  it("does not notify for unsuccessful removals", () => {
    const workspace = new EditorWorkspace();
    const listener = vi.fn();

    workspace.onChange(listener);

    expect(workspace.removeContainer("missing")).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("rejects duplicate containers without notifying", () => {
    const { workspace } = createHierarchy();
    const listener = vi.fn();

    workspace.onChange(listener);

    expect(() => {
      workspace.addContainer(
        new GridContainer([], "container-1"),
      );
    }).toThrow(
      "GridContainer container-1 already exists",
    );

    expect(listener).not.toHaveBeenCalled();
  });

  it("supports unsubscribing from workspace notifications", () => {
    const workspace = new EditorWorkspace();
    const listener = vi.fn();

    const unsubscribe = workspace.onChange(listener);

    workspace.addContainer(
      new GridContainer([], "container-1"),
    );

    unsubscribe();

    workspace.addContainer(
      new GridContainer([], "container-2"),
    );

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not treat selection changes as document changes", () => {
    const workspace = new EditorWorkspace();
    const listener = vi.fn();

    workspace.onChange(listener);
    workspace.selection.select(new AudioClip(0, 0, 120, 1, "clip-1"));

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("EditorWorkspace ownership and selection lifecycle", () => {
  const rows = [{ id: "row-1", label: "C4", pitch: 60 }];

  function makeGrid(id: string): MidiGrid {
    return new MidiGrid(rows, id);
  }

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

describe("EditorWorkspace history integration", () => {
  function createWorkspace() {
    const first = new MidiGrid([
      { id: "c4", label: "C4", pitch: 60 },
      { id: "d4", label: "D4", pitch: 62 },
    ], "piano");
    const second = new MidiGrid([
      { id: "e4", label: "E4", pitch: 64 },
      { id: "f4", label: "F4", pitch: 65 },
    ], "guitar");
    const container = new GridContainer([first, second], "tracks");
    const workspace = new EditorWorkspace([container], "workspace");
    return { first, second, container, workspace };
  }

  it("owns undo history separately from other workspaces", () => {
    const left = createWorkspace();
    const right = createWorkspace();
    const noteLeft = new MidiNote(0, 0, 120, "same");
    const noteRight = new MidiNote(0, 0, 120, "same");

    left.first.addElement(noteLeft);
    right.first.addElement(noteRight);
    left.workspace.history.execute("Left edit", () => noteLeft.moveToTick(240));
    right.workspace.history.execute("Right edit", () => noteRight.moveToTick(480));

    left.workspace.history.undo();
    expect(noteLeft.startTick).toBe(0);
    expect(noteRight.startTick).toBe(480);
    expect(right.workspace.history.canUndo).toBe(true);
  });

  it("groups edits across different grids even when their elements have equal IDs", () => {
    const { first, second, workspace } = createWorkspace();
    const left = new MidiNote(0, 0, 120, "same");
    const right = new MidiNote(0, 0, 120, "same");
    first.addElement(left);
    second.addElement(right);

    workspace.history.execute("Move both", () => {
      left.moveToTick(240);
      right.moveToTick(480);
    });

    workspace.history.undo();
    expect([left.startTick, right.startTick]).toEqual([0, 0]);
    workspace.history.redo();
    expect([left.startTick, right.startTick]).toEqual([240, 480]);
  });

  it("rejects a detached element even if it shares an ID with an attached element", () => {
    const { first, workspace } = createWorkspace();
    const attached = new MidiNote(0, 0, 120, "same");
    const detached = new MidiNote(0, 0, 120, "same");
    first.addElement(attached);

    expect(() => workspace.history.execute("Outsider", () => {
      detached.moveToTick(240);
    })).toThrow(/outside the recording scope/);

    expect(detached.startTick).toBe(0);
    expect(workspace.history.canUndo).toBe(false);
  });

  it("rolls back valid workspace edits before an out-of-workspace target", () => {
    const left = createWorkspace();
    const right = createWorkspace();
    const inside = new MidiNote(0, 0, 120, "inside");
    const outside = new MidiNote(0, 0, 120, "outside");
    left.first.addElement(inside);
    right.first.addElement(outside);

    expect(() => left.workspace.history.execute("Invalid group", () => {
      inside.moveToTick(240);
      outside.moveToTick(480);
    })).toThrow(/outside the recording scope/);

    expect(inside.startTick).toBe(0);
    expect(outside.startTick).toBe(0);
    expect(left.workspace.history.canUndo).toBe(false);
  });

  it("keeps history valid when moving a grid between containers in the same workspace", () => {
    const { first, workspace } = createWorkspace();
    const destination = new GridContainer([], "other");
    workspace.addContainer(destination);
    const note = new MidiNote(0, 0, 120, "note");
    first.addElement(note);

    workspace.history.execute("Move", () => note.moveToTick(240));
    workspace.moveGrid(first, destination);

    expect(note.grid).toBe(first);
    expect(workspace.getGrid(first.id)).toBe(first);
    expect(workspace.history.undo()).toBe(true);
    expect(note.startTick).toBe(0);
  });

  it("rejects replay after the edited grid is removed from the workspace", () => {
    const { first, container, workspace } = createWorkspace();
    const note = new MidiNote(0, 0, 120, "note");
    first.addElement(note);

    workspace.history.execute("Move", () => note.moveToTick(240));
    container.removeGrid(first.id);

    expect(() => workspace.history.undo()).toThrow(/outside the history scope/);
    expect(note.startTick).toBe(240);
    expect(workspace.history.canUndo).toBe(true);
  });

  it("accepts newly attached elements but not previously removed elements", () => {
    const { first, workspace } = createWorkspace();
    const oldNote = new MidiNote(0, 0, 120, "same");
    const newNote = new MidiNote(0, 0, 120, "same");
    first.addElement(oldNote);

    workspace.history.execute("Old", () => oldNote.moveToTick(240));
    first.removeElement(oldNote.id);
    first.addElement(newNote);

    expect(() => workspace.history.undo()).toThrow(/outside the history scope/);
    expect(newNote.startTick).toBe(0);
    expect(oldNote.startTick).toBe(240);
  });

  it("does not make direct edits undoable", () => {
    const { first, workspace } = createWorkspace();
    const note = new MidiNote(0, 0, 120, "note");
    first.addElement(note);

    note.moveToTick(240);

    expect(workspace.history.canUndo).toBe(false);
    expect(workspace.history.undo()).toBe(false);
    expect(note.startTick).toBe(240);
  });
});
