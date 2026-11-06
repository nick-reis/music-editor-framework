import type { Unsubscribe } from "../events/ChangeEmitter";
import type { EditStep } from "./EditPlan";

type Child = { readonly id: string };
export type StructureState<T> = Readonly<{ children: readonly T[] }>;

export interface OrderedChildAdapter<T extends Child> {
  /** Domain checks, including lock constraints on direct removals. */
  validateRemove(child: T): void;
  /** Read authoritative ownership, including during failed attachment. */
  isAttached(child: T): boolean;
  /** The ownership hooks own all weak maps and timeline constraints. */
  attach(child: T): void;
  detach(child: T): void;
  /** Forward model-to-model changes, not public callbacks. */
  subscribe(child: T): Unsubscribe;
  added(child: T): void;
  removed(child: T): void;
  reordered(child: T, from: number, to: number): void;
}

/**
 * Unified ordered structural state machine for workspaces and grid containers.
 * Owns the only ordered collection, identity version and subscriptions.
 * The same prepared-step interface is used for both hierarchy levels.
 */
export class OrderedChildren<T extends Child> {
  private readonly children = new Map<string, T>();
  private readonly subscriptions = new Map<string, Unsubscribe>();
  private structure: StructureState<T> = this.snapshot([]);

  constructor(private readonly adapter: OrderedChildAdapter<T>) {}

  get size(): number { return this.children.size; }
  get(id: string): T | undefined { return this.children.get(id); }
  all(): readonly T[] { return [...this.children.values()]; }
  get state(): StructureState<T> { return this.structure; }

  /** Construction-only restoration; no history capture. */
  hydrate(child: T): void {
    const state = this.snapshot([...this.children.values(), child]);
    this.insert(child, this.size, this.structure, state);
    this.adapter.added(child);
  }

  prepareInsert(
    child: T, index: number, options: { allowLockedOnUndo?: boolean } = {},
  ): EditStep {
    if (!Number.isInteger(index) || index < 0 || index > this.size) {
      throw new RangeError("Invalid insertion index");
    }
    if (this.children.has(child.id)) {
      throw new Error(`Item ${child.id} already exists`);
    }
    const before = this.structure;
    const ordered = [...before.children];
    ordered.splice(index, 0, child);
    const after = this.snapshot(ordered);
    return {
      before,
      after,
      targets: [],
      stateOwner: this,
      validate: (direction) => {
        if (direction === "forward") {
          this.assertState(before);
          if (this.children.has(child.id)) {
            throw new Error(`Item ${child.id} already exists`);
          }
        } else {
          this.assertState(after);
          if (this.children.get(child.id) !== child) {
            throw new Error(`Item ${child.id} is no longer the same member`);
          }
          if (!options.allowLockedOnUndo) this.adapter.validateRemove(child);
        }
      },
      apply: (direction) => {
        if (direction === "forward") this.insert(child, index, before, after);
        else this.remove(child, after, before);
      },
      recover: (direction) =>
        this.recoverInsert(child, index, before, after, direction),
      publish: (direction) => {
        if (direction === "forward") this.adapter.added(child);
        else this.adapter.removed(child);
      },
    };
  }

  prepareRemove(child: T, options: { allowLocked?: boolean } = {}): EditStep {
    if (this.children.get(child.id) !== child) {
      throw new Error(`Item ${child.id} is no longer the same member`);
    }
    if (!options.allowLocked) this.adapter.validateRemove(child);
    const before = this.structure;
    const index = before.children.indexOf(child);
    const ordered = [...before.children];
    ordered.splice(index, 1);
    const after = this.snapshot(ordered);
    return {
      before,
      after,
      targets: [],
      stateOwner: this,
      validate: (direction) => {
        if (direction === "forward") {
          this.assertState(before);
          if (this.children.get(child.id) !== child) {
            throw new Error(`Item ${child.id} is no longer the same member`);
          }
          if (!options.allowLocked) this.adapter.validateRemove(child);
        } else {
          this.assertState(after);
          if (this.children.has(child.id)) {
            throw new Error(`Item ${child.id} is already present`);
          }
        }
      },
      apply: (direction) => {
        if (direction === "forward") this.remove(child, before, after);
        else this.insert(child, index, after, before);
      },
      recover: (direction) =>
        this.recoverRemove(child, index, before, after, direction),
      publish: (direction) => {
        if (direction === "forward") this.adapter.removed(child);
        else this.adapter.added(child);
      },
    };
  }

