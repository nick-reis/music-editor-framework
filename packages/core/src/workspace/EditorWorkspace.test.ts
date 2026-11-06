import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "../elements/MidiNote";
import { GridContainer } from "../grids/GridContainer";
import { EditorWorkspace } from "./EditorWorkspace";
import { MutationCapture } from "../mutations/MutationCapture";
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

  it("records only its own edits while another workspace changes directly", () => {
    const left = createWorkspace();
    const right = createWorkspace();
    const inside = new MidiNote(0, 0, 120, "inside");
    const outside = new MidiNote(0, 0, 120, "outside");
    left.first.addElement(inside);
    right.first.addElement(outside);

    left.workspace.history.execute("Left edit", () => {
      inside.moveToTick(240);
      outside.moveToTick(480);
    });

    expect([inside.startTick, outside.startTick]).toEqual([240, 480]);
    expect(left.workspace.history.canUndo).toBe(true);
    expect(right.workspace.history.canUndo).toBe(false);

    left.workspace.history.undo();
    expect([inside.startTick, outside.startTick]).toEqual([0, 480]);

    left.workspace.history.redo();
    expect([inside.startTick, outside.startTick]).toEqual([240, 480]);
  });

  it("invalidates recorded note history after a direct grid transfer", () => {
    const { first, workspace } = createWorkspace();
    const destination = new GridContainer([], "other");
    workspace.addContainer(destination);
    const note = new MidiNote(0, 0, 120, "note");
    first.addElement(note);

    workspace.history.execute("Move", () => note.moveToTick(240));
    workspace.moveGrid(first, destination);

    expect(note.grid).toBe(first);
    expect(workspace.getGrid(first.id)).toBe(first);
    expect(workspace.history.canUndo).toBe(false);
    expect(workspace.history.undo()).toBe(false);
    expect(note.startTick).toBe(240);
  });

  it("invalidates history when a grid is directly removed from its workspace", () => {
    const { first, container, workspace } = createWorkspace();
    const note = new MidiNote(0, 0, 120, "note");
    first.addElement(note);

    workspace.history.execute("Move", () => note.moveToTick(240));
    container.removeGrid(first.id);

    expect(workspace.history.canUndo).toBe(false);
    expect(workspace.history.undo()).toBe(false);
    expect(note.startTick).toBe(240);
    expect(first.container).toBeNull();
  });

  it("invalidates old history when an element is directly replaced", () => {
    const { first, workspace } = createWorkspace();
    const oldNote = new MidiNote(0, 0, 120, "same");
    const newNote = new MidiNote(0, 0, 120, "same");
    first.addElement(oldNote);

    workspace.history.execute("Old", () => oldNote.moveToTick(240));
    first.removeElement(oldNote.id);
    first.addElement(newNote);

    expect(workspace.history.canUndo).toBe(false);
    expect(workspace.history.undo()).toBe(false);
    expect(first.getElement("same")).toBe(newNote);
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
  it("undoes an element addition followed by a property update", () => {
    const { first, workspace } = createWorkspace();
    const note = new MidiNote(0, 0, 120, "new-note");

    workspace.history.execute("Create and move", () => {
      first.addElement(note);
      note.moveToTick(480);
    });

    expect(note.grid).toBe(first);
    expect(note.startTick).toBe(480);
    expect(workspace.history.undo()).toBe(true);
    expect(note.grid).toBeNull();
    expect(note.startTick).toBe(0);
    expect(first.getElements()).toEqual([]);

    expect(workspace.history.redo()).toBe(true);
    expect(note.grid).toBe(first);
    expect(note.startTick).toBe(480);
  });

  it("undoes an edit followed by deleting its element", () => {
    const { first, workspace } = createWorkspace();
    const note = new MidiNote(0, 0, 120, "note");
    first.addElement(note);

    workspace.history.execute("Edit and delete", () => {
      note.moveToTick(960);
      first.removeElement(note.id);
    });

    expect(note.grid).toBeNull();
    workspace.history.undo();
    expect(note.grid).toBe(first);
    expect(note.startTick).toBe(0);

    workspace.history.redo();
    expect(note.grid).toBeNull();
    expect(note.startTick).toBe(960);
  });

  it("replaces a note with the same ID and restores the original object on undo", () => {
    const { first, workspace } = createWorkspace();
    const before = new MidiNote(0, 0, 120, "same");
    const after = new MidiNote(0, 120, 120, "same");
    first.addElement(before);

    workspace.history.execute("Replace", () => {
      first.removeElement(before.id);
      first.addElement(after);
      after.moveToTick(480);
    });

    expect(first.getElement("same")).toBe(after);
    workspace.history.undo();
    expect(first.getElement("same")).toBe(before);
    expect(before.grid).toBe(first);
    expect(after.grid).toBeNull();
    expect(after.startTick).toBe(120);

    workspace.history.redo();
    expect(first.getElement("same")).toBe(after);
    expect(after.startTick).toBe(480);
  });

  it("rolls back additions and edits when a later operation fails validation", () => {
    const { first, workspace } = createWorkspace();
    const existing = new MidiNote(0, 0, 120, "existing");
    const created = new MidiNote(0, 120, 120, "created");
    first.addElement(existing);

    expect(() => workspace.history.execute("Invalid group", () => {
      first.addElement(created);
      created.moveToTick(240);
      existing.resizeToDuration(-1);
    })).toThrow("Invalid element timing");

    expect(first.getElements()).toEqual([existing]);
    expect(created.grid).toBeNull();
    expect(created.startTick).toBe(120);
    expect(existing.durationTicks).toBe(120);
    expect(workspace.history.canUndo).toBe(false);
  });

  it("tracks only its own element additions when another workspace is edited", () => {
    const left = createWorkspace();
    const right = createWorkspace();
    const inside = new MidiNote(0, 0, 120, "inside");
    const outside = new MidiNote(0, 0, 120, "outside");

    left.workspace.history.execute("Add in left", () => {
      left.first.addElement(inside);
      right.first.addElement(outside);
    });

    expect(inside.grid).toBe(left.first);
    expect(outside.grid).toBe(right.first);
    expect(left.workspace.history.canUndo).toBe(true);
    expect(right.workspace.history.canUndo).toBe(false);

    left.workspace.history.undo();
    expect(inside.grid).toBeNull();
    expect(outside.grid).toBe(right.first);
    expect(left.first.getElements()).toEqual([]);
    expect(right.first.getElements()).toEqual([outside]);

    left.workspace.history.redo();
    expect(left.first.getElements()).toEqual([inside]);
    expect(right.first.getElements()).toEqual([outside]);
  });

  it("supports moving a note between two owned grids in a history action", () => {
    const { first, second, workspace } = createWorkspace();
    const note = new MidiNote(0, 0, 120, "note");
    first.addElement(note);

    workspace.history.execute("Move between grids", () => {
      first.removeElement(note.id);
      second.addElement(note);
    });

    expect(note.grid).toBe(second);
    workspace.history.undo();
    expect(note.grid).toBe(first);
    expect(first.getElement(note.id)).toBe(note);
    expect(second.getElement(note.id)).toBeUndefined();

    workspace.history.redo();
    expect(note.grid).toBe(second);
    expect(second.getElement(note.id)).toBe(note);
  });

  it("groups changes to elements with matching IDs in different owned grids", () => {
    const { first, second, workspace } = createWorkspace();
    const left = new MidiNote(0, 0, 120, "same");
    const right = new MidiNote(0, 0, 120, "same");

    workspace.history.execute("Add both", () => {
      first.addElement(left);
      second.addElement(right);
    });

    expect(first.getElement("same")).toBe(left);
    expect(second.getElement("same")).toBe(right);
    workspace.history.undo();
    expect(first.getElement("same")).toBeUndefined();
    expect(second.getElement("same")).toBeUndefined();
    workspace.history.redo();
    expect(first.getElement("same")).toBe(left);
    expect(second.getElement("same")).toBe(right);
  });

  it("forwards undo and redo membership changes and restored note subscriptions", () => {
    const { first, workspace } = createWorkspace();
    const note = new MidiNote(0, 0, 120, "note");
    const listener = vi.fn();
    workspace.onChange(listener);

    workspace.history.execute("Add", () => first.addElement(note));
    listener.mockClear();

    workspace.history.undo();
    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "container-changed",
      containerId: "tracks",
      change: {
        type: "grid-changed",
        gridId: "piano",
        change: { type: "element-removed", elementId: "note" },
      },
    }]);

    listener.mockClear();
    workspace.history.redo();
    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "container-changed",
      containerId: "tracks",
      change: {
        type: "grid-changed",
        gridId: "piano",
        change: { type: "element-added", elementId: "note" },
      },
    }]);

    listener.mockClear();
    note.moveToTick(240);
    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "container-changed",
      containerId: "tracks",
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

  it("clears stale deletion history even if direct edits return to the same membership", () => {
    const { first, workspace } = createWorkspace();
    const note = new MidiNote(0, 0, 120, "note");
    first.addElement(note);

    workspace.history.execute("Delete", () => first.removeElement(note.id));
    first.addElement(note);
    first.removeElement(note.id);

    expect(workspace.history.canUndo).toBe(false);
    expect(workspace.history.undo()).toBe(false);
    expect(first.getElement(note.id)).toBeUndefined();
  });

  it("clears multi-mutation history when a later direct property edit occurs", () => {
    const { first, workspace } = createWorkspace();
    const edited = new MidiNote(0, 0, 120, "edited");
    const removed = new MidiNote(0, 0, 120, "removed");
    first.addElement(edited);
    first.addElement(removed);

    workspace.history.execute("Edit and remove", () => {
      edited.moveToTick(240);
      first.removeElement(removed.id);
    });

    edited.moveToTick(720);

    expect(workspace.history.canUndo).toBe(false);
    expect(workspace.history.undo()).toBe(false);
    expect(edited.startTick).toBe(720);
    expect(first.getElement(removed.id)).toBeUndefined();
    expect(removed.grid).toBeNull();
  });

  it("rolls back a lock change when it makes a later removal illegal", () => {
    const { first, workspace } = createWorkspace();
    const note = new MidiNote(0, 0, 120, "note");
    first.addElement(note);

    expect(() => workspace.history.execute("Invalid locked delete", () => {
      note.moveToTick(240);
      note.locked = true;
      first.removeElement(note.id);
    })).toThrow(/locked/);

    expect(note.grid).toBe(first);
    expect(note.startTick).toBe(0);
    expect(note.locked).toBe(false);
    expect(workspace.history.canUndo).toBe(false);
  });

  it("undoes add and lock in the correct order without violating hard locking", () => {
    const { first, workspace } = createWorkspace();
    const note = new MidiNote(0, 0, 120, "note");

    workspace.history.execute("Add locked note", () => {
      first.addElement(note);
      note.locked = true;
    });

    expect(note.locked).toBe(true);
    workspace.history.undo();
    expect(note.locked).toBe(false);
    expect(note.grid).toBeNull();

    workspace.history.redo();
    expect(note.locked).toBe(true);
    expect(note.grid).toBe(first);
  });

});


