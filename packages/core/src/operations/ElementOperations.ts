import { EditExecutor } from "../editing/EditExecutor";
import type { EditStep } from "../editing/EditPlan";
import type { EditableElement } from "../elements/EditableElement";
import type { Grid } from "../grids/Grid";
import type { EditorWorkspace } from "../workspace/EditorWorkspace";
import type { Offset, Tick } from "../types/time";
import type { RowIndex } from "../types/coordinates";

/** Workspace-owned atomic grouped movement across existing grids. */
export function moveElements(
  workspace: EditorWorkspace,
  elements: readonly EditableElement[],
  options: { readonly by: Offset; readonly rows?: number },
): void {
  if (elements.length === 0) return;
  if (new Set(elements).size !== elements.length) {
    throw new Error("Duplicate elements in grouped move");
  }
  const rows = options.rows ?? 0;
  if (!Number.isInteger(rows)) {
    throw new RangeError("Row displacement must be an integer");
  }
  const delta = workspace.timeline.toTickDelta(options.by);
  if (delta === 0 && rows === 0) return;

  const steps: EditStep[] = [];
  const affected = new Set<Grid>();

  for (const element of elements) {
    const grid = element.grid;
    if (!grid || workspace.getGrid(grid.id) !== grid ||
        grid.getElement(element.id) !== element) {
      throw new Error(`Element ${element.id} does not belong to this workspace`);
    }
    const row = element.row + rows;
    const tick = element.startTick + delta;
    const prepared = element.preparePosition(
      row, tick, grid.rowCount, workspace.timeline,
    );

    steps.push({
      ...prepared,
      targets: [element, grid],
      validate(direction) {
        if (element.grid !== grid ||
            workspace.getGrid(grid.id) !== grid ||
            grid.getElement(element.id) !== element) {
          throw new Error("Element ownership changed outside grouped move");
        }
        prepared.validate(direction);
      },
    });
    affected.add(grid);
  }

  EditExecutor.execute({
    target: workspace,
    steps,
    batchTargets: [workspace, ...affected],
  });
}

/** One original object, one history entry, one consistent source/destination. */
export function transferElement<T extends EditableElement>(
  source: Grid<T>,
  element: T,
  target: Grid,
  options: {
    readonly row: RowIndex;
    readonly startTick?: Tick;
    readonly index?: number;
  },
): void {
  const workspace = source.container?.workspace;
  if (!workspace || source === target || target.container?.workspace !== workspace) {
    throw new Error("Element transfers require two distinct grids in the same workspace");
  }
  if (source.getElement(element.id) !== element) {
    throw new Error(`Element ${element.id} does not belong to source grid`);
  }
  if (!target.canReceiveElement(element)) {
    throw new Error("Destination grid does not accept this element type");
  }
  if (element.locked) {
    throw new Error(`Element ${element.id} is locked`);
  }
  if (target.getElement(element.id)) {
    throw new Error(`Element ${element.id} already exists in destination`);
  }
  const index = options.index ?? target.getElements().length;
  if (!Number.isInteger(index) || index < 0 ||
      index > target.getElements().length) {
    throw new RangeError("Invalid destination element index");
  }

  const row = options.row;
  const tick = options.startTick ?? element.startTick;
  const remove = source.prepareElementRemove(element);
  const reposition = element.preparePosition(
    row, tick, target.rowCount, workspace.timeline, source.rowCount,
  );
  const insert = target.prepareElementInsert(element, index);

  const steps: EditStep[] = [
    remove,
    {
      ...reposition,
      targets: [element],
      validate(direction) {
        if (direction === "forward" && !target.canReceiveElement(element)) {
          throw new Error("Destination grid does not accept this element type");
        }
        reposition.validate(direction);
      },
    },
    insert,
  ];

  EditExecutor.execute({
    target: source,
    steps,
    batchTargets: [workspace],
    publish: (direction) => {
      // Publish the departing grid removal before the arrival, and publish
      // positional updates only after the destination has been announced.
      // Undo reverses the source/destination ordering.
      if (direction === "forward") {
        remove.publish(direction);
        insert.publish(direction);
      } else {
        insert.publish(direction);
        remove.publish(direction);
      }
      reposition.publish(direction);
    },
  });
}
