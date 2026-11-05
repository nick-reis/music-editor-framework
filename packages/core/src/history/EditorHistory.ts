import { ChangeEmitter } from "../events/ChangeEmitter";
import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";

import { MutationCapture } from "../mutations/MutationCapture";
import type {
  MutationScope,
  ReversibleMutation,
} from "../mutations/MutationCapture";

export type EditorHistoryChange = {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
};

type HistoryEntry = {
  readonly label: string;
  readonly mutations: readonly ReversibleMutation[];
};

type ReplayDirection = "undo" | "redo";

export class EditorHistory {
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];
  private readonly changes = new ChangeEmitter<EditorHistoryChange>();

  private executing = false;

  constructor(
    private readonly accepts: (target: object) => boolean = () => true,
    private readonly scope?: MutationScope,
  ) {}

  onChange(listener: ChangeListener<EditorHistoryChange>): Unsubscribe {
    return this.changes.subscribe(listener);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null;
  }

  execute<R>(label: string, operation: () => R): R {
    if (!label.trim()) {
      throw new Error("History entry label must not be empty");
    }

    return this.runGuarded(() => {
      const capture = new MutationCapture(this.accepts, this.scope);
      let result: R;

      try {
        result = capture.run(operation);
      } catch (error) {
        try {
          this.replay(capture.mutations, "undo");
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "History operation failed and rollback was incomplete",
          );
        }

        throw error;
      }

      const mutations = capture.mutations;

      if (mutations.length > 0) {
        this.undoStack.push({ label, mutations });
        this.redoStack.length = 0;
        this.notifyChange();
      }

      return result;
    });
  }

  undo(): boolean {
    return this.runGuarded(() => {
      const entry = this.undoStack.at(-1);

      if (!entry) return false;

      this.replay(entry.mutations, "undo");

      this.undoStack.pop();
      this.redoStack.push(entry);

      this.notifyChange();
      return true;
    });
  }

  redo(): boolean {
    return this.runGuarded(() => {
      const entry = this.redoStack.at(-1);

      if (!entry) return false;

      this.replay(entry.mutations, "redo");

      this.redoStack.pop();
      this.undoStack.push(entry);

      this.notifyChange();
      return true;
    });
  }

  clear(): void {
    this.runGuarded(() => {
      if (!this.canUndo && !this.canRedo) return;

      this.undoStack.length = 0;
      this.redoStack.length = 0;

      this.notifyChange();
    });
  }

  private replay(
    mutations: readonly ReversibleMutation[],
    direction: ReplayDirection,
  ): void {
    const ordered =
      direction === "undo" ? [...mutations].reverse() : [...mutations];

    const applied: ReversibleMutation[] = [];

    try {
      for (const mutation of ordered) {
        if (!this.accepts(mutation.target)) {
          throw new Error("Mutation target is outside the history scope");
        }

        if (direction === "undo") {
          mutation.undo();
        } else {
          mutation.redo();
        }

        applied.push(mutation);
      }
    } catch (error) {
      const recoveryErrors: unknown[] = [];

      for (const mutation of applied.reverse()) {
        try {
          if (direction === "undo") {
            mutation.redo();
          } else {
            mutation.undo();
          }
        } catch (recoveryError) {
          recoveryErrors.push(recoveryError);
        }
      }

      if (recoveryErrors.length > 0) {
        throw new AggregateError(
          [error, ...recoveryErrors],
          "History replay failed and recovery was incomplete",
        );
      }

      throw error;
    }
  }

  private notifyChange(): void {
    this.changes.emit({
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoLabel: this.undoLabel,
      redoLabel: this.redoLabel,
    });
  }

  private runGuarded<R>(operation: () => R): R {
    if (this.executing) {
      throw new Error("A history operation is already executing");
    }

    this.executing = true;

    try {
      return operation();
    } finally {
      this.executing = false;
    }
  }
}