describe("EditorWorkspace scoped history behavior", () => {
  function setup(id: string) {
    const grid = new MidiGrid([
      { id: "c4", label: "C4", pitch: 60 },
      { id: "d4", label: "D4", pitch: 62 },
    ], "piano");
    const container = new GridContainer([grid], "tracks");
    const workspace = new EditorWorkspace([container], id);
    const note = new MidiNote(0, 0, 120, "note");
    grid.addElement(note);
    return { workspace, container, grid, note };
  }

  it("records nested independent workspace histories separately", () => {
    const a = setup("a");
    const b = setup("b");

    a.workspace.history.execute("Edit A", () => {
      a.note.moveToTick(240);
      b.workspace.history.execute("Edit B", () => {
        b.note.moveToTick(480);
      });
      a.note.resizeToDuration(240);
    });

    expect(a.workspace.history.undoLabel).toBe("Edit A");
    expect(b.workspace.history.undoLabel).toBe("Edit B");
    expect([a.note.startTick, a.note.durationTicks]).toEqual([240, 240]);
    expect(b.note.startTick).toBe(480);

    a.workspace.history.undo();
    expect([a.note.startTick, a.note.durationTicks]).toEqual([0, 120]);
    expect(b.note.startTick).toBe(480);

    b.workspace.history.undo();
    expect(b.note.startTick).toBe(0);
    a.workspace.history.redo();
    b.workspace.history.redo();
    expect([a.note.startTick, a.note.durationTicks, b.note.startTick]).toEqual([
      240, 240, 480,
    ]);
  });

  it("records edits to the outer workspace even while the inner scope is active", () => {
    const a = setup("a");
    const b = setup("b");

    a.workspace.history.execute("A changes", () => {
      a.note.moveToTick(120);
      b.workspace.history.execute("B changes", () => {
        a.note.moveToTick(240);
        b.note.moveToTick(480);
      });
      a.note.moveToTick(360);
    });

    expect(a.note.startTick).toBe(360);
    expect(b.note.startTick).toBe(480);
    a.workspace.history.undo();
    expect(a.note.startTick).toBe(0);
    expect(b.note.startTick).toBe(480);
    b.workspace.history.undo();
    expect(b.note.startTick).toBe(0);
  });

  it("keeps the original transaction usable after a nested other-workspace failure", () => {
    const a = setup("a");
    const b = setup("b");

    a.workspace.history.execute("Continue A", () => {
      a.note.moveToTick(120);
      expect(() => b.workspace.history.execute("Invalid B", () => {
        b.note.moveToTick(480);
        throw new Error("failed in B");
      })).toThrow("failed in B");
      a.note.moveToTick(240);
    });

    expect(a.note.startTick).toBe(240);
    expect(b.note.startTick).toBe(0);
    expect(a.workspace.history.canUndo).toBe(true);
    expect(b.workspace.history.canUndo).toBe(false);
    a.workspace.history.undo();
    expect(a.note.startTick).toBe(0);
  });

  it("keeps an independent direct edit when the recording workspace rolls back", () => {
    const a = setup("a");
    const b = setup("b");

    expect(() => a.workspace.history.execute("Fail A", () => {
      a.note.moveToTick(120);
      b.note.moveToTick(480);
      throw new Error("abort A");
    })).toThrow("abort A");

    expect(a.note.startTick).toBe(0);
    expect(b.note.startTick).toBe(480);
    expect(a.workspace.history.canUndo).toBe(false);
    expect(b.workspace.history.canUndo).toBe(false);
  });

  it("records same-workspace container changes while allowing independent direct edits", () => {
    const a = setup("a");
    const b = setup("b");
    const extra = new GridContainer([], "extra");
    const added = new GridContainer([], "added");

    a.workspace.history.execute("A edit", () => {
      b.workspace.addContainer(extra);
      expect(b.workspace.getContainer(extra.id)).toBe(extra);
      expect(b.workspace.removeContainer(extra.id)).toBe(true);

      a.workspace.addContainer(added, 0);
      expect(a.workspace.getContainers()).toEqual([added, a.container]);
      a.note.moveToTick(240);
    });

    expect(a.workspace.history.canUndo).toBe(true);
    expect(b.workspace.getContainer(extra.id)).toBeUndefined();
    a.workspace.history.undo();
    expect(a.note.startTick).toBe(0);
    expect(a.workspace.getContainers()).toEqual([a.container]);
    expect(added.workspace).toBeNull();
    a.workspace.history.redo();
    expect(a.workspace.getContainers()).toEqual([added, a.container]);
    expect(a.note.startTick).toBe(240);
  });

  it("rejects nested operations on the same history without committing partial changes", () => {
    const a = setup("a");

    expect(() => a.workspace.history.execute("Outer", () => {
      a.note.moveToTick(120);
      a.workspace.history.execute("Inner", () => a.note.moveToTick(240));
    })).toThrow(/already executing/);

    expect(a.note.startTick).toBe(0);
    expect(a.workspace.history.canUndo).toBe(false);
  });

  it("can undo another workspace while its own recording remains active", () => {
    const a = setup("a");
    const b = setup("b");
    b.workspace.history.execute("B first", () => b.note.moveToTick(480));

    a.workspace.history.execute("A next", () => {
      a.note.moveToTick(120);
      expect(b.workspace.history.undo()).toBe(true);
    });

    expect(b.note.startTick).toBe(0);
    expect(b.workspace.history.canRedo).toBe(true);
    a.workspace.history.undo();
    expect(a.note.startTick).toBe(0);
    expect(b.note.startTick).toBe(0);
    b.workspace.history.redo();
    expect(b.note.startTick).toBe(480);
  });

  it("does not add history for unrelated edits if the recording workspace is unchanged", () => {
    const a = setup("a");
    const b = setup("b");

    a.workspace.history.execute("Only B changed", () => {
      b.note.moveToTick(480);
    });

    expect(a.workspace.history.canUndo).toBe(false);
    expect(b.workspace.history.canUndo).toBe(false);
    expect(b.note.startTick).toBe(480);
  });
});


