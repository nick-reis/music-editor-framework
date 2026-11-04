import { ChangeEmitter } from "../events/ChangeEmitter";
import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";
import type { GridContainerChange } from "../events/ModelChange";

import type { GridContainerId, GridId } from "../types/ids";
import type { Grid } from "./Grid";

export class GridContainer {
  public readonly id: GridContainerId;

  private readonly grids = new Map<GridId, Grid>();

  private readonly changes = new ChangeEmitter<GridContainerChange>();

  private readonly gridSubscriptions = new Map<GridId, Unsubscribe>();

  constructor(
    grids: readonly Grid[] = [],
    id: GridContainerId = crypto.randomUUID(),
  ) {
    this.id = id;

    for (const grid of grids) {
      this.addGrid(grid);
    }
  }

  onChange(listener: ChangeListener<GridContainerChange>): Unsubscribe {
    return this.changes.subscribe(listener);
  }

  addGrid(grid: Grid): void {
    if (this.grids.has(grid.id)) {
      throw new Error(`Grid ${grid.id} already exists`);
    }

    this.grids.set(grid.id, grid);

    const unsubscribe = grid.onChange((change) => {
      this.changes.emit({
        type: "grid-changed",
        gridId: grid.id,
        change,
      });
    });

    this.gridSubscriptions.set(grid.id, unsubscribe);

    this.changes.emit({
      type: "grid-added",
      gridId: grid.id,
    });
  }

  removeGrid(id: GridId): boolean {
    if (!this.grids.has(id)) {
      return false;
    }

    this.gridSubscriptions.get(id)?.();
    this.gridSubscriptions.delete(id);
    this.grids.delete(id);

    this.changes.emit({
      type: "grid-removed",
      gridId: id,
    });

    return true;
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
