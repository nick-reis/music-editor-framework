import { ChangeBatchEmitter } from "../events/ChangeBatchEmitter";

import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";
import type { GridChange, GridContainerChange } from "../events/ModelChange";
import type { GridContainerId, GridId } from "../types/ids";
import type { Grid } from "./Grid";
import type { EditorWorkspace } from "../workspace/EditorWorkspace";

export class GridContainer {
  public readonly id: GridContainerId;

  private readonly grids = new Map<GridId, Grid>();
  private readonly changes = new ChangeBatchEmitter<GridContainerChange>();
  private readonly gridSubscriptions = new Map<GridId, Unsubscribe>();
  private _workspace: EditorWorkspace | null = null;

  constructor(
    grids: readonly Grid[] = [],
    id: GridContainerId = crypto.randomUUID(),
  ) {
    this.id = id;

    const ids = new Set<GridId>();

    for (const grid of grids) {
      if (grid.container !== null) {
        throw new Error(`Grid ${grid.id} already belongs to a container`);
      }

      if (ids.has(grid.id)) {
        throw new Error(`Grid ${grid.id} already exists`);
      }

      ids.add(grid.id);
    }

    for (const grid of grids) {
      this.addGrid(grid);
    }
  }

  get workspace(): EditorWorkspace | null {
    return this._workspace;
  }

  onChange(
    listener: ChangeListener<readonly GridContainerChange[]>,
  ): Unsubscribe {
    return this.changes.onChange(listener);
  }

  batchChanges<R>(operation: () => R): R {
    return this.changes.batch(operation);
  }

  addGrid(grid: Grid): void {
    if (this.grids.has(grid.id) || this._workspace?.getGrid(grid.id)) {
      throw new Error(`Grid ${grid.id} already exists`);
    }

    if (grid.container !== null) {
      throw new Error(`Grid ${grid.id} already belongs to a container`);
    }

    const unsubscribe = grid.onChange((changes) => {
      this.emitGridChanges(grid.id, changes);
    });

    try {
      grid._attachToContainer(this);
    } catch (error) {
      unsubscribe();
      throw error;
    }

    this.grids.set(grid.id, grid);
    this.gridSubscriptions.set(grid.id, unsubscribe);

    this.changes.emit({
      type: "grid-added",
      gridId: grid.id,
    });
  }

  removeGrid(id: GridId): boolean {
    const grid = this.grids.get(id);

    if (!grid) return false;

    const lockedElement = grid.getElements().find((element) => element.locked);

    if (lockedElement) {
      throw new Error(`Element ${lockedElement.id} is locked`);
    }

    grid._detachFromContainer(this);

    this.gridSubscriptions.get(id)?.();
    this.gridSubscriptions.delete(id);
    this.grids.delete(id);

    this.changes.emit({
      type: "grid-removed",
      gridId: id,
    });

    return true;
  }

  reorderGrid(grid: Grid, index: number): void {
    if (this.grids.get(grid.id) !== grid) {
      throw new Error(`Grid ${grid.id} does not belong to this container`);
    }

    if (!Number.isInteger(index) || index < 0 || index >= this.gridCount) {
      throw new RangeError("Invalid grid index");
    }

    const ordered = [...this.grids.values()];
    const fromIndex = ordered.indexOf(grid);

    if (fromIndex === index) return;

    ordered.splice(fromIndex, 1);
    ordered.splice(index, 0, grid);

    this.grids.clear();

    for (const item of ordered) {
      this.grids.set(item.id, item);
    }

    this.changes.emit({
      type: "grid-reordered",
      gridId: grid.id,
      fromIndex,
      toIndex: index,
    });
  }

  transferGridTo(grid: Grid, target: GridContainer, index?: number): void {
    if (this.grids.get(grid.id) !== grid) {
      throw new Error(`Grid ${grid.id} does not belong to this container`);
    }

    if (this._workspace !== target._workspace) {
      throw new Error(
        "Grid transfers require the same workspace or detached containers",
      );
    }

    if (target === this) {
      if (index !== undefined) {
        this.reorderGrid(grid, index);
      }

      return;
    }

    const insertAt = index ?? target.gridCount;

    if (
      !Number.isInteger(insertAt) ||
      insertAt < 0 ||
      insertAt > target.gridCount
    ) {
      throw new RangeError("Invalid destination index");
    }

    if (target.grids.has(grid.id)) {
      throw new Error(`Grid ${grid.id} already exists in destination`);
    }

    const destinationGrids = [...target.grids.values()];
    destinationGrids.splice(insertAt, 0, grid);

    const destinationSubscription = grid.onChange((changes) => {
      target.emitGridChanges(grid.id, changes);
    });

    const apply = () => {
      grid._reparentToContainer(this, target);

      this.gridSubscriptions.get(grid.id)?.();
      this.gridSubscriptions.delete(grid.id);
      this.grids.delete(grid.id);

      target.grids.clear();

      for (const item of destinationGrids) {
        target.grids.set(item.id, item);
      }

      target.gridSubscriptions.set(grid.id, destinationSubscription);

      this.changes.emit({
        type: "grid-removed",
        gridId: grid.id,
      });

      target.changes.emit({
        type: "grid-added",
        gridId: grid.id,
      });
    };

    if (this._workspace) {
      this._workspace.batchChanges(apply);
    } else {
      apply();
    }
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

  _attachToWorkspace(workspace: EditorWorkspace): void {
    if (this._workspace !== null) {
      throw new Error(
        `GridContainer ${this.id} already belongs to a workspace`,
      );
    }

    this._workspace = workspace;
  }

  _detachFromWorkspace(workspace: EditorWorkspace): void {
    if (this._workspace !== workspace) {
      throw new Error(
        `GridContainer ${this.id} does not belong to this workspace`,
      );
    }

    this._workspace = null;
  }

  private emitGridChanges(
    gridId: GridId,
    changes: readonly GridChange[],
  ): void {
    this.changes.batch(() => {
      for (const change of changes) {
        this.changes.emit({
          type: "grid-changed",
          gridId,
          change,
        });
      }
    });
  }
}
