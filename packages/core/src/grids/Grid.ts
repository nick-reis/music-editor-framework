import { ChangeBatchEmitter } from "../events/ChangeBatchEmitter";
import { MutationCapture } from "../mutations/MutationCapture";
import {
  attachElementToGrid,
  detachElementFromGrid,
  getGridContainer,
} from "../internal/ModelOwnership";

import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";
import type { GridChange } from "../events/ModelChange";
import type { GridId, ElementId } from "../types/ids";
import type { ToolId } from "../tools/ToolId";
import type { EditableElement } from "../elements/EditableElement";
import type { GridRow } from "./rows/GridRow";
import type { GridContainer } from "./GridContainer";

type MembershipState = Readonly<{ present: boolean }>;

export abstract class Grid<
  TElement extends EditableElement = EditableElement,
  TRow extends GridRow = GridRow,
> {
  public readonly id: GridId;
  public readonly rows: readonly TRow[];

  private readonly elements = new Map<ElementId, TElement>();

  private readonly changes = new ChangeBatchEmitter<GridChange>();
  private readonly elementSubscriptions = new Map<ElementId, Unsubscribe>();
  private readonly membershipStates = new WeakMap<TElement, MembershipState>();

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

  onChange(listener: ChangeListener<readonly GridChange[]>): Unsubscribe {
    return this.changes.onChange(listener);
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
    this.insertElement(element, this.elements.size);
  }

  removeElement(id: ElementId): boolean {
    const element = this.elements.get(id);

    if (!element) {
      return false;
    }

    this.removeExactElement(element);
    return true;
  }

  getElement(id: ElementId): TElement | undefined {
    return this.elements.get(id);
  }

  getElements(): readonly TElement[] {
    return [...this.elements.values()];
  }

  private insertElement(
    element: TElement,
    index: number,
    expected?: MembershipState,
    restored?: MembershipState,
  ): void {
    if (this.elements.has(element.id)) {
      throw new Error(`Element ${element.id} already exists`);
    }

    if (!Number.isInteger(index) || index < 0 || index > this.elements.size) {
      throw new RangeError("Invalid element insertion index");
    }

    const before =
      this.membershipStates.get(element) ?? Object.freeze({ present: false });

    if (expected && before !== expected) {
      throw new Error(
        `Element ${element.id} membership was modified outside this mutation`,
      );
    }

    MutationCapture.assertTarget(this);

    attachElementToGrid(element, this);

    const ordered = [...this.elements.values()];
    ordered.splice(index, 0, element);

    this.elements.clear();

    for (const item of ordered) {
      this.elements.set(item.id, item);
    }

    const unsubscribe = element.onChange((change) => {
      this.changes.emit({
        type: "element-updated",
        elementId: change.elementId,
        properties: change.properties,
      });
    });

    this.elementSubscriptions.set(element.id, unsubscribe);

    const after = restored ?? Object.freeze({ present: true });
    this.membershipStates.set(element, after);

    MutationCapture.record({
      target: this,
      before,
      after,
      undo: () => this.removeExactElement(element, after, before),
      redo: () => this.insertElement(element, index, before, after),
    });

    this.changes.emit({
      type: "element-added",
      elementId: element.id,
    });
  }

  private removeExactElement(
    element: TElement,
    expected?: MembershipState,
    restored?: MembershipState,
  ): void {
    if (this.elements.get(element.id) !== element) {
      throw new Error(
        `Element ${element.id} is no longer the same grid member`,
      );
    }

    if (element.locked) {
      throw new Error(`Element ${element.id} is locked`);
    }

    const before = this.membershipStates.get(element);

    if (!before || !before.present) {
      throw new Error(`Invalid element ${element.id} membership state`);
    }

    if (expected && before !== expected) {
      throw new Error(
        `Element ${element.id} membership was modified outside this mutation`,
      );
    }

    MutationCapture.assertTarget(this);

    const index = [...this.elements.keys()].indexOf(element.id);

    detachElementFromGrid(element, this);

    this.elementSubscriptions.get(element.id)?.();
    this.elementSubscriptions.delete(element.id);
    this.elements.delete(element.id);

    const after = restored ?? Object.freeze({ present: false });
    this.membershipStates.set(element, after);

    MutationCapture.record({
      target: this,
      before,
      after,
      undo: () => this.insertElement(element, index, after, before),
      redo: () => this.removeExactElement(element, before, after),
    });

    this.changes.emit({
      type: "element-removed",
      elementId: element.id,
    });
  }
}