describe("EditorWorkspace ownership encapsulation", () => {
  const rows = [{ id: "c4", label: "C4", pitch: 60 }];

  it("does not expose workspace attachment hooks or a writable parent", () => {
    const container = new GridContainer([], "tracks");
    const first = new EditorWorkspace([container], "first");
    const second = new EditorWorkspace([], "second");

    expect("_attachToWorkspace" in container).toBe(false);
    expect("_detachFromWorkspace" in container).toBe(false);
    expect(Reflect.set(container, "workspace", second)).toBe(false);
    expect(container.workspace).toBe(first);
    expect(first.getContainer(container.id)).toBe(container);
    expect(second.getContainer(container.id)).toBeUndefined();
  });

  it("allows container reattachment between documents without forwarding stale events", () => {
    const piano = new MidiGrid(rows, "piano");
    const note = new MidiNote(0, 0, 120, "note");
    piano.addElement(note);
    const container = new GridContainer([piano], "tracks");
    const first = new EditorWorkspace([container], "first");
    const second = new EditorWorkspace([], "second");
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    first.onChange(firstListener);
    second.onChange(secondListener);

    expect(first.removeContainer(container.id)).toBe(true);
    second.addContainer(container);
    firstListener.mockClear();
    secondListener.mockClear();
    note.moveToTick(480);

    expect(container.workspace).toBe(second);
    expect(piano.container).toBe(container);
    expect(note.grid).toBe(piano);
    expect(first.getGrid(piano.id)).toBeUndefined();
    expect(second.getGrid(piano.id)).toBe(piano);
    expect(firstListener).not.toHaveBeenCalled();
    expect(secondListener).toHaveBeenCalledTimes(1);
  });

  it("records a moved container's notes only in the new owning workspace", () => {
    const piano = new MidiGrid(rows, "piano");
    const note = new MidiNote(0, 0, 120, "note");
    piano.addElement(note);
    const container = new GridContainer([piano], "tracks");
    const first = new EditorWorkspace([container], "first");
    const second = new EditorWorkspace([], "second");

    first.removeContainer(container.id);
    second.addContainer(container);
    second.history.execute("Move in second", () => note.moveToTick(240));

    expect(second.history.canUndo).toBe(true);
    expect(first.history.canUndo).toBe(false);
    second.history.undo();
    expect(note.startTick).toBe(0);
    second.history.redo();
    expect(note.startTick).toBe(240);
  });

  it("does not permit an attached container to be adopted by another workspace", () => {
    const piano = new MidiGrid(rows, "piano");
    const container = new GridContainer([piano], "tracks");
    const first = new EditorWorkspace([container], "first");
    const second = new EditorWorkspace([], "second");
    const listener = vi.fn();
    second.onChange(listener);

    expect(() => second.addContainer(container)).toThrow(/already belongs to a workspace/);
    expect(container.workspace).toBe(first);
    expect(piano.container).toBe(container);
    expect(first.getContainer(container.id)).toBe(container);
    expect(second.getContainers()).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });
});


