import { ChangeBatchEmitter } from "../events/ChangeBatchEmitter";
import { MutationCapture } from "../mutations/MutationCapture";
import {
  attachGridToContainer,
  detachGridFromContainer,
  getContainerWorkspace,
  reparentGridToContainer,
} from "../internal/ModelOwnership";

import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";
import type { GridChange, GridContainerChange } from "../events/ModelChange";
import type { GridContainerId, GridId } from "../types/ids";
import type { Grid } from "./Grid";
import type { EditorWorkspace } from "../workspace/EditorWorkspace";

type StructureState = Readonly<{ grids: readonly Grid[] }>;

export class GridContainer {
  public readonly id: GridContainerId;

  private readonly grids = new Map<GridId, Grid>();
  private readonly changes = new ChangeBatchEmitter<GridContainerChange>();
  private readonly gridSubscriptions = new Map<GridId, Unsubscribe>();
  private structure: StructureState = Object.freeze({
    grids: Object.freeze([]),
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

      if (ids.has(grid.id)) {
        throw new Error(`Grid ${grid.id} already exists`);
      }

      ids.add(grid.id);
    }

    for (const grid of grids) {
      this.insertGrid(grid, this.gridCount, false);
    }
  }

  get workspace(): EditorWorkspace | null {
    return getContainerWorkspace(this);
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
    this.insertGrid(grid, this.gridCount);
  }

