import type { GridId, ElementId } from "../types/ids";
import type { ToolId } from "../tools/ToolId";
import type { EditableElement } from "../elements/EditableElement";
import type { GridRow } from "./rows/GridRow";

export abstract class Grid<
  TElement extends EditableElement = EditableElement,
  TRow extends GridRow = GridRow,
> {
  public readonly id: GridId;

  public readonly rows: readonly TRow[];

  protected readonly elements = new Map<ElementId, TElement>();

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

  get rowCount(): number {
    return this.rows.length;
  }

  getRow(index: number): TRow | undefined {
    return this.rows[index];
  }

  addElement(element: TElement): void {
    if (this.elements.has(element.id)) {
      throw new Error(`Element ${element.id} already exists`);
    }

    if (
      !Number.isInteger(element.row) ||
      element.row < 0 ||
      element.row >= this.rowCount
    ) {
      throw new Error("Element row is outside grid bounds");
    }

    this.elements.set(element.id, element);
  }

  removeElement(id: ElementId): boolean {
    return this.elements.delete(id);
  }

  getElement(id: ElementId): TElement | undefined {
    return this.elements.get(id);
  }

  getElements(): readonly TElement[] {
    return [...this.elements.values()];
  }
}