describe("EditorWorkspace direct-edit history invalidation", () => {
  const rows = [{ id: "c4", label: "C4", pitch: 60 }];

  function setup(id = "workspace") {
    const grid = new MidiGrid(rows, "piano");
    const container = new GridContainer([grid], "tracks");
    const workspace = new EditorWorkspace([container], id);
    const note = new MidiNote(0, 0, 120, "note");
    grid.addElement(note);
    return { workspace, container, grid, note };
  }

  it("clears undo history immediately when a note is directly edited", () => {
    const { workspace, note } = setup();
    const events = vi.fn();
    workspace.history.onChange(events);
    workspace.history.execute("Recorded move", () => note.moveToTick(240));

    note.moveToTick(480);

    expect(note.startTick).toBe(480);
    expect(workspace.history.canUndo).toBe(false);
    expect(workspace.history.canRedo).toBe(false);
    expect(workspace.history.undoLabel).toBeNull();
    expect(workspace.history.undo()).toBe(false);
    expect(events).toHaveBeenLastCalledWith({
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      redoLabel: null,
    });
  });

  it("clears the redo stack after a direct edit following undo", () => {
    const { workspace, note } = setup();
    workspace.history.execute("Move", () => note.moveToTick(240));
    expect(workspace.history.undo()).toBe(true);
    expect(workspace.history.canRedo).toBe(true);

    note.moveToTick(480);

    expect(workspace.history.canRedo).toBe(false);
    expect(workspace.history.redo()).toBe(false);
    expect(note.startTick).toBe(480);
  });

  it("preserves undo history for no-ops and rejected model edits", () => {
    const { workspace, note, grid } = setup();
    workspace.history.execute("Move", () => note.moveToTick(240));

    note.moveToTick(240);
    note.row = 0;
    expect(grid.removeElement("missing")).toBe(false);
    expect(() => note.resizeToDuration(-1)).toThrow(/Invalid element timing/);
    expect(() => grid.addElement(new MidiNote(5, 0, 120))).toThrow(/outside grid bounds/);

    expect(workspace.history.canUndo).toBe(true);
    expect(workspace.history.undoLabel).toBe("Move");
    expect(workspace.history.undo()).toBe(true);
    expect(note.startTick).toBe(0);
  });

  it("treats a successful direct lock change as a history boundary", () => {
    const { workspace, note } = setup();
    workspace.history.execute("Move", () => note.moveToTick(240));

    note.setLocked(true);

    expect(workspace.history.canUndo).toBe(false);
    expect(() => note.moveToTick(480)).toThrow(/locked/);
    expect(note.locked).toBe(true);
    expect(note.startTick).toBe(240);
  });

  it("invalidates history after direct element insertion and deletion", () => {
    const { workspace, grid, note } = setup();
    workspace.history.execute("Move", () => note.moveToTick(240));
    const extra = new MidiNote(0, 0, 120, "extra");

    grid.addElement(extra);
    expect(workspace.history.canUndo).toBe(false);

    workspace.history.execute("Another move", () => note.moveToTick(360));
    expect(workspace.history.canUndo).toBe(true);
    grid.removeElement(extra.id);

    expect(extra.grid).toBeNull();
    expect(workspace.history.canUndo).toBe(false);
  });

  it("invalidates history on structural changes to attached grids", () => {
    const { workspace, container, note } = setup();
    const second = new MidiGrid(rows, "second");
    workspace.history.execute("Move", () => note.moveToTick(240));

    container.addGrid(second);
    expect(workspace.history.canUndo).toBe(false);

    workspace.history.execute("Move again", () => note.moveToTick(360));
    container.reorderGrid(second, 0);
    expect(workspace.history.canUndo).toBe(false);

    workspace.history.execute("Move a third time", () => note.moveToTick(480));
    container.removeGrid(second.id);
    expect(workspace.history.canUndo).toBe(false);
  });

  it("invalidates history for direct workspace container changes", () => {
    const { workspace, note } = setup();
    workspace.history.execute("Move", () => note.moveToTick(240));
    const extra = new GridContainer([], "extra");

    workspace.addContainer(extra);
    expect(workspace.history.canUndo).toBe(false);

    workspace.history.execute("Move again", () => note.moveToTick(360));
    workspace.removeContainer(extra.id);
    expect(workspace.history.canUndo).toBe(false);
    expect(extra.workspace).toBeNull();
  });

  it("does not clear another workspace's existing history", () => {
    const left = setup("left");
    const right = setup("right");
    left.workspace.history.execute("Left move", () => left.note.moveToTick(240));
    right.workspace.history.execute("Right move", () => right.note.moveToTick(480));

    right.note.moveToTick(960);

    expect(left.workspace.history.canUndo).toBe(true);
    expect(right.workspace.history.canUndo).toBe(false);
    left.workspace.history.undo();
    expect(left.note.startTick).toBe(0);
    expect(right.note.startTick).toBe(960);
  });

  it("invalidates synchronously even within workspace notification batching", () => {
    const { workspace, note } = setup();
    workspace.history.execute("Move", () => note.moveToTick(240));

    workspace.batchChanges(() => {
      note.moveToTick(480);
      expect(workspace.history.canUndo).toBe(false);
    });
  });

  it("preserves recorded history after edits to detached objects", () => {
    const { workspace, note } = setup();
    const detached = new MidiNote(0, 0, 120, "detached");
    workspace.history.execute("Move", () => note.moveToTick(240));

    detached.moveToTick(960);

    expect(workspace.history.canUndo).toBe(true);
    workspace.history.undo();
    expect(note.startTick).toBe(0);
    expect(detached.startTick).toBe(960);
  });

  it("invalidates history for an attached note changed inside a standalone capture", () => {
    const { workspace, note } = setup();
    workspace.history.execute("Move", () => note.moveToTick(240));
    const capture = new MutationCapture();

    capture.run(() => note.moveToTick(480));

    expect(capture.mutations).toHaveLength(1);
    expect(workspace.history.canUndo).toBe(false);
    expect(note.startTick).toBe(480);
  });

  it("invalidates redo when an observer directly edits during undo", () => {
    const { workspace, note } = setup();
    workspace.history.execute("Move", () => note.moveToTick(240));
    note.onChange(() => {
      if (note.startTick === 0) note.moveToTick(360);
    });

    expect(workspace.history.undo()).toBe(true);

    expect(note.startTick).toBe(360);
    expect(workspace.history.canUndo).toBe(false);
    expect(workspace.history.canRedo).toBe(false);
    expect(workspace.history.redo()).toBe(false);
  });

  it("invalidates history when an observer directly edits during redo", () => {
    const { workspace, note } = setup();
    workspace.history.execute("Move", () => note.moveToTick(240));
    workspace.history.undo();
    note.onChange(() => {
      if (note.startTick === 240) note.moveToTick(720);
    });

    expect(workspace.history.redo()).toBe(true);

    expect(note.startTick).toBe(720);
    expect(workspace.history.canUndo).toBe(false);
    expect(workspace.history.canRedo).toBe(false);
  });

  it("preserves history when undo changes a note without observer mutations", () => {
    const { workspace, note } = setup();
    workspace.history.execute("Move", () => note.moveToTick(240));

    expect(workspace.history.undo()).toBe(true);
    expect(workspace.history.canRedo).toBe(true);
    expect(workspace.history.redo()).toBe(true);

    expect(note.startTick).toBe(240);
    expect(workspace.history.canUndo).toBe(true);
  });

  it("invalidates only the observer-edited document during independent undo", () => {
    const left = setup("left");
    const right = setup("right");
    left.workspace.history.execute("Left move", () => left.note.moveToTick(240));
    right.workspace.history.execute("Right move", () => right.note.moveToTick(480));
    left.note.onChange(() => {
      if (left.note.startTick === 0) right.note.moveToTick(960);
    });

    left.workspace.history.undo();

    expect(left.workspace.history.canRedo).toBe(true);
    expect(right.workspace.history.canUndo).toBe(false);
    expect(right.note.startTick).toBe(960);
  });

  it("invalidates history when a history-change subscriber makes a direct edit", () => {
    const { workspace, note } = setup();
    workspace.history.onChange((change) => {
      if (change.canUndo) note.moveToTick(720);
    });

    workspace.history.execute("Move", () => note.moveToTick(240));

    expect(note.startTick).toBe(720);
    expect(workspace.history.canUndo).toBe(false);
    expect(workspace.history.undoLabel).toBeNull();
  });
});


