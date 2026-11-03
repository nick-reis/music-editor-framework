import type { GridContainerId, GridId } from "../types/ids";
import type { Grid } from "./Grid";

export class GridContainer {
  public readonly id: GridContainerId;

  private readonly grids = new Map<GridId, Grid>();

  constructor(
    grids: readonly Grid[] = [],
    id: GridContainerId = crypto.randomUUID(),
  ) {
    this.id = id;

    for (const grid of grids) {
      this.addGrid(grid);
    }
  }

  addGrid(grid: Grid): void {
    if (this.grids.has(grid.id)) {
      throw new Error(`Grid ${grid.id} already exists`);
    }

    this.grids.set(grid.id, grid);
  }

  removeGrid(id: GridId): boolean {
    return this.grids.delete(id);
  }

  getGrid(id: GridId): Grid | undefined {
    return this.grids.get(id);
  }

  getGrids(): readonly Grid[] {
    return [...this.grids.values()];
  }

  get gridCount(): number {
    return this.grids.size;
  }
}