  removeGrid(id: GridId): boolean {
    const grid = this.grids.get(id);
    if (!grid) return false;

    this.removeExactGrid(grid);
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

    MutationCapture.assertTarget(this);
    const before = this.structure;

    ordered.splice(fromIndex, 1);
    ordered.splice(index, 0, grid);

    this.grids.clear();
    for (const item of ordered) this.grids.set(item.id, item);

    const after = this.updateStructure();

    MutationCapture.record({
      target: this,
      before,
      after,
      undo: () =>
        this.replayStructure(after, before, () =>
          this.reorderGrid(grid, fromIndex),
        ),
      redo: () =>
        this.replayStructure(before, after, () =>
          this.reorderGrid(grid, index),
        ),
    });

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

    MutationCapture.assertTarget(this);
    MutationCapture.assertTarget(target);

    const sourceIndex = [...this.grids.keys()].indexOf(grid.id);
    const sourceBefore = this.structure;
    const targetBefore = target.structure;
    const destinationGrids = [...target.grids.values()];
    destinationGrids.splice(insertAt, 0, grid);

    const destinationSubscription = grid.onChange((changes) => {
      target.emitGridChanges(grid.id, changes);
    });

    const apply = () => {
      reparentGridToContainer(grid, this, target);

      this.gridSubscriptions.get(grid.id)?.();
      this.gridSubscriptions.delete(grid.id);
      this.grids.delete(grid.id);

      target.grids.clear();
      for (const item of destinationGrids) {
        target.grids.set(item.id, item);
      }
      target.gridSubscriptions.set(grid.id, destinationSubscription);

      const sourceAfter = this.updateStructure();
      const targetAfter = target.updateStructure();

      MutationCapture.record({
        target: this,
        before: Object.freeze({
          source: sourceBefore,
          target: targetBefore,
        }),
        after: Object.freeze({
          source: sourceAfter,
          target: targetAfter,
        }),
        undo: () =>
          GridContainer.replayTransfer(
            target,
            this,
            grid,
            sourceIndex,
            targetAfter,
            sourceAfter,
            targetBefore,
            sourceBefore,
          ),
        redo: () =>
          GridContainer.replayTransfer(
            this,
            target,
            grid,
            insertAt,
            sourceBefore,
            targetBefore,
            sourceAfter,
            targetAfter,
          ),
      });

      this.changes.emit({ type: "grid-removed", gridId: grid.id });
      target.changes.emit({ type: "grid-added", gridId: grid.id });
    };

    if (this.workspace) {
      this.workspace.batchChanges(apply);
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

  private insertGrid(grid: Grid, index: number, track = true): void {
    if (this.grids.has(grid.id) || this.workspace?.getGrid(grid.id)) {
      throw new Error(`Grid ${grid.id} already exists`);
    }

    if (grid.container !== null) {
      throw new Error(`Grid ${grid.id} already belongs to a container`);
    }

    if (!Number.isInteger(index) || index < 0 || index > this.gridCount) {
      throw new RangeError("Invalid grid insertion index");
    }

    if (track) MutationCapture.assertTarget(this);
    const before = this.structure;
    const unsubscribe = grid.onChange((changes) => {
      this.emitGridChanges(grid.id, changes);
    });

    try {
      attachGridToContainer(grid, this);
    } catch (error) {
      unsubscribe();
      throw error;
    }

    const ordered = [...this.grids.values()];
    ordered.splice(index, 0, grid);
    this.grids.clear();
    for (const item of ordered) this.grids.set(item.id, item);
    this.gridSubscriptions.set(grid.id, unsubscribe);

    const after = this.updateStructure();

    if (track) {
      MutationCapture.record({
        target: this,
        before,
        after,
        undo: () =>
          this.replayStructure(after, before, () => this.removeExactGrid(grid)),
        redo: () =>
          this.replayStructure(before, after, () =>
            this.insertGrid(grid, index),
          ),
      });
    }

    this.changes.emit({ type: "grid-added", gridId: grid.id });
  }

  private removeExactGrid(grid: Grid): void {
    if (this.grids.get(grid.id) !== grid) {
      throw new Error(`Grid ${grid.id} is no longer the same container member`);
    }

    const lockedElement = grid.getElements().find((element) => element.locked);
    if (lockedElement) {
      throw new Error(`Element ${lockedElement.id} is locked`);
    }

    MutationCapture.assertTarget(this);
    const before = this.structure;
    const index = [...this.grids.keys()].indexOf(grid.id);

    detachGridFromContainer(grid, this);
    this.gridSubscriptions.get(grid.id)?.();
    this.gridSubscriptions.delete(grid.id);
    this.grids.delete(grid.id);

    const after = this.updateStructure();

    MutationCapture.record({
      target: this,
      before,
      after,
      undo: () =>
        this.replayStructure(after, before, () =>
          this.insertGrid(grid, index),
        ),
      redo: () =>
        this.replayStructure(before, after, () => this.removeExactGrid(grid)),
    });

    this.changes.emit({ type: "grid-removed", gridId: grid.id });
  }

  private updateStructure(): StructureState {
    this.structure = Object.freeze({
      grids: Object.freeze([...this.grids.values()]),
    });
    return this.structure;
  }

  private replayStructure(
    expected: StructureState,
    restored: StructureState,
    operation: () => void,
  ): void {
    if (MutationCapture.isRecording(this)) {
      throw new Error("Cannot replay during mutation capture");
    }
    this.assertStructure(expected);
    operation();
    this.structure = restored;
  }

  private assertStructure(expected: StructureState): void {
    if (this.structure !== expected) {
      throw new Error(
        `GridContainer ${this.id} was modified outside this mutation`,
      );
    }
  }

  private static replayTransfer(
    from: GridContainer,
    to: GridContainer,
    grid: Grid,
    index: number,
    expectedFrom: StructureState,
    expectedTo: StructureState,
    restoredFrom: StructureState,
    restoredTo: StructureState,
  ): void {
    if (MutationCapture.isRecording(from) || MutationCapture.isRecording(to)) {
      throw new Error("Cannot replay during mutation capture");
    }
    from.assertStructure(expectedFrom);
    to.assertStructure(expectedTo);
    from.transferGridTo(grid, to, index);
    from.structure = restoredFrom;
    to.structure = restoredTo;
  }

  private emitGridChanges(
    gridId: GridId,
    changes: readonly GridChange[],
  ): void {
    this.changes.batch(() => {
      for (const change of changes) {
        this.changes.emit({ type: "grid-changed", gridId, change });
      }
    });
  }
}
