import { ChangeEmitter } from "../events/ChangeEmitter";
import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";
import type { SelectionChange } from "../events/ModelChange";
import type { EditableElement } from "../elements/EditableElement";

export class SelectionManager {
  private readonly selectedElements = new Set<EditableElement>();
  private readonly changes = new ChangeEmitter<SelectionChange>();

  onChange(listener: ChangeListener<SelectionChange>): Unsubscribe {
    return this.changes.subscribe(listener);
  }

  get count(): number {
    return this.selectedElements.size;
  }

  isSelected(element: EditableElement): boolean {
    return this.selectedElements.has(element);
  }

  select(element: EditableElement): void {
    if (this.selectedElements.has(element)) return;

    this.selectedElements.add(element);

    this.changes.emit({
      addedElements: [element],
      removedElements: [],
    });
  }

  deselect(element: EditableElement): void {
    if (!this.selectedElements.delete(element)) return;

    this.changes.emit({
      addedElements: [],
      removedElements: [element],
    });
  }

  toggle(element: EditableElement): void {
    if (this.isSelected(element)) {
      this.deselect(element);
    } else {
      this.select(element);
    }
  }

  setSelection(elements: Iterable<EditableElement>): void {
    const nextSelection = new Set(elements);

    const addedElements: EditableElement[] = [];
    const removedElements: EditableElement[] = [];

    for (const element of this.selectedElements) {
      if (!nextSelection.has(element)) {
        removedElements.push(element);
      }
    }

    for (const element of nextSelection) {
      if (!this.selectedElements.has(element)) {
        addedElements.push(element);
      }
    }

    if (addedElements.length === 0 && removedElements.length === 0) {
      return;
    }

    this.selectedElements.clear();

    for (const element of nextSelection) {
      this.selectedElements.add(element);
    }

    this.changes.emit({
      addedElements,
      removedElements,
    });
  }

  clear(): void {
    if (this.selectedElements.size === 0) return;

    const removedElements = [...this.selectedElements];

    this.selectedElements.clear();

    this.changes.emit({
      addedElements: [],
      removedElements,
    });
  }

  getSelectedElements(): ReadonlySet<EditableElement> {
    return new Set(this.selectedElements);
  }
}
