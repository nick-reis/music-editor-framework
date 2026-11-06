import { ChangeBatchEmitter } from "../events/ChangeBatchEmitter";
import { NotificationTransaction } from "../events/NotificationTransaction";
import { MutationCapture } from "../mutations/MutationCapture";
import {
  attachContainerToWorkspace,
  detachContainerFromWorkspace,
  registerWorkspace,
} from "../internal/ModelOwnership";

import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";
import type { WorkspaceChange } from "../events/ModelChange";
import type { WorkspaceId, GridContainerId, GridId } from "../types/ids";

import { Grid } from "../grids/Grid";
import { GridContainer } from "../grids/GridContainer";
import { SelectionManager } from "../managers/SelectionManager";
import { EditorHistory } from "../history/EditorHistory";
import { EditableElement } from "../elements/EditableElement";

type StructureState = Readonly<{
  containers: readonly GridContainer[];
}>;

export class EditorWorkspace {
  public readonly id: WorkspaceId;
  public readonly selection = new SelectionManager();

  public readonly history = new EditorHistory(
    (target) => this.ownsTarget(target),
    {
      owner: this,
      ownerOf: EditorWorkspace.ownerOf,
    },
  );

  private readonly containers = new Map<GridContainerId, GridContainer>();
  private structure: StructureState = Object.freeze({
    containers: Object.freeze([]),
  });
  private readonly changes = new ChangeBatchEmitter<WorkspaceChange>(
    () => this,
  );

  private readonly containerSubscriptions = new Map<
    GridContainerId,
    Unsubscribe
  >();

  constructor(
    containers: readonly GridContainer[] = [],
    id: WorkspaceId = crypto.randomUUID(),
  ) {
    this.id = id;

    const containerIds = new Set<GridContainerId>();
    const gridIds = new Set<GridId>();

    for (const container of containers) {
      if (container.workspace !== null) {
        throw new Error(
          `GridContainer ${container.id} already belongs to a workspace`,
        );
      }

      if (containerIds.has(container.id)) {
        throw new Error(`GridContainer ${container.id} already exists`);
      }

      containerIds.add(container.id);

      for (const grid of container.getGrids()) {
        if (gridIds.has(grid.id)) {
          throw new Error(`Grid ${grid.id} already exists in this document`);
        }

        gridIds.add(grid.id);
      }
    }

    registerWorkspace(this);

    for (const container of containers) {
      this.insertContainer(container, this.containerCount, false);
    }
  }

  onChange(listener: ChangeListener<readonly WorkspaceChange[]>): Unsubscribe {
    return this.changes.onChange(listener);
  }

  batchChanges<R>(operation: () => R): R {
    return this.changes.batch(operation);
  }

  /**
   * Append by default, or insert at a zero-based index in [0, containerCount].
   * Direct calls invalidate history; calls inside history.execute are undoable.
   */
  addContainer(container: GridContainer, index = this.containerCount): void {
    this.insertContainer(container, index);
  }

  removeContainer(id: GridContainerId): boolean {
    const container = this.containers.get(id);
    if (!container) return false;

    this.removeExactContainer(container);
    return true;
  }

  reorderContainer(container: GridContainer, index: number): void {
    if (this.containers.get(container.id) !== container) {
      throw new Error(
        `GridContainer ${container.id} does not belong to this workspace`,
      );
    }

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.containerCount
    ) {
      throw new RangeError("Invalid container index");
    }

    const ordered = [...this.containers.values()];
    const fromIndex = ordered.indexOf(container);
    if (fromIndex === index) return;

    MutationCapture.assertTarget(this);
    const before = this.structure;

    ordered.splice(fromIndex, 1);
    ordered.splice(index, 0, container);

    this.containers.clear();
    for (const item of ordered) {
      this.containers.set(item.id, item);
    }

    const after = this.updateStructure();

    MutationCapture.record({
      target: this,
      before,
      after,
      undo: () =>
        this.replayStructure(after, before, () =>
          this.reorderContainer(container, fromIndex),
        ),
      redo: () =>
        this.replayStructure(before, after, () =>
          this.reorderContainer(container, index),
        ),
    });

