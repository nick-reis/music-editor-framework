import type { EditableElement } from "../elements/EditableElement";
import type { Grid } from "../grids/Grid";
import type { GridContainer } from "../grids/GridContainer";
import type { EditorWorkspace } from "../workspace/EditorWorkspace";
import type { Timeline } from "../timeline/Timeline";

const gridsByElement = new WeakMap<EditableElement, Grid>();
const containersByGrid = new WeakMap<Grid, GridContainer>();
const workspacesByContainer = new WeakMap<GridContainer, EditorWorkspace>();
const registeredWorkspaces = new WeakSet<EditorWorkspace>();
const workspacesByTimeline = new WeakMap<Timeline, EditorWorkspace>();

/** @internal Assign each mutable timeline to exactly one workspace. */
export function attachTimelineToWorkspace(
  timeline: Timeline,
  workspace: EditorWorkspace,
): void {
  if (workspacesByTimeline.has(timeline)) {
    throw new Error("Timeline already belongs to a workspace");
  }
  workspacesByTimeline.set(timeline, workspace);
}

/** @internal Enables ownership resolution for mutations targeting the workspace itself. */
export function registerWorkspace(workspace: EditorWorkspace): void {
  registeredWorkspaces.add(workspace);
}

export function getElementGrid(element: EditableElement): Grid | null {
  return gridsByElement.get(element) ?? null;
}

export function attachElementToGrid(
  element: EditableElement,
  grid: Grid,
): void {
  if (getElementGrid(element) !== null) {
    throw new Error(`Element ${element.id} already belongs to a grid`);
  }

  if (element.row >= grid.rowCount) {
    throw new Error("Element row is outside grid bounds");
  }

  // Validate against the destination workspace before changing ownership.
  const workspace = grid.container?.workspace;
  if (workspace) workspace.timeline.assertFitsElement(element);

  gridsByElement.set(element, grid);
}

export function detachElementFromGrid(
  element: EditableElement,
  grid: Grid,
): void {
  if (getElementGrid(element) !== grid) {
    throw new Error(`Element ${element.id} does not belong to this grid`);
  }

  if (element.locked) {
    throw new Error(`Element ${element.id} is locked`);
  }

  gridsByElement.delete(element);
}

export function getGridContainer(grid: Grid): GridContainer | null {
  return containersByGrid.get(grid) ?? null;
}

export function attachGridToContainer(
  grid: Grid,
  container: GridContainer,
): void {
  if (getGridContainer(grid) !== null) {
    throw new Error(`Grid ${grid.id} already belongs to a container`);
  }

  const workspace = container.workspace;
  if (workspace) {
    for (const element of grid.getElements()) {
      workspace.timeline.assertFitsElement(element);
    }
  }

  containersByGrid.set(grid, container);
}

export function detachGridFromContainer(
  grid: Grid,
  container: GridContainer,
): void {
  if (getGridContainer(grid) !== container) {
    throw new Error(`Grid ${grid.id} does not belong to this container`);
  }

  containersByGrid.delete(grid);
}

export function reparentGridToContainer(
  grid: Grid,
  source: GridContainer,
  target: GridContainer,
): void {
  if (getGridContainer(grid) !== source) {
    throw new Error(`Grid ${grid.id} does not belong to the source`);
  }

  if (source.workspace !== target.workspace) {
    throw new Error(
      "Grid transfers require the same workspace or detached containers",
    );
  }

  containersByGrid.set(grid, target);
}

export function getContainerWorkspace(
  container: GridContainer,
): EditorWorkspace | null {
  return workspacesByContainer.get(container) ?? null;
}

export function attachContainerToWorkspace(
  container: GridContainer,
  workspace: EditorWorkspace,
): void {
  if (getContainerWorkspace(container) !== null) {
    throw new Error(
      `GridContainer ${container.id} already belongs to a workspace`,
    );
  }

  for (const grid of container.getGrids()) {
    for (const element of grid.getElements()) {
      workspace.timeline.assertFitsElement(element);
    }
  }

  workspacesByContainer.set(container, workspace);
}

export function detachContainerFromWorkspace(
  container: GridContainer,
  workspace: EditorWorkspace,
): void {
  if (getContainerWorkspace(container) !== workspace) {
    throw new Error(
      `GridContainer ${container.id} does not belong to this workspace`,
    );
  }

  workspacesByContainer.delete(container);
}

export function getOwningWorkspace(target: object): EditorWorkspace | null {
  if (registeredWorkspaces.has(target as EditorWorkspace)) {
    return target as EditorWorkspace;
  }

  const timelineOwner = workspacesByTimeline.get(target as Timeline);
  if (timelineOwner) return timelineOwner;

  const workspace = workspacesByContainer.get(target as GridContainer);
  if (workspace) return workspace;

  const container = containersByGrid.get(target as Grid);
  if (container) return getContainerWorkspace(container);

  const grid = gridsByElement.get(target as EditableElement);
  if (grid) return getOwningWorkspace(grid);

  return null;
}
