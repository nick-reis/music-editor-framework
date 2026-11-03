import type { WorkspaceId, GridContainerId } from "../types/ids";

import { GridContainer } from "../grids/GridContainer";

//Eventually will own clipboard history per workspace and track selected elements

export class EditorWorkspace {
  public readonly id: WorkspaceId;

  private readonly containers = new Map<GridContainerId, GridContainer>();

  constructor(
    containers: readonly GridContainer[] = [],
    id: WorkspaceId = crypto.randomUUID(),
  ) {
    this.id = id;

    for (const container of containers) {
      this.addContainer(container);
    }
  }

  addContainer(container: GridContainer): void {
    if (this.containers.has(container.id)) {
      throw new Error(`GridContainer ${container.id} already exists`);
    }

    this.containers.set(container.id, container);
  }

  removeContainer(id: GridContainerId): boolean {
    return this.containers.delete(id);
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
