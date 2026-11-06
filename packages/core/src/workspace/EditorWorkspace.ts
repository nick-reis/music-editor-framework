import { ChangeBatchEmitter } from "../events/ChangeBatchEmitter";
import { EditExecutor } from "../editing/EditExecutor";
import { OrderedChildren } from "../editing/OrderedChildren";
import { NotificationTransaction } from "../events/NotificationTransaction";
import {
  attachContainerToWorkspace,
  detachContainerFromWorkspace,
  registerWorkspace,
  attachTimelineToWorkspace,
  getOwningWorkspace,
} from "../internal/ModelOwnership";

import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";
import type { WorkspaceChange } from "../events/ModelChange";
import type { WorkspaceId, GridContainerId, GridId } from "../types/ids";
import type { Offset, Position } from "../types/time";
import type { RowIndex } from "../types/coordinates";

import { Grid } from "../grids/Grid";
import { GridContainer } from "../grids/GridContainer";
import { SelectionManager } from "../managers/SelectionManager";
import { EditorHistory } from "../history/EditorHistory";
import { EditableElement } from "../elements/EditableElement";
import { Timeline } from "../timeline/Timeline";
import { moveElements as applyGroupedMove } from "../operations/ElementOperations";

export class EditorWorkspace {
  public readonly id: WorkspaceId;
  public readonly selection = new SelectionManager();
  private readonly _timeline: Timeline;

  public readonly history = new EditorHistory(
    (target) => this.ownsTarget(target),
    { owner: this, ownerOf: EditorWorkspace.ownerOf },
  );

  private readonly changes = new ChangeBatchEmitter<WorkspaceChange>(
    () => this,
  );

  private readonly children = new OrderedChildren<GridContainer>({
    validateRemove: (container) => {
      for (const grid of container.getGrids()) {
        const locked = grid.getElements().find((element) => element.locked);
        if (locked) throw new Error(`Element ${locked.id} is locked`);
      }
    },
    isAttached: (container) => container.workspace === this,
    attach: (container) => attachContainerToWorkspace(container, this),
    detach: (container) => detachContainerFromWorkspace(container, this),
    subscribe: (container) => container.onInternalChange((changes) => {
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
    }),
    added: (container) => this.changes.emit({
      type: "container-added", containerId: container.id,
    }),
    removed: (container) => {
      this.reconcileSelection();
      this.changes.emit({
        type: "container-removed", containerId: container.id,
      });
    },
    reordered: (container, fromIndex, toIndex) => this.changes.emit({
      type: "container-reordered",
      containerId: container.id,
      fromIndex,
      toIndex,
    }),
  });

  constructor(
    containers: readonly GridContainer[] = [],
    id: WorkspaceId = crypto.randomUUID(),
    timeline: Timeline = new Timeline(),
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
        for (const element of grid.getElements()) {
          timeline.assertFitsElement(element);
        }
      }
    }

    attachTimelineToWorkspace(timeline, this);
    this._timeline = timeline;
    this.timeline.onInternalChange((change) => {
      this.changes.emit({ type: "timeline-changed", change });
    });
    registerWorkspace(this);
    for (const container of containers) this.children.hydrate(container);
  }

  get timeline(): Timeline {
    return this._timeline;
  }

  onChange(listener: ChangeListener<readonly WorkspaceChange[]>): Unsubscribe {
    return this.changes.onChange(listener);
  }

  batchChanges<R>(operation: () => R): R {
    return this.changes.batch(operation);
  }

  addContainer(container: GridContainer, index = this.containerCount): void {
    if (!Number.isInteger(index) || index < 0 || index > this.containerCount) {
      throw new RangeError("Invalid container insertion index");
    }
    if (container.workspace !== null) {
      throw new Error(
        `GridContainer ${container.id} already belongs to a workspace`,
      );
    }
    if (this.getContainer(container.id)) {
      throw new Error(`GridContainer ${container.id} already exists`);
    }
    for (const grid of container.getGrids()) {
      if (this.getGrid(grid.id)) {
        throw new Error(`Grid ${grid.id} already exists in this document`);
      }
    }
    EditExecutor.execute({
      target: this,
      steps: [this.children.prepareInsert(container, index)],
    });
  }

  removeContainer(id: GridContainerId): boolean {
    const container = this.children.get(id);
    if (!container) return false;
    EditExecutor.execute({
      target: this,
      steps: [this.children.prepareRemove(container)],
    });
    return true;
  }

  reorderContainer(container: GridContainer, index: number): void {
    if (this.children.get(container.id) !== container) {
      throw new Error(`GridContainer ${container.id} does not belong to this workspace`);
    }
    if (!Number.isInteger(index) || index < 0 || index >= this.containerCount) {
      throw new RangeError("Invalid container index");
    }
    const step = this.children.prepareReorder(container, index);
    if (!step) return;
    EditExecutor.execute({
      target: this,
      steps: [step],
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

  /** Move all selected elements atomically with one shared offset. */
  moveElements(
    elements: readonly EditableElement[],
    options: { readonly by: Offset; readonly rows?: number },
  ): void {
    applyGroupedMove(this, elements, options);
  }

  /** Move one element between compatible grids without changing its identity. */
  moveElementToGrid(
    element: EditableElement,
    target: Grid,
    options: {
      readonly row: RowIndex;
      readonly start?: Position;
      readonly index?: number;
    },
  ): void {
    const source = element.grid;
    if (!source || this.getGrid(source.id) !== source || this.getGrid(target.id) !== target) {
      throw new Error("Element and destination grid must belong to this workspace");
    }
    if (source === target) {
      throw new Error("Element is already in the destination grid");
    }
    const tick = options.start === undefined
      ? element.startTick
      : this.timeline.toTick(options.start);
    source.transferElementTo(element, target, {
      row: options.row,
      startTick: tick,
      index: options.index,
    });
  }

  getContainer(id: GridContainerId): GridContainer | undefined {
    return this.children.get(id);
  }

  getContainers(): readonly GridContainer[] {
    return this.children.all();
  }

  getGrid(id: GridId): Grid | undefined {
    for (const container of this.children.all()) {
      const grid = container.getGrid(id);
      if (grid) return grid;
    }
    return undefined;
  }

  getGrids(): readonly Grid[] {
    return this.children.all().flatMap((container) => container.getGrids());
  }

  get containerCount(): number {
    return this.children.size;
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
    if (target === this || target === this.timeline) {
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

    if (target instanceof Timeline) {
      return getOwningWorkspace(target);
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
