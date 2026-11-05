import type { EditableElement } from "../elements/EditableElement";
import type { Grid } from "../grids/Grid";
import type { GridContainer } from "../grids/GridContainer";
import type { EditorWorkspace } from "../workspace/EditorWorkspace";

const gridsByElement = new WeakMap<EditableElement, Grid>();
const containersByGrid = new WeakMap<Grid, GridContainer>();
const workspacesByContainer = new WeakMap<GridContainer, EditorWorkspace>();

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
  const workspace = workspacesByContainer.get(target as GridContainer);
  if (workspace) return workspace;

  const container = containersByGrid.get(target as Grid);
  if (container) return getContainerWorkspace(container);

  const grid = gridsByElement.get(target as EditableElement);
  if (grid) return getOwningWorkspace(grid);

  return null;
}
