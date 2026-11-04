import { ChangeEmitter } from "../events/ChangeEmitter";
import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";

import type { Command } from "./Command";

export type HistoryChange = {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
};

export class CommandHistory {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];

  private readonly changes = new ChangeEmitter<HistoryChange>();

  private executing = false;

  onChange(listener: ChangeListener<HistoryChange>): Unsubscribe {
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

  execute(command: Command): void {
    this.runGuarded(() => {
      command.execute();

      this.undoStack.push(command);
      this.redoStack.length = 0;

      this.notifyChange();
    });
  }

  undo(): boolean {
    if (!this.canUndo) return false;

    return this.runGuarded(() => {
      const command = this.undoStack.at(-1)!;

      command.undo();

      this.undoStack.pop();
      this.redoStack.push(command);

      this.notifyChange();
      return true;
    });
  }

  redo(): boolean {
    if (!this.canRedo) return false;

    return this.runGuarded(() => {
      const command = this.redoStack.at(-1)!;

      command.execute();

      this.redoStack.pop();
      this.undoStack.push(command);

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

  private notifyChange(): void {
    this.changes.emit({
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoLabel: this.undoLabel,
      redoLabel: this.redoLabel,
    });
  }

  private runGuarded<T>(operation: () => T): T {
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