describe("EditorWorkspace transaction notification isolation", () => {
  const rows = [{ id: "c4", label: "C4", pitch: 60 }];

  function setup(id = "workspace") {
    const grid = new MidiGrid(rows, "piano");
    const container = new GridContainer([grid], "tracks");
    const workspace = new EditorWorkspace([container], id);
    const note = new MidiNote(0, 0, 120, "note");
    grid.addElement(note);

    const elementEvents = vi.fn();
    const gridEvents = vi.fn();
    const containerEvents = vi.fn();
    const workspaceEvents = vi.fn();
    const historyEvents = vi.fn();

    note.onChange(elementEvents);
    grid.onChange(gridEvents);
    container.onChange(containerEvents);
    workspace.onChange(workspaceEvents);
    workspace.history.onChange(historyEvents);

    return {
      note, grid, container, workspace,
      elementEvents, gridEvents, containerEvents,
      workspaceEvents, historyEvents,
    };
  }

  it("holds every level of external notification until commit", () => {
    const state = setup();

    state.workspace.history.execute("Move and resize", () => {
      state.note.moveToTick(240);
      state.note.resizeToDuration(480);

      expect(state.elementEvents).not.toHaveBeenCalled();
      expect(state.gridEvents).not.toHaveBeenCalled();
      expect(state.containerEvents).not.toHaveBeenCalled();
      expect(state.workspaceEvents).not.toHaveBeenCalled();
      expect(state.historyEvents).not.toHaveBeenCalled();
    });

    expect(state.note.startTick).toBe(240);
    expect(state.note.durationTicks).toBe(480);
    expect(state.elementEvents).toHaveBeenCalledTimes(2);
    expect(state.gridEvents).toHaveBeenCalledTimes(2);
    expect(state.containerEvents).toHaveBeenCalledTimes(2);
    expect(state.workspaceEvents).toHaveBeenCalledTimes(2);
    expect(state.historyEvents).toHaveBeenCalledTimes(1);
    expect(state.workspace.history.undoLabel).toBe("Move and resize");
  });

  it("suppresses forward and rollback notifications when execution fails", () => {
    const state = setup();

    expect(() => state.workspace.history.execute("Invalid", () => {
      state.note.moveToTick(240);
      state.note.resizeToDuration(0);
    })).toThrow(/Invalid element timing/);

    expect(state.note.startTick).toBe(0);
    expect(state.note.durationTicks).toBe(120);
    expect(state.workspace.history.canUndo).toBe(false);
    expect(state.elementEvents).not.toHaveBeenCalled();
    expect(state.gridEvents).not.toHaveBeenCalled();
    expect(state.containerEvents).not.toHaveBeenCalled();
    expect(state.workspaceEvents).not.toHaveBeenCalled();
    expect(state.historyEvents).not.toHaveBeenCalled();
  });

  it("lets observers query the final committed state for earlier events", () => {
    const state = setup();
    const positions: number[] = [];
    state.note.onChange(() => positions.push(state.note.startTick));

    state.workspace.history.execute("Move twice", () => {
      state.note.moveToTick(240);
      state.note.moveToTick(480);
    });

    expect(positions).toEqual([480, 480]);
  });

  it("keeps selection when a deleted note is restored during rollback", () => {
    const state = setup();
    state.workspace.selection.select(state.note);
    const selected = vi.fn();
    state.workspace.selection.onChange(selected);

    expect(() => state.workspace.history.execute("Cancelled delete", () => {
      state.grid.removeElement(state.note.id);
      throw new Error("Cancelled");
    })).toThrow("Cancelled");

    expect(state.grid.getElement(state.note.id)).toBe(state.note);
    expect(state.workspace.selection.isSelected(state.note)).toBe(true);
    expect(selected).not.toHaveBeenCalled();
    expect(state.workspaceEvents).not.toHaveBeenCalled();
  });

  it("reconciles selection before reporting committed removals", () => {
    const state = setup();
    state.workspace.selection.select(state.note);
    let selectedDuringNotification: boolean | undefined;

    state.workspace.onChange(() => {
      selectedDuringNotification = state.workspace.selection.isSelected(state.note);
    });

    state.workspace.history.execute("Delete", () => {
      state.grid.removeElement(state.note.id);
      expect(state.workspace.selection.isSelected(state.note)).toBe(true);
    });

    expect(state.workspace.selection.isSelected(state.note)).toBe(false);
    expect(selectedDuringNotification).toBe(false);
  });

  it("deduplicates selection reconciliation for multiple removed notes", () => {
    const state = setup();
    const second = new MidiNote(0, 240, 120, "second");
    state.grid.addElement(second);
    state.workspace.selection.setSelection([state.note, second]);

    const listener = vi.fn();
    state.workspace.selection.onChange(listener);

    state.workspace.history.execute("Delete both", () => {
      state.grid.removeElement(state.note.id);
      state.grid.removeElement(second.id);
    });

    expect(state.workspace.selection.count).toBe(0);
    expect(listener).toHaveBeenCalledExactlyOnceWith({
      addedElements: [],
      removedElements: [state.note, second],
    });
  });

  it("permits nested history transactions in independent workspaces", () => {
    const left = setup("left");
    const right = setup("right");

    left.workspace.history.execute("Left", () => {
      left.note.moveToTick(240);

      right.workspace.history.execute("Right", () => {
        right.note.moveToTick(480);
      });

      expect(left.workspaceEvents).not.toHaveBeenCalled();
      expect(right.workspaceEvents).toHaveBeenCalledTimes(1);
    });

    expect(left.workspaceEvents).toHaveBeenCalledTimes(1);
    expect(left.workspace.history.canUndo).toBe(true);
    expect(right.workspace.history.canUndo).toBe(true);
  });

  it("does not suppress direct edits in another workspace on failed rollback", () => {
    const left = setup("left");
    const right = setup("right");

    expect(() => left.workspace.history.execute("Abort left", () => {
      left.note.moveToTick(240);
      right.note.moveToTick(480);
      throw new Error("Abort");
    })).toThrow("Abort");

    expect(left.note.startTick).toBe(0);
    expect(right.note.startTick).toBe(480);
    expect(left.workspaceEvents).not.toHaveBeenCalled();
    expect(right.workspaceEvents).toHaveBeenCalledTimes(1);
  });

  it("notifies on undo and redo after replay has completed", () => {
    const state = setup();
    state.workspace.history.execute("Move", () => state.note.moveToTick(480));

    state.elementEvents.mockClear();
    state.workspaceEvents.mockClear();

    expect(state.workspace.history.undo()).toBe(true);
    expect(state.note.startTick).toBe(0);
    expect(state.elementEvents).toHaveBeenCalledTimes(1);
    expect(state.workspaceEvents).toHaveBeenCalledTimes(1);
    state.elementEvents.mockClear();
    state.workspaceEvents.mockClear();

    expect(state.workspace.history.redo()).toBe(true);
    expect(state.note.startTick).toBe(480);
    expect(state.elementEvents).toHaveBeenCalledTimes(1);
    expect(state.workspaceEvents).toHaveBeenCalledTimes(1);
  });

  it("continues delivering direct model edits synchronously", () => {
    const state = setup();

    state.note.moveToTick(240);

    expect(state.elementEvents).toHaveBeenCalledTimes(1);
    expect(state.workspaceEvents).toHaveBeenCalledTimes(1);
  });

  it("cancels a buffered event when its listener unsubscribes and re-subscribes", () => {
    const state = setup();
    const listener = vi.fn();
    const unsubscribe = state.note.onChange(listener);

    state.workspace.history.execute("Move", () => {
      state.note.moveToTick(240);
      unsubscribe();
      state.note.onChange(listener);
    });

    expect(listener).not.toHaveBeenCalled();
    state.note.moveToTick(480);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not create events for a transaction with no effective changes", () => {
    const state = setup();

    state.workspace.history.execute("No-op", () => {
      state.note.moveToTick(0);
      state.note.resizeToDuration(120);
    });

    expect(state.workspace.history.canUndo).toBe(false);
    expect(state.elementEvents).not.toHaveBeenCalled();
    expect(state.workspaceEvents).not.toHaveBeenCalled();
    expect(state.historyEvents).not.toHaveBeenCalled();
  });

  it("publishes available events if rollback itself fails", () => {
    const state = setup();

    expect(() => state.workspace.history.execute("Broken operation", () => {
      state.note.moveToTick(240);

      MutationCapture.record({
        target: state.note,
        before: {},
        after: {},
        undo: () => {
          state.note.moveToTick(480);
          throw new Error("Rollback failed");
        },
        redo: () => {},
      });

      throw new Error("Operation failed");
    })).toThrow(/rollback was incomplete/);

    expect(state.note.startTick).toBe(480);
    expect(state.workspace.history.canUndo).toBe(false);
    expect(state.workspaceEvents).toHaveBeenCalled();
  });

  it("retains full hierarchy propagation during undo of grid transfers", () => {
    const state = setup();
    const destination = new GridContainer([], "destination");
    state.workspace.addContainer(destination);
    const listener = vi.fn();
    state.workspace.onChange(listener);

    state.workspace.history.execute("Transfer", () => {
      state.workspace.moveGrid(state.grid, destination);
    });

    expect(state.grid.container).toBe(destination);
    expect(listener).toHaveBeenCalled();
    listener.mockClear();

    expect(state.workspace.history.undo()).toBe(true);
    expect(state.grid.container).toBe(state.container);
    expect(state.workspace.history.canRedo).toBe(true);
    expect(listener).toHaveBeenCalled();
  });
});


