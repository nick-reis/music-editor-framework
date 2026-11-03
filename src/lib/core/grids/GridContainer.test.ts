import { describe, expect, it } from "vitest";
import { GridContainer } from "./GridContainer";
import { MidiGrid } from "./MidiGrid";

const rows = [{ id: "row-1", label: "First", pitch: 60 }];

describe("GridContainer", () => {
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
