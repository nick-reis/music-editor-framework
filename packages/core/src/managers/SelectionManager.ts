import { ChangeEmitter } from "../events/ChangeEmitter";
import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";
import type { SelectionChange } from "../events/ModelChange";
import type { ElementId } from "../types/ids";

export class SelectionManager {
  private readonly selectedIds = new Set<ElementId>();

  private readonly changes = new ChangeEmitter<SelectionChange>();

  onChange(listener: ChangeListener<SelectionChange>): Unsubscribe {
    return this.changes.subscribe(listener);
  }

  get count(): number {
    return this.selectedIds.size;
  }

  isSelected(id: ElementId): boolean {
    return this.selectedIds.has(id);
  }

  select(id: ElementId): void {
    if (this.selectedIds.has(id)) return;

    this.selectedIds.add(id);

    this.changes.emit({
      addedIds: [id],
      removedIds: [],
    });
  }

  deselect(id: ElementId): void {
    if (!this.selectedIds.delete(id)) return;

    this.changes.emit({
      addedIds: [],
      removedIds: [id],
    });
  }

  toggle(id: ElementId): void {
    if (this.isSelected(id)) {
      this.deselect(id);
    } else {
      this.select(id);
    }
  }

  setSelection(ids: Iterable<ElementId>): void {
    const nextSelection = new Set(ids);

    const addedIds: ElementId[] = [];
    const removedIds: ElementId[] = [];

    for (const id of this.selectedIds) {
      if (!nextSelection.has(id)) {
        removedIds.push(id);
      }
    }

    for (const id of nextSelection) {
      if (!this.selectedIds.has(id)) {
        addedIds.push(id);
      }
    }

    if (addedIds.length === 0 && removedIds.length === 0) {
      return;
    }

    this.selectedIds.clear();

    for (const id of nextSelection) {
      this.selectedIds.add(id);
    }

    this.changes.emit({
      addedIds,
      removedIds,
    });
  }

  clear(): void {
    if (this.selectedIds.size === 0) return;

    const removedIds = [...this.selectedIds];

    this.selectedIds.clear();

    this.changes.emit({
      addedIds: [],
      removedIds,
    });
  }

  getSelectedIds(): ReadonlySet<ElementId> {
    return new Set(this.selectedIds);
  }
}
