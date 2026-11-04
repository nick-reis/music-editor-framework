import { ChangeEmitter } from "../events/ChangeEmitter";
import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";
import type { WorkspaceChange } from "../events/ModelChange";

import type { WorkspaceId, GridContainerId } from "../types/ids";

import { GridContainer } from "../grids/GridContainer";
import { SelectionManager } from "../managers/SelectionManager";

export class EditorWorkspace {
  public readonly id: WorkspaceId;

  public readonly selection = new SelectionManager();

  private readonly containers = new Map<GridContainerId, GridContainer>();

  private readonly changes = new ChangeEmitter<WorkspaceChange>();

  private readonly containerSubscriptions = new Map<
    GridContainerId,
    Unsubscribe
  >();

  constructor(
    containers: readonly GridContainer[] = [],
    id: WorkspaceId = crypto.randomUUID(),
  ) {
    this.id = id;

    for (const container of containers) {
      this.addContainer(container);
    }
  }

  onChange(listener: ChangeListener<WorkspaceChange>): Unsubscribe {
    return this.changes.subscribe(listener);
  }

  addContainer(container: GridContainer): void {
    if (this.containers.has(container.id)) {
      throw new Error(`GridContainer ${container.id} already exists`);
    }

    this.containers.set(container.id, container);

    const unsubscribe = container.onChange((change) => {
      this.changes.emit({
        type: "container-changed",
        containerId: container.id,
        change,
      });
    });

    this.containerSubscriptions.set(container.id, unsubscribe);

    this.changes.emit({
      type: "container-added",
      containerId: container.id,
    });
  }

  removeContainer(id: GridContainerId): boolean {
    if (!this.containers.has(id)) {
      return false;
    }

    this.containerSubscriptions.get(id)?.();
    this.containerSubscriptions.delete(id);
    this.containers.delete(id);

    this.changes.emit({
      type: "container-removed",
      containerId: id,
    });

    return true;
  }

  getContainer(id: GridContainerId): GridContainer | undefined {
    return this.containers.get(id);
  }

  getContainers(): readonly GridContainer[] {
    return [...this.containers.values()];
  }

  get containerCount(): number {
    return this.containers.size;
  }
}
