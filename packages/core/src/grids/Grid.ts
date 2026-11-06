import { ChangeBatchEmitter } from "../events/ChangeBatchEmitter";
import { EditExecutor } from "../editing/EditExecutor";
import { GridMembership } from "../editing/GridMembership";
import { transferElement } from "../operations/ElementOperations";
import { getGridContainer, getOwningWorkspace } from "../internal/ModelOwnership";

import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";
import type { EditStep } from "../editing/EditPlan";
import type { GridChange } from "../events/ModelChange";
import type { GridId, ElementId } from "../types/ids";
import type { ToolId } from "../tools/ToolId";
import type { EditableElement } from "../elements/EditableElement";
import type { Tick } from "../types/time";
import type { RowIndex } from "../types/coordinates";
import type { GridRow } from "./rows/GridRow";
import type { GridContainer } from "./GridContainer";
import type { Timeline } from "../timeline/Timeline";

export abstract class Grid<
  TElement extends EditableElement = EditableElement,
  TRow extends GridRow = GridRow,
> {
  public readonly id: GridId;
  public readonly rows: readonly TRow[];

  private readonly changes = new ChangeBatchEmitter<GridChange>(
    () => getOwningWorkspace(this),
  );
  private readonly membership = new GridMembership<TElement>(
    this,
    (change) => this.changes.emit(change),
  );

  protected constructor(
    rows: readonly TRow[],
    id: GridId = crypto.randomUUID(),
  ) {
    if (rows.length === 0) {
      throw new Error("Grid must contain at least one row");
    }

    const rowIds = new Set(rows.map((row) => row.id));

    if (rowIds.size !== rows.length) {
      throw new Error("Grid row IDs must be unique");
    }

    this.id = id;
    this.rows = [...rows];
  }

  abstract readonly supportedTools: ReadonlySet<ToolId>;
  abstract readonly toolFallbacks: Readonly<Partial<Record<ToolId, ToolId>>>;

  get container(): GridContainer | null {
    return getGridContainer(this);
  }

  /**
   * Resolve the owning project timeline for developer-facing creation APIs.
   * A detached grid has no authoritative coordinate system.
   */
  protected requireTimeline(): Timeline {
    const timeline = this.container?.workspace?.timeline;
    if (!timeline) {
      throw new Error("Grid must belong to a workspace before creating elements");
    }
    return timeline;
  }

  onChange(listener: ChangeListener<readonly GridChange[]>): Unsubscribe {
    return this.changes.onChange(listener);
  }

  /** @internal Used by GridContainer for forwarding. */
  onInternalChange(listener: ChangeListener<readonly GridChange[]>): Unsubscribe {
    return this.changes.onInternalChange(listener);
  }

  batchChanges<R>(operation: () => R): R {
    return this.changes.batch(operation);
  }

  get rowCount(): number {
    return this.rows.length;
  }

  getRow(index: number): TRow | undefined {
    return this.rows[index];
  }

  addElement(element: TElement): void {
    if (element.grid !== null) {
      throw new Error(`Element ${element.id} already belongs to a grid`);
    }
    if (element.row >= this.rowCount) {
      throw new Error("Element row is outside grid bounds");
    }
    const index = this.membership.size;
    EditExecutor.execute({
      target: this,
      steps: [this.membership.prepareInsert(element, index)],
    });
  }

  removeElement(id: ElementId): boolean {
    const element = this.membership.get(id);
    if (!element) return false;

    EditExecutor.execute({
      target: this,
      steps: [this.membership.prepareRemove(element)],
    });
    return true;
  }

  getElement(id: ElementId): TElement | undefined {
    return this.membership.get(id);
  }

  getElements(): readonly TElement[] {
    return this.membership.all();
  }

  /**
   * Override to accept compatible incoming transfers. Unknown custom grid
   * types reject them unless their implementation opts in explicitly.
   */
  protected acceptsTransferredElement(_element: EditableElement): boolean {
    return false;
  }

  /** @internal Domain-level check for incoming transfers. */
  canReceiveElement(element: EditableElement): boolean {
    return this.acceptsTransferredElement(element);
  }

  /** @internal Reversible membership preparation for compound edit planners. */
  prepareElementInsert(element: EditableElement, index: number): EditStep {
    return this.membership.prepareInsert(element as TElement, index);
  }

  /** @internal Reversible membership preparation for compound edit planners. */
  prepareElementRemove(element: EditableElement): EditStep {
    return this.membership.prepareRemove(element as TElement);
  }

  transferElementTo(
    element: TElement,
    target: Grid,
    options: {
      readonly row: RowIndex;
      readonly startTick?: Tick;
      readonly index?: number;
    },
  ): void {
    transferElement(this, element, target, options);
  }
}
