import { ChangeEmitter } from "./ChangeEmitter";
import type { ChangeListener, Unsubscribe } from "./ChangeEmitter";

export class ChangeBatchEmitter<T> {
  private readonly changes: ChangeEmitter<readonly T[]>;
  private pending: T[] = [];
  private depth = 0;

  constructor(owner: () => object | null = () => null) {
    this.changes = new ChangeEmitter<readonly T[]>(owner);
  }

  onChange(listener: ChangeListener<readonly T[]>): Unsubscribe {
    return this.changes.subscribe(listener);
  }

  /** @internal Used only for model-to-model forwarding. */
  onInternalChange(
    listener: ChangeListener<readonly T[]>,
  ): Unsubscribe {
    return this.changes.subscribeInternal(listener);
  }

  emit(change: T): void {
    if (this.depth > 0) {
      this.pending.push(change);
      return;
    }

    this.changes.emit(Object.freeze([change]));
  }

  batch<R>(operation: () => R): R {
    this.depth++;

    try {
      return operation();
    } finally {
      this.depth--;

      if (this.depth === 0) {
        this.flush();
      }
    }
  }

  private flush(): void {
    if (this.pending.length === 0) return;

    const changes = Object.freeze([...this.pending]);
    this.pending = [];

    this.changes.emit(changes);
  }
}
