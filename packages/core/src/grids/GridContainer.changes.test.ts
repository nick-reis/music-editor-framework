import { describe, expect, it, vi } from "vitest";
import { AudioClip } from "../elements/AudioClip";
import { AudioGrid } from "./AudioGrid";
import { GridContainer } from "./GridContainer";

function createGrid(id = "grid-1") {
  return new AudioGrid(
    [{ id: "row-0", label: "Audio" }],
    id,
  );
}

describe("GridContainer change notifications", () => {
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
