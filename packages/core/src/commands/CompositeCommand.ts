import type { Command } from "./Command";

export class CompositeCommand implements Command {
  public readonly label: string;

  private readonly commands: readonly Command[];

  constructor(label: string, commands: readonly Command[]) {
    if (commands.length === 0) {
      throw new Error("CompositeCommand requires at least one command");
    }

    this.label = label;
    this.commands = [...commands];
  }

  execute(): void {
    const executed: Command[] = [];

    try {
      for (const command of this.commands) {
        command.execute();
        executed.push(command);
      }
    } catch (error) {
      const rollbackErrors: unknown[] = [];

      for (const command of executed.reverse()) {
        try {
          command.undo();
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }

      if (rollbackErrors.length > 0) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          "Composite command failed and rollback was incomplete",
        );
      }

      throw error;
    }
  }

  undo(): void {
    const undone: Command[] = [];

    try {
      for (let i = this.commands.length - 1; i >= 0; i--) {
        const command = this.commands[i];
        command.undo();
        undone.push(command);
      }
    } catch (error) {
      const recoveryErrors: unknown[] = [];

      for (const command of undone.reverse()) {
        try {
          command.execute();
        } catch (recoveryError) {
          recoveryErrors.push(recoveryError);
        }
      }

      if (recoveryErrors.length > 0) {
        throw new AggregateError(
          [error, ...recoveryErrors],
          "Composite undo failed and recovery was incomplete",
        );
      }

      throw error;
    }
  }
}
