import type { ElementId } from "../types/ids";

export class SelectionManager {
  private readonly selectedIds = new Set<ElementId>();

  get count(): number {
    return this.selectedIds.size;
  }

  isSelected(id: ElementId): boolean {
    return this.selectedIds.has(id);
  }

  select(id: ElementId): void {
    this.selectedIds.add(id);
  }

  deselect(id: ElementId): void {
    this.selectedIds.delete(id);
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

    this.selectedIds.clear();

    for (const id of nextSelection) {
      this.selectedIds.add(id);
    }
  }

  clear(): void {
    this.selectedIds.clear();
  }

  getSelectedIds(): ReadonlySet<ElementId> {
    return new Set(this.selectedIds);
  }
}