  prepareReorder(child: T, index: number): EditStep | null {
    if (this.children.get(child.id) !== child) {
      throw new Error(`Item ${child.id} does not belong to this parent`);
    }
    if (!Number.isInteger(index) || index < 0 || index >= this.size) {
      throw new RangeError("Invalid index");
    }
    const before = this.structure;
    const fromIndex = before.children.indexOf(child);
    if (fromIndex === index) return null;

    const ordered = [...before.children];
    ordered.splice(fromIndex, 1);
    ordered.splice(index, 0, child);
    const after = this.snapshot(ordered);
    return {
      before,
      after,
      targets: [],
      stateOwner: this,
      validate: (direction) =>
        this.assertState(direction === "forward" ? before : after),
      apply: (direction) => {
        const current = direction === "forward" ? before : after;
        const next = direction === "forward" ? after : before;
        this.assertState(current);
        this.replace(next);
      },
      recover: (direction) => {
        const expected = direction === "forward" ? before : after;
        const destination = direction === "forward" ? after : before;
        if (this.structure === expected) return;
        if (this.structure !== destination) {
          throw new Error("Structural reorder recovery was incomplete");
        }
        this.replace(expected);
      },
      publish: (direction) => {
        if (direction === "forward") {
          this.adapter.reordered(child, fromIndex, index);
        } else {
          this.adapter.reordered(child, index, fromIndex);
        }
      },
    };
  }

  /**
   * Restore membership after an exception even when ownership changed before
   * the ordered snapshot was committed (e.g. an attachment hook threw).
   */
  private restoreExpected(child: T, expected: StructureState<T>): void {
    if (this.structure !== expected) {
      throw new Error("Structural recovery encountered an unexpected version");
    }
    const shouldBeAttached = expected.children.includes(child);
    const attached = this.adapter.isAttached(child);
    const subscribed = this.subscriptions.has(child.id);

    if (shouldBeAttached && !attached) {
      const unsubscribe = subscribed
        ? undefined
        : this.adapter.subscribe(child);
      try {
        this.adapter.attach(child);
      } catch (error) {
        unsubscribe?.();
        throw error;
      }
      if (unsubscribe) this.subscriptions.set(child.id, unsubscribe);
    } else if (!shouldBeAttached && attached) {
      this.adapter.detach(child);
      this.subscriptions.get(child.id)?.();
      this.subscriptions.delete(child.id);
    } else if (!shouldBeAttached && subscribed) {
      this.subscriptions.get(child.id)?.();
      this.subscriptions.delete(child.id);
    } else if (shouldBeAttached && !subscribed) {
      this.subscriptions.set(child.id, this.adapter.subscribe(child));
    }
    this.replace(expected);
  }

  private recoverInsert(
    child: T, index: number,
    before: StructureState<T>, after: StructureState<T>,
    direction: "forward" | "backward",
  ): void {
    const expected = direction === "forward" ? before : after;
    const destination = direction === "forward" ? after : before;
    if (this.structure === expected) {
      this.restoreExpected(child, expected);
      return;
    }
    if (this.structure !== destination) {
      throw new Error("Structural insertion recovery was incomplete");
    }
    if (direction === "forward") this.remove(child, after, before);
    else this.insert(child, index, before, after);
  }

  private recoverRemove(
    child: T, index: number,
    before: StructureState<T>, after: StructureState<T>,
    direction: "forward" | "backward",
  ): void {
    const expected = direction === "forward" ? before : after;
    const destination = direction === "forward" ? after : before;
    if (this.structure === expected) {
      this.restoreExpected(child, expected);
      return;
    }
    if (this.structure !== destination) {
      throw new Error("Structural removal recovery was incomplete");
    }
    if (direction === "forward") this.insert(child, index, after, before);
    else this.remove(child, before, after);
  }

  private snapshot(children: readonly T[]): StructureState<T> {
    return Object.freeze({ children: Object.freeze([...children]) });
  }

  private assertState(expected: StructureState<T>): void {
    if (this.structure !== expected) {
      throw new Error("Structure was modified outside this mutation");
    }
  }

  private replace(state: StructureState<T>): void {
    this.children.clear();
    for (const item of state.children) this.children.set(item.id, item);
    this.structure = state;
  }

  private insert(
    child: T, index: number,
    expected: StructureState<T>, next: StructureState<T>,
  ): void {
    this.assertState(expected);
    if (this.children.has(child.id)) {
      throw new Error(`Item ${child.id} already exists`);
    }
    const unsubscribe = this.adapter.subscribe(child);
    try {
      this.adapter.attach(child);
    } catch (error) {
      unsubscribe();
      throw error;
    }
    this.subscriptions.set(child.id, unsubscribe);
    this.replace(next);
  }

  private remove(
    child: T, expected: StructureState<T>, next: StructureState<T>,
  ): void {
    this.assertState(expected);
    if (this.children.get(child.id) !== child) {
      throw new Error(`Item ${child.id} is no longer the same member`);
    }
    this.adapter.detach(child);
    this.subscriptions.get(child.id)?.();
    this.subscriptions.delete(child.id);
    this.replace(next);
  }
}