    this.changes.emit({
      type: "container-reordered",
      containerId: container.id,
      fromIndex,
      toIndex: index,
    });
  }

  moveGrid(grid: Grid, target: GridContainer, index?: number): void {
    const source = grid.container;

    if (
      source === null ||
      source.workspace !== this ||
      target.workspace !== this
    ) {
      throw new Error(
        "Grid and destination container must belong to this workspace",
      );
    }

    source.transferGridTo(grid, target, index);
  }

  getContainer(id: GridContainerId): GridContainer | undefined {
    return this.containers.get(id);
  }

  getContainers(): readonly GridContainer[] {
    return [...this.containers.values()];
  }

  getGrid(id: GridId): Grid | undefined {
    for (const container of this.containers.values()) {
      const grid = container.getGrid(id);

      if (grid) return grid;
    }

    return undefined;
  }

  getGrids(): readonly Grid[] {
    return this.getContainers().flatMap((container) => container.getGrids());
  }

  get containerCount(): number {
    return this.containers.size;
  }

  private insertContainer(
    container: GridContainer,
    index: number,
    track = true,
  ): void {
    if (this.containers.has(container.id)) {
      throw new Error(`GridContainer ${container.id} already exists`);
    }

    if (container.workspace !== null) {
      throw new Error(
        `GridContainer ${container.id} already belongs to a workspace`,
      );
    }

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index > this.containerCount
    ) {
      throw new RangeError("Invalid container insertion index");
    }

    for (const grid of container.getGrids()) {
      if (this.getGrid(grid.id)) {
        throw new Error(`Grid ${grid.id} already exists in this document`);
      }
    }

    if (track) MutationCapture.assertTarget(this);
    const before = this.structure;

    const unsubscribe = container.onInternalChange((changes) => {
      this.changes.batch(() => {
        for (const change of changes) {
          if (
            change.type === "grid-removed" ||
            (change.type === "grid-changed" &&
              change.change.type === "element-removed")
          ) {
            this.reconcileSelection();
          }

          this.changes.emit({
            type: "container-changed",
            containerId: container.id,
            change,
          });
        }
      });
    });

    try {
      attachContainerToWorkspace(container, this);
    } catch (error) {
      unsubscribe();
      throw error;
    }

    const ordered = [...this.containers.values()];
    ordered.splice(index, 0, container);
    this.containers.clear();
    for (const item of ordered) {
      this.containers.set(item.id, item);
    }
    this.containerSubscriptions.set(container.id, unsubscribe);

    const after = this.updateStructure();

    if (track) {
      MutationCapture.record({
        target: this,
        before,
        after,
        undo: () =>
          this.replayStructure(after, before, () =>
            this.removeExactContainer(container),
          ),
        redo: () =>
          this.replayStructure(before, after, () =>
            this.insertContainer(container, index),
          ),
      });
    }

    this.changes.emit({
      type: "container-added",
      containerId: container.id,
    });
  }

  private removeExactContainer(container: GridContainer): void {
    if (this.containers.get(container.id) !== container) {
      throw new Error(
        `GridContainer ${container.id} is no longer the same workspace member`,
      );
    }

    for (const grid of container.getGrids()) {
      const lockedElement = grid
        .getElements()
        .find((element) => element.locked);

      if (lockedElement) {
        throw new Error(`Element ${lockedElement.id} is locked`);
      }
    }

    MutationCapture.assertTarget(this);
    const before = this.structure;
    const index = [...this.containers.keys()].indexOf(container.id);

    detachContainerFromWorkspace(container, this);

    this.containerSubscriptions.get(container.id)?.();
    this.containerSubscriptions.delete(container.id);
    this.containers.delete(container.id);

    const after = this.updateStructure();

    MutationCapture.record({
      target: this,
      before,
      after,
      undo: () =>
        this.replayStructure(after, before, () =>
          this.insertContainer(container, index),
        ),
      redo: () =>
        this.replayStructure(before, after, () =>
          this.removeExactContainer(container),
        ),
    });

    this.reconcileSelection();

    this.changes.emit({
      type: "container-removed",
      containerId: container.id,
    });
  }

  private updateStructure(): StructureState {
    this.structure = Object.freeze({
      containers: Object.freeze([...this.containers.values()]),
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

    if (this.structure !== expected) {
      throw new Error(
        `EditorWorkspace ${this.id} was modified outside this mutation`,
      );
    }

    operation();
    this.structure = restored;
  }

  private reconcileSelection(): void {
    NotificationTransaction.afterCommit(this, this.selection, () => {
      this.selection.setSelection(
        [...this.selection.getSelectedElements()].filter(
          (element) =>
            element.grid !== null &&
            this.getGrid(element.grid.id) === element.grid,
        ),
      );
    });
  }

  private ownsTarget(target: object): boolean {
    if (target === this) {
      return true;
    }
    if (target instanceof GridContainer) {
      return this.getContainer(target.id) === target;
    }

    if (target instanceof Grid) {
      return this.getGrid(target.id) === target;
    }

    if (!(target instanceof EditableElement)) {
      return false;
    }

    const grid = target.grid;

    return (
      grid !== null &&
      this.getGrid(grid.id) === grid &&
      grid.getElement(target.id) === target
    );
  }

  private static ownerOf(target: object): EditorWorkspace | null {
    if (target instanceof EditorWorkspace) {
      return target;
    }

    if (target instanceof GridContainer) {
      return target.workspace;
    }

    if (target instanceof Grid) {
      return target.container?.workspace ?? null;
    }

    if (target instanceof EditableElement) {
      return target.grid?.container?.workspace ?? null;
    }

    return null;
  }
}
