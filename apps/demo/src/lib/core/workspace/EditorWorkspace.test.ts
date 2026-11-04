import { describe, expect, it } from "vitest";
import { MidiNote } from "../elements/MidiNote";
import { GridContainer } from "../grids/GridContainer";
import { EditorWorkspace } from "./EditorWorkspace";

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

    firstWorkspace.selection.select(sharedElement.id);

    expect(firstWorkspace.selection.isSelected(sharedElement.id)).toBe(true);
    expect(secondWorkspace.selection.isSelected(sharedElement.id)).toBe(false);

    secondWorkspace.selection.select(sharedElement.id);
    firstWorkspace.selection.deselect(sharedElement.id);

    expect(firstWorkspace.selection.isSelected(sharedElement.id)).toBe(false);
    expect(secondWorkspace.selection.isSelected(sharedElement.id)).toBe(true);
  });
});
