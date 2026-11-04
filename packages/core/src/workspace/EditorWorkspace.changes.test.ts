import { describe, expect, it, vi } from "vitest";
import { AudioClip } from "../elements/AudioClip";
import { AudioGrid } from "../grids/AudioGrid";
import { GridContainer } from "../grids/GridContainer";
import { EditorWorkspace } from "./EditorWorkspace";

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

describe("EditorWorkspace change notifications", () => {
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
    workspace.selection.select("clip-1");

    expect(listener).not.toHaveBeenCalled();
  });
});