describe("EditorWorkspace undoable container structure", () => {
  const rows = [{ id: "c4", label: "C4", pitch: 60 }];

  function make(id: string) {
    const grid = new MidiGrid(rows, id + "-grid");
    const note = new MidiNote(0, 0, 120, id + "-note");
    grid.addElement(note);
    return { container: new GridContainer([grid], id), grid, note };
  }

  it("appends by default and inserts at explicit zero-based indices", () => {
    const a = new GridContainer([], "a");
    const b = new GridContainer([], "b");
    const c = new GridContainer([], "c");
    const d = new GridContainer([], "d");
    const e = new GridContainer([], "e");
    const workspace = new EditorWorkspace([a, b]);
    workspace.addContainer(c);
    workspace.addContainer(d, 0);
    workspace.addContainer(e, 2);
    expect(workspace.getContainers()).toEqual([d, a, e, b, c]);
  });

  it("validates insertion indices without changing the model or history", () => {
    const workspace = new EditorWorkspace([new GridContainer([], "original")]);
    workspace.history.execute("Add", () =>
      workspace.addContainer(new GridContainer([], "recorded")),
    );
    const candidate = new GridContainer([], "candidate");
    for (const bad of [-1, 3, 0.5, Number.NaN, Infinity]) {
      expect(() => workspace.addContainer(candidate, bad))
        .toThrow(/Invalid container insertion index/);
    }
    expect(candidate.workspace).toBeNull();
    expect(workspace.getContainers().map((item) => item.id))
      .toEqual(["original", "recorded"]);
    expect(workspace.history.canUndo).toBe(true);
  });

  it("undoes and redoes indexed insertion while preserving all instances", () => {
    const a = make("a");
    const b = make("b");
    const c = make("c");
    const workspace = new EditorWorkspace([a.container, c.container]);
    const listener = vi.fn();
    workspace.onChange(listener);
    workspace.history.execute("Add in middle", () => {
      workspace.addContainer(b.container, 1);
      expect(listener).not.toHaveBeenCalled();
    });
    expect(workspace.getContainers()).toEqual([a.container, b.container, c.container]);
    expect(listener).toHaveBeenCalledExactlyOnceWith([
      { type: "container-added", containerId: "b" },
    ]);
    expect(workspace.history.undo()).toBe(true);
    expect(workspace.getContainers()).toEqual([a.container, c.container]);
    expect(b.container.workspace).toBeNull();
    expect(b.grid.container).toBe(b.container);
    expect(b.note.grid).toBe(b.grid);
    expect(workspace.history.redo()).toBe(true);
    expect(workspace.getContainers()).toEqual([a.container, b.container, c.container]);
    expect(workspace.getContainer("b")).toBe(b.container);
    expect(workspace.getGrid(b.grid.id)).toBe(b.grid);
  });

  it("undoes and redoes removal in the original position", () => {
    const a = make("a");
    const b = make("b");
    const c = make("c");
    const workspace = new EditorWorkspace([a.container, b.container, c.container]);
    workspace.history.execute("Remove", () => {
      expect(workspace.removeContainer("b")).toBe(true);
    });
    expect(workspace.getContainers()).toEqual([a.container, c.container]);
    expect(b.container.workspace).toBeNull();
    expect(workspace.history.undo()).toBe(true);
    expect(workspace.getContainers()).toEqual([a.container, b.container, c.container]);
    expect(b.note.grid).toBe(b.grid);
    expect(workspace.history.redo()).toBe(true);
    expect(workspace.getContainers()).toEqual([a.container, c.container]);
  });

  it("reorders with correctly indexed events, undo, and redo", () => {
    const a = new GridContainer([], "a");
    const b = new GridContainer([], "b");
    const c = new GridContainer([], "c");
    const workspace = new EditorWorkspace([a, b, c]);
    const listener = vi.fn();
    workspace.onChange(listener);
    workspace.history.execute("Reorder", () => workspace.reorderContainer(a, 2));
    expect(workspace.getContainers()).toEqual([b, c, a]);
    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "container-reordered", containerId: "a",
      fromIndex: 0, toIndex: 2,
    }]);
    listener.mockClear();
    expect(workspace.history.undo()).toBe(true);
    expect(workspace.getContainers()).toEqual([a, b, c]);
    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "container-reordered", containerId: "a",
      fromIndex: 2, toIndex: 0,
    }]);
    listener.mockClear();
    expect(workspace.history.redo()).toBe(true);
    expect(workspace.getContainers()).toEqual([b, c, a]);
    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "container-reordered", containerId: "a",
      fromIndex: 0, toIndex: 2,
    }]);
  });

  it("preserves history for reorder no-ops, invalid indices and missing removals", () => {
    const a = new GridContainer([], "a");
    const b = new GridContainer([], "b");
    const workspace = new EditorWorkspace([a, b]);
    workspace.history.execute("Reorder", () => workspace.reorderContainer(a, 1));
    workspace.reorderContainer(a, 1);
    expect(workspace.removeContainer("missing")).toBe(false);
    for (const bad of [-1, 2, 0.2, Number.NaN]) {
      expect(() => workspace.reorderContainer(a, bad)).toThrow(/Invalid container index/);
    }
    expect(() => workspace.reorderContainer(new GridContainer([], "foreign"), 0))
      .toThrow(/does not belong/);
    expect(workspace.history.canUndo).toBe(true);
    expect(workspace.history.undo()).toBe(true);
    expect(workspace.getContainers()).toEqual([a, b]);
  });

  it("invalidates undo history for direct add, remove, and reorder", () => {
    const a = new GridContainer([], "a");
    const b = new GridContainer([], "b");
    const c = new GridContainer([], "c");
    const workspace = new EditorWorkspace([a, b]);

    workspace.history.execute("First", () => workspace.reorderContainer(a, 1));
    workspace.addContainer(c, 0);
    expect(workspace.history.canUndo).toBe(false);

    workspace.history.execute("Second", () => workspace.reorderContainer(a, 0));
    workspace.removeContainer(c.id);
    expect(workspace.history.canUndo).toBe(false);

    workspace.history.execute("Third", () => workspace.reorderContainer(a, 1));
    workspace.reorderContainer(a, 0);
    expect(workspace.history.canUndo).toBe(false);
  });

  it("restores structure and selection without notifications on failed compound edits", () => {
    const a = make("a");
    const b = make("b");
    const extra = make("extra");
    const workspace = new EditorWorkspace([a.container, b.container]);
    workspace.selection.select(a.note);
    const listener = vi.fn();
    const selected = vi.fn();
    workspace.onChange(listener);
    workspace.selection.onChange(selected);

    expect(() => workspace.history.execute("Broken", () => {
      workspace.removeContainer(a.container.id);
      workspace.addContainer(extra.container, 0);
      workspace.reorderContainer(extra.container, 1);
      throw new Error("cancel");
    })).toThrow("cancel");
    expect(workspace.getContainers()).toEqual([a.container, b.container]);
    expect(a.container.workspace).toBe(workspace);
    expect(extra.container.workspace).toBeNull();
    expect(workspace.selection.isSelected(a.note)).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    expect(selected).not.toHaveBeenCalled();
    expect(workspace.history.canUndo).toBe(false);
  });

  it("blocks removing locked descendants and preserves existing history", () => {
    const target = make("target");
    const workspace = new EditorWorkspace([target.container]);
    target.note.setLocked(true);
    workspace.history.execute("Add sibling", () =>
      workspace.addContainer(new GridContainer([], "sibling")),
    );
    expect(() => workspace.removeContainer(target.container.id)).toThrow(/locked/);
    expect(target.container.workspace).toBe(workspace);
    expect(workspace.history.undoLabel).toBe("Add sibling");
  });

  it("allows a recorded unlock then removal and restores lock through undo", () => {
    const target = make("target");
    const workspace = new EditorWorkspace([target.container]);
    target.note.setLocked(true);
    workspace.history.execute("Unlock and remove", () => {
      target.note.setLocked(false);
      workspace.removeContainer(target.container.id);
    });
    expect(target.container.workspace).toBeNull();
    expect(workspace.history.undo()).toBe(true);
    expect(target.container.workspace).toBe(workspace);
    expect(target.note.locked).toBe(true);
    expect(workspace.history.redo()).toBe(true);
    expect(target.container.workspace).toBeNull();
    expect(target.note.locked).toBe(false);
  });

  it("does not duplicate forwarded events after repeated undo and redo", () => {
    const target = make("target");
    const workspace = new EditorWorkspace();
    workspace.history.execute("Add", () => workspace.addContainer(target.container));
    workspace.history.undo();
    workspace.history.redo();
    workspace.history.undo();
    workspace.history.redo();
    const listener = vi.fn();
    workspace.onChange(listener);
    target.note.moveToTick(480);
    expect(listener).toHaveBeenCalledExactlyOnceWith([{
      type: "container-changed", containerId: "target",
      change: {
        type: "grid-changed", gridId: "target-grid",
        change: {
          type: "element-updated", elementId: "target-note",
          properties: ["startTick"],
        },
      },
    }]);
  });

  it("undoes compound insertion, grid transfer and container reorder", () => {
    const a = make("a");
    const b = make("b");
    const workspace = new EditorWorkspace([a.container]);

    workspace.history.execute("Build tracks", () => {
      workspace.addContainer(b.container, 0);
      workspace.moveGrid(a.grid, b.container, 1);
      workspace.reorderContainer(a.container, 0);
    });
    expect(workspace.getContainers()).toEqual([a.container, b.container]);
    expect(a.grid.container).toBe(b.container);

    expect(workspace.history.undo()).toBe(true);
    expect(workspace.getContainers()).toEqual([a.container]);
    expect(a.grid.container).toBe(a.container);
    expect(b.container.workspace).toBeNull();

    expect(workspace.history.redo()).toBe(true);
    expect(workspace.getContainers()).toEqual([a.container, b.container]);
    expect(a.grid.container).toBe(b.container);
  });

  it("refuses to restore a removed container adopted by another workspace", () => {
    const target = make("target");
    const first = new EditorWorkspace([target.container], "first");
    const second = new EditorWorkspace([], "second");
    first.history.execute("Remove", () => first.removeContainer(target.container.id));
    second.addContainer(target.container);
    expect(() => first.history.undo()).toThrow(/already belongs to a workspace/);
    expect(first.history.canUndo).toBe(true);
    expect(first.getContainer(target.container.id)).toBeUndefined();
    expect(second.getContainer(target.container.id)).toBe(target.container);
  });

  it("does not create history during constructor initialization", () => {
    const a = new GridContainer([], "a");
    const b = new GridContainer([], "b");
    const workspace = new EditorWorkspace([a, b]);
    expect(workspace.history.canUndo).toBe(false);
    expect(workspace.getContainers()).toEqual([a, b]);
  });
});
