import type { Command } from "./Command";
import type { EditableElement } from "../elements/EditableElement";
import type { Grid } from "../grids/Grid";
import type { GridPosition } from "../types/coordinates";

export type ElementMove = {
  readonly grid: Grid;
  readonly element: EditableElement;
  readonly to: GridPosition;
};

export class MoveElementsCommand implements Command {
  readonly label: string;

  private readonly moves: readonly ElementMove[];
  private previousPositions: readonly GridPosition[] | null = null;
  private applied = false;

  constructor(moves: readonly ElementMove[], label = "Move Elements") {
    if (moves.length === 0) {
      throw new Error("At least one element is required");
    }

    const elements = new Set(moves.map((move) => move.element));

    if (elements.size !== moves.length) {
      throw new Error("Duplicate elements in move command");
    }

    this.label = label;

    this.moves = moves.map((move) => ({
      grid: move.grid,
      element: move.element,
      to: { ...move.to },
    }));
  }

  execute(): void {
    if (this.applied) {
      throw new Error("Command is already executed");
    }

    if (this.previousPositions) {
      this.assertPositions(this.previousPositions);
    }

    const before = this.currentPositions();
    const targets = this.moves.map((move) => move.to);

    this.validateTargets(targets, true);

    this.withBatchedChanges(() => {
      this.applyPositions(targets, before);

      this.previousPositions ??= before;
      this.applied = true;
    });
  }

  undo(): void {
    if (!this.applied || !this.previousPositions) {
      throw new Error("Command has not been executed");
    }

    const targets = this.moves.map((move) => move.to);

    this.assertPositions(targets);
    this.validateTargets(this.previousPositions, true);

    this.withBatchedChanges(() => {
      this.applyPositions(this.previousPositions!, targets);

      this.applied = false;
    });
  }

  private withBatchedChanges(operation: () => void): void {
    const grids = [...new Set(this.moves.map((move) => move.grid))];

    const run = (index: number): void => {
      const grid = grids[index];

      if (!grid) {
        operation();
        return;
      }

      grid.batchChanges(() => run(index + 1));
    };

    run(0);
  }

  private currentPositions(): GridPosition[] {
    return this.moves.map(({ element }) => ({
      tick: element.startTick,
      row: element.row,
    }));
  }

  private assertPositions(expected: readonly GridPosition[]): void {
    this.moves.forEach(({ element }, index) => {
      const position = expected[index];

      if (element.startTick !== position.tick || element.row !== position.row) {
        throw new Error(
          `Element ${element.id} was modified outside this command`,
        );
      }
    });
  }

  private validateTargets(
    positions: readonly GridPosition[],
    checkLocked: boolean,
  ): void {
    this.moves.forEach(({ grid, element }, index) => {
      const position = positions[index];

      if (grid.getElement(element.id) !== element) {
        throw new Error(
          `Element ${element.id} does not belong to the specified grid`,
        );
      }

      if (checkLocked && element.locked) {
        throw new Error(`Element ${element.id} is locked`);
      }

      if (
        !Number.isInteger(position.row) ||
        position.row < 0 ||
        position.row >= grid.rowCount
      ) {
        throw new Error("Element row is outside grid bounds");
      }

      if (!Number.isFinite(position.tick)) {
        throw new Error("Invalid element start tick");
      }
    });
  }

  private applyPositions(
    positions: readonly GridPosition[],
    rollbackPositions: readonly GridPosition[],
  ): void {
    let index = 0;

    try {
      for (; index < this.moves.length; index++) {
        const element = this.moves[index].element;
        const position = positions[index];

        element.moveToTick(position.tick);
        element.row = position.row;
      }
    } catch (error) {
      const rollbackErrors: unknown[] = [];

      for (let i = Math.min(index, this.moves.length - 1); i >= 0; i--) {
        try {
          const element = this.moves[i].element;
          const position = rollbackPositions[i];

          element.moveToTick(position.tick);
          element.row = position.row;
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }

      if (rollbackErrors.length > 0) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          "Element movement failed and rollback was incomplete",
        );
      }

      throw error;
    }
  }
}
