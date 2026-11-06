import { ChangeBatchEmitter } from "../events/ChangeBatchEmitter";
import { EditExecutor } from "../editing/EditExecutor";
import { OrderedChildren } from "../editing/OrderedChildren";
import {
  attachGridToContainer,
  detachGridFromContainer,
  getContainerWorkspace,
} from "../internal/ModelOwnership";

import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";
import type { GridChange, GridContainerChange } from "../events/ModelChange";
import type { GridContainerId, GridId } from "../types/ids";
import type { EditStep } from "../editing/EditPlan";
import type { Grid } from "./Grid";
import type { EditorWorkspace } from "../workspace/EditorWorkspace";

export class GridContainer {
  public readonly id: GridContainerId;
  private readonly changes = new ChangeBatchEmitter<GridContainerChange>(
    () => this.workspace,
  );

  private readonly children = new OrderedChildren<Grid>({
    validateRemove: (grid) => {
      const locked = grid.getElements().find((element) => element.locked);
      if (locked) throw new Error(`Element ${locked.id} is locked`);
    },
    isAttached: (grid) => grid.container === this,
    attach: (grid) => attachGridToContainer(grid, this),
    detach: (grid) => detachGridFromContainer(grid, this),
    subscribe: (grid) => grid.onInternalChange((changes) => {
      this.emitGridChanges(grid.id, changes);
    }),
    added: (grid) => this.changes.emit({ type: "grid-added", gridId: grid.id }),
    removed: (grid) => this.changes.emit({ type: "grid-removed", gridId: grid.id }),
    reordered: (grid, fromIndex, toIndex) => this.changes.emit({
      type: "grid-reordered",
      gridId: grid.id,
      fromIndex,
      toIndex,
    }),
  });

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
      if (ids.has(grid.id)) throw new Error(`Grid ${grid.id} already exists`);
      ids.add(grid.id);
    }
    for (const grid of grids) this.children.hydrate(grid);
  }

  get workspace(): EditorWorkspace | null {
    return getContainerWorkspace(this);
  }

  onChange(
    listener: ChangeListener<readonly GridContainerChange[]>,
  ): Unsubscribe {
    return this.changes.onChange(listener);
  }

  /** @internal Workspace propagation. */
  onInternalChange(
    listener: ChangeListener<readonly GridContainerChange[]>,
  ): Unsubscribe {
    return this.changes.onInternalChange(listener);
  }

  batchChanges<R>(operation: () => R): R {
    return this.changes.batch(operation);
  }

  addGrid(grid: Grid): void {
    if (grid.container !== null) {
      throw new Error(`Grid ${grid.id} already belongs to a container`);
    }
    if (this.getGrid(grid.id) || this.workspace?.getGrid(grid.id)) {
      throw new Error(`Grid ${grid.id} already exists`);
    }
    EditExecutor.execute({
      target: this,
      steps: [this.children.prepareInsert(grid, this.gridCount)],
    });
  }

  removeGrid(id: GridId): boolean {
    const grid = this.children.get(id);
    if (!grid) return false;
    EditExecutor.execute({
      target: this,
      steps: [this.children.prepareRemove(grid)],
    });
    return true;
  }

  reorderGrid(grid: Grid, index: number): void {
    const step = this.children.prepareReorder(grid, index);
    if (!step) return;
    EditExecutor.execute({
      target: this,
      steps: [step],
    });
  }

  transferGridTo(grid: Grid, target: GridContainer, index?: number): void {
    if (this.children.get(grid.id) !== grid) {
      throw new Error(`Grid ${grid.id} does not belong to this container`);
    }
    if (this.workspace !== target.workspace) {
      throw new Error(
        "Grid transfers require the same workspace or detached containers",
      );
    }
    if (target === this) {
      if (index !== undefined) this.reorderGrid(grid, index);
      return;
    }

    const insertAt = index ?? target.gridCount;
    if (!Number.isInteger(insertAt) ||
        insertAt < 0 || insertAt > target.gridCount) {
      throw new RangeError("Invalid destination index");
    }
    if (target.getGrid(grid.id)) {
      throw new Error(`Grid ${grid.id} already exists in destination`);
    }
    // A grid may contain locked elements: reparenting the grid does not
    // mutate them, so structural transfers are legal without unlocking.
    const remove = this.children.prepareRemove(grid, { allowLocked: true });
    const insert = target.children.prepareInsert(
      grid, insertAt, { allowLockedOnUndo: true },
    );
    const guarded: EditStep[] = [
      { ...remove, targets: [this] },
      { ...insert, targets: [target] },
    ];
    const workspace = this.workspace;

    EditExecutor.execute({
      target: this,
      steps: guarded,
      batchTargets: workspace ? [workspace] : [],
    });
  }

  getGrid(id: GridId): Grid | undefined {
    return this.children.get(id);
  }

  getGrids(): readonly Grid[] {
    return this.children.all();
  }

  get gridCount(): number {
    return this.children.size;
  }

  private emitGridChanges(gridId: GridId, changes: readonly GridChange[]): void {
    this.changes.batch(() => {
      for (const change of changes) {
        this.changes.emit({ type: "grid-changed", gridId, change });
      }
    });
  }
}
