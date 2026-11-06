import {
  attachElementToGrid,
  detachElementFromGrid,
} from "../internal/ModelOwnership";
import type { EditStep } from "./EditPlan";
import type { EditableElement } from "../elements/EditableElement";
import type { Grid } from "../grids/Grid";
import type { GridChange } from "../events/ModelChange";
import type { Unsubscribe } from "../events/ChangeEmitter";
import type { ElementId } from "../types/ids";

type MembershipToken = Readonly<{ present: boolean }>;
const ABSENT: MembershipToken = Object.freeze({ present: false });

/**
 * Reusable ordered membership mechanics. Owns the only elements map and
 * subscriptions for a Grid; Grid retains its domain validation and public API.
 */
export class GridMembership<T extends EditableElement> {
  private readonly elements = new Map<ElementId, T>();
  private readonly subscriptions = new Map<ElementId, Unsubscribe>();
  private readonly versions = new WeakMap<T, MembershipToken>();

  constructor(
    private readonly owner: Grid<T>,
    private readonly emit: (change: GridChange) => void,
  ) {}

  get size(): number { return this.elements.size; }
  get(id: ElementId): T | undefined { return this.elements.get(id); }
  all(): readonly T[] { return [...this.elements.values()]; }

  private token(element: T): MembershipToken {
    return this.versions.get(element) ?? ABSENT;
  }

  prepareInsert(element: T, index: number): EditStep {
    if (!Number.isInteger(index) || index < 0 || index > this.size) {
      throw new RangeError("Invalid element insertion index");
    }
    if (this.elements.has(element.id)) {
      throw new Error(`Element ${element.id} already exists`);
    }
    if (element.grid === this.owner) {
      throw new Error(`Element ${element.id} already belongs to this grid`);
    }
    // A transfer may prepare its destination while the source still owns
    // the element. The executor detaches before applying this insert.
    element.assertValidState();
    const before = this.token(element);
    if (before.present) {
      throw new Error("Invalid element membership state");
    }
    const after: MembershipToken = Object.freeze({ present: true });
    return {
      before,
      after,
      targets: [this.owner],
      validate: (direction) => {
        if (direction === "forward") {
          if (this.elements.has(element.id) || this.token(element) !== before) {
            throw new Error(`Element ${element.id} membership was modified outside this mutation`);
          }
        } else if (
          this.elements.get(element.id) !== element ||
          this.token(element) !== after
        ) {
          throw new Error(`Element ${element.id} membership was modified outside this mutation`);
        }
      },
      apply: (direction) => {
        if (direction === "forward") {
          this.insert(element, index, before, after);
        } else {
          this.remove(element, after, before);
        }
      },
      recover: (direction) => {
        const forward = direction === "forward";
        const expected = forward ? before : after;
        const destination = forward ? after : before;
        if (this.token(element) === expected) {
          const member = this.elements.get(element.id);
          if (forward ? member === undefined && element.grid !== this.owner
                      : member === element && element.grid === this.owner) return;
        }
        if (this.token(element) === destination) {
          if (forward && this.elements.get(element.id) === element &&
              element.grid === this.owner) {
            this.remove(element, after, before);
            return;
          }
          if (!forward && this.elements.get(element.id) === undefined &&
              element.grid !== this.owner) {
            this.insert(element, index, before, after);
            return;
          }
        }
        throw new Error("Element insertion recovery was incomplete");
      },
      publish: (direction) => this.emit({
        type: direction === "forward" ? "element-added" : "element-removed",
        elementId: element.id,
      }),
    };
  }

  prepareRemove(element: T): EditStep {
    if (this.elements.get(element.id) !== element) {
      throw new Error(`Element ${element.id} is no longer the same grid member`);
    }
    if (element.locked) {
      throw new Error(`Element ${element.id} is locked`);
    }
    const before = this.token(element);
    if (!before.present) {
      throw new Error(`Invalid element ${element.id} membership state`);
    }
    const after: MembershipToken = Object.freeze({ present: false });
    const index = [...this.elements.keys()].indexOf(element.id);
    return {
      before,
      after,
      targets: [this.owner],
      validate: (direction) => {
        if (direction === "forward") {
          if (this.elements.get(element.id) !== element ||
              this.token(element) !== before) {
            throw new Error(`Element ${element.id} membership was modified outside this mutation`);
          }
          if (element.locked) throw new Error(`Element ${element.id} is locked`);
        } else {
          const existing = this.elements.get(element.id);
          if (existing && existing !== element) {
            throw new Error(`Element ${element.id} already exists`);
          }
          if (existing || this.token(element) !== after) {
            throw new Error(`Element ${element.id} membership was modified outside this mutation`);
          }
        }
      },
      apply: (direction) => {
        if (direction === "forward") {
          this.remove(element, before, after);
        } else {
          this.insert(element, index, after, before);
        }
      },
      recover: (direction) => {
        const forward = direction === "forward";
        const expected = forward ? before : after;
        const destination = forward ? after : before;
        if (this.token(element) === expected) {
          const member = this.elements.get(element.id);
          if (forward ? member === element && element.grid === this.owner
                      : member === undefined && element.grid !== this.owner) return;
        }
        if (this.token(element) === destination) {
          if (forward && this.elements.get(element.id) === undefined &&
              element.grid !== this.owner) {
            this.insert(element, index, after, before);
            return;
          }
          if (!forward && this.elements.get(element.id) === element &&
              element.grid === this.owner) {
            this.remove(element, before, after);
            return;
          }
        }
        throw new Error("Element removal recovery was incomplete");
      },
      publish: (direction) => this.emit({
        type: direction === "forward" ? "element-removed" : "element-added",
        elementId: element.id,
      }),
    };
  }

  private insert(
    element: T, index: number, expected: MembershipToken, next: MembershipToken,
  ): void {
    if (this.elements.has(element.id) || this.token(element) !== expected) {
      throw new Error(`Element ${element.id} membership was modified outside this mutation`);
    }
    if (index < 0 || index > this.size) {
      throw new RangeError("Invalid element insertion index");
    }

    element.assertValidState();
    // Subscribe before ownership mutation so a failing custom subscription
    // cannot leave the element attached without a completed edit step.
    const unsubscribe = element.onInternalChange((change) => {
      this.emit({
        type: "element-updated",
        elementId: change.elementId,
        properties: change.properties,
      });
    });
    try {
      attachElementToGrid(element, this.owner);
    } catch (error) {
      unsubscribe();
      throw error;
    }

    const ordered = [...this.elements.values()];
    ordered.splice(index, 0, element);
    this.elements.clear();
    for (const current of ordered) this.elements.set(current.id, current);
    this.subscriptions.set(element.id, unsubscribe);
    this.versions.set(element, next);
  }

  private remove(
    element: T, expected: MembershipToken, next: MembershipToken,
  ): void {
    if (this.elements.get(element.id) !== element ||
        this.token(element) !== expected) {
      throw new Error(`Element ${element.id} membership was modified outside this mutation`);
    }
    detachElementFromGrid(element, this.owner);
    this.subscriptions.get(element.id)?.();
    this.subscriptions.delete(element.id);
    this.elements.delete(element.id);
    this.versions.set(element, next);
  }
}
