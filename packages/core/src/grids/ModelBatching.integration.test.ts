import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "../elements/MidiNote";
import { MidiGrid } from "./MidiGrid";
import { GridContainer } from "./GridContainer";
import { EditorWorkspace } from "../workspace/EditorWorkspace";

function createGrid(id: string): MidiGrid {
  return new MidiGrid([
    { id: "c4", label: "C4", pitch: 60 },
    { id: "d4", label: "D4", pitch: 62 },
  ], id);
}

describe("Hierarchical notification batching", () => {
  it("forwards one grid batch as one container and workspace notification", () => {
    const grid = createGrid("midi");
    const note = new MidiNote(0, 0, 120, "note");
    const container = new GridContainer([grid], "container");
    const workspace = new EditorWorkspace([container], "workspace");
    grid.addElement(note);

    const gridListener = vi.fn();
    const containerListener = vi.fn();
    const workspaceListener = vi.fn();

    grid.onChange(gridListener);
    container.onChange(containerListener);
    workspace.onChange(workspaceListener);

    grid.batchChanges(() => {
      note.moveToTick(480);
      note.row = 1;
      expect(gridListener).not.toHaveBeenCalled();
      expect(containerListener).not.toHaveBeenCalled();
      expect(workspaceListener).not.toHaveBeenCalled();
    });

    expect(gridListener).toHaveBeenCalledTimes(1);
    expect(gridListener.mock.calls[0][0]).toHaveLength(2);
    expect(containerListener).toHaveBeenCalledTimes(1);
    expect(containerListener.mock.calls[0][0]).toHaveLength(2);
    expect(workspaceListener).toHaveBeenCalledTimes(1);
    expect(workspaceListener.mock.calls[0][0]).toHaveLength(2);
    expect(workspaceListener.mock.calls[0][0][0]).toEqual({
      type: "container-changed",
      containerId: "container",
      change: {
        type: "grid-changed",
        gridId: "midi",
        change: {
          type: "element-updated",
          elementId: "note",
          properties: ["startTick"],
        },
      },
    });
  });

  it("groups changes from sibling grids at container and workspace scope", () => {
    const first = createGrid("first");
    const second = createGrid("second");
    const a = new MidiNote(0, 0, 120, "a");
    const b = new MidiNote(0, 0, 120, "b");
    first.addElement(a);
    second.addElement(b);

    const container = new GridContainer([first, second], "container");
    const workspace = new EditorWorkspace([container], "workspace");
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const containerListener = vi.fn();
    const workspaceListener = vi.fn();

    first.onChange(firstListener);
    second.onChange(secondListener);
    container.onChange(containerListener);
    workspace.onChange(workspaceListener);

    workspace.batchChanges(() => {
      container.batchChanges(() => {
        first.batchChanges(() => {
          a.moveToTick(480);
          a.row = 1;
        });
        second.batchChanges(() => {
          b.moveToTick(720);
          b.row = 1;
        });
        expect(containerListener).not.toHaveBeenCalled();
        expect(workspaceListener).not.toHaveBeenCalled();
      });
      expect(containerListener).toHaveBeenCalledTimes(1);
      expect(workspaceListener).not.toHaveBeenCalled();
    });

    expect(firstListener).toHaveBeenCalledExactlyOnceWith([
      { type: "element-updated", elementId: "a", properties: ["startTick"] },
      { type: "element-updated", elementId: "a", properties: ["row"] },
    ]);
    expect(secondListener).toHaveBeenCalledExactlyOnceWith([
      { type: "element-updated", elementId: "b", properties: ["startTick"] },
      { type: "element-updated", elementId: "b", properties: ["row"] },
    ]);
    expect(containerListener).toHaveBeenCalledTimes(1);
    expect(containerListener.mock.calls[0][0]).toHaveLength(4);
    expect(workspaceListener).toHaveBeenCalledTimes(1);
    expect(workspaceListener.mock.calls[0][0]).toHaveLength(4);
  });

  it("can group separate containers at workspace scope", () => {
    const first = createGrid("first");
    const second = createGrid("second");
    const c1 = new GridContainer([first], "c1");
    const c2 = new GridContainer([second], "c2");
    const workspace = new EditorWorkspace([c1, c2], "workspace");
    const listener = vi.fn();
    workspace.onChange(listener);

    workspace.batchChanges(() => {
      first.addElement(new MidiNote(0, 0, 120, "a"));
      second.addElement(new MidiNote(0, 0, 120, "b"));
      expect(listener).not.toHaveBeenCalled();
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toHaveLength(2);
    expect(listener.mock.calls[0][0].map((event: {containerId: string}) => event.containerId))
      .toEqual(["c1", "c2"]);
  });

  it("batching a workspace alone does not defer grid notifications", () => {
    const grid = createGrid("midi");
    const note = new MidiNote(0, 0, 120, "note");
    grid.addElement(note);
    const container = new GridContainer([grid], "container");
    const workspace = new EditorWorkspace([container], "workspace");
    const gridListener = vi.fn();
    const workspaceListener = vi.fn();
    grid.onChange(gridListener);
    workspace.onChange(workspaceListener);

    workspace.batchChanges(() => {
      note.moveToTick(480);
      note.row = 1;
      expect(gridListener).toHaveBeenCalledTimes(2);
      expect(workspaceListener).not.toHaveBeenCalled();
    });

    expect(workspaceListener).toHaveBeenCalledTimes(1);
    expect(workspaceListener.mock.calls[0][0]).toHaveLength(2);
  });
});
