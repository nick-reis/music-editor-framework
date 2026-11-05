import { ChangeBatchEmitter } from "../events/ChangeBatchEmitter";

import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";
import type { WorkspaceChange } from "../events/ModelChange";
import type { WorkspaceId, GridContainerId, GridId } from "../types/ids";
import type { Grid } from "../grids/Grid";

import { GridContainer } from "../grids/GridContainer";
import { SelectionManager } from "../managers/SelectionManager";

import { EditorHistory } from "../history/EditorHistory";
import { EditableElement } from "../elements/EditableElement";

export class EditorWorkspace {
  public readonly id: WorkspaceId;
  public readonly selection = new SelectionManager();

  public readonly history = new EditorHistory((target) =>
    this.ownsElement(target),
  );

  private readonly containers = new Map<GridContainerId, GridContainer>();
  private readonly changes = new ChangeBatchEmitter<WorkspaceChange>();

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

    for (const container of containers) {
      this.addContainer(container);
    }
  }

  onChange(listener: ChangeListener<readonly WorkspaceChange[]>): Unsubscribe {
    return this.changes.onChange(listener);
  }

  batchChanges<R>(operation: () => R): R {
    return this.changes.batch(operation);
  }

  addContainer(container: GridContainer): void {
    if (this.containers.has(container.id)) {
      throw new Error(`GridContainer ${container.id} already exists`);
    }

    if (container.workspace !== null) {
      throw new Error(
        `GridContainer ${container.id} already belongs to a workspace`,
      );
    }

    for (const grid of container.getGrids()) {
      if (this.getGrid(grid.id)) {
        throw new Error(`Grid ${grid.id} already exists in this document`);
      }
    }

    const unsubscribe = container.onChange((changes) => {
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
      container._attachToWorkspace(this);
    } catch (error) {
      unsubscribe();
      throw error;
    }

    this.containers.set(container.id, container);
    this.containerSubscriptions.set(container.id, unsubscribe);

    this.changes.emit({
      type: "container-added",
      containerId: container.id,
    });
  }

  removeContainer(id: GridContainerId): boolean {
    const container = this.containers.get(id);

    if (!container) return false;

    for (const grid of container.getGrids()) {
      const lockedElement = grid
        .getElements()
        .find((element) => element.locked);

      if (lockedElement) {
        throw new Error(`Element ${lockedElement.id} is locked`);
      }
    }

    container._detachFromWorkspace(this);

    this.containerSubscriptions.get(id)?.();
    this.containerSubscriptions.delete(id);
    this.containers.delete(id);

    this.reconcileSelection();

    this.changes.emit({
      type: "container-removed",
      containerId: id,
    });

    return true;
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

  private reconcileSelection(): void {
    this.selection.setSelection(
      [...this.selection.getSelectedElements()].filter(
        (element) =>
          element.grid !== null &&
          this.getGrid(element.grid.id) === element.grid,
      ),
    );
  }

  private ownsElement(target: object): boolean {
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
}
