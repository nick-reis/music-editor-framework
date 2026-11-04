import { describe, expect, it } from "vitest";
import type { Command } from "./Command";
import { CommandHistory } from "./CommandHistory";
import { CompositeCommand } from "./CompositeCommand";

function recorded(name: string, log: string[]): Command {
  return {
    label: name,
    execute: () => { log.push(name + " execute"); },
    undo: () => { log.push(name + " undo"); },
  };
}

describe("CompositeCommand", () => {
  it("requires at least one command", () => {
    expect(() => new CompositeCommand("Empty", [])).toThrow(
      "requires at least one command",
    );
  });

  it("executes in order and undoes in reverse order", () => {
    const log: string[] = [];
    const command = new CompositeCommand("Group", [
      recorded("A", log),
      recorded("B", log),
      recorded("C", log),
    ]);

    command.execute();
    command.undo();

    expect(log).toEqual([
      "A execute", "B execute", "C execute",
      "C undo", "B undo", "A undo",
    ]);
  });

  it("appears as a single history entry", () => {
    const history = new CommandHistory();
    const value = { a: 0, b: 0 };
    const group = new CompositeCommand("Edit two items", [
      {
        label: "A",
        execute: () => { value.a++; },
        undo: () => { value.a--; },
      },
      {
        label: "B",
        execute: () => { value.b++; },
        undo: () => { value.b--; },
      },
    ]);

    history.execute(group);
    expect(value).toEqual({ a: 1, b: 1 });
    expect(history.undoLabel).toBe("Edit two items");

    history.undo();
    expect(value).toEqual({ a: 0, b: 0 });
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);

    history.redo();
    expect(value).toEqual({ a: 1, b: 1 });
  });

  it("reverses previously executed commands if a later command fails", () => {
    const log: string[] = [];
    const command = new CompositeCommand("Group", [
      recorded("A", log),
      {
        label: "B",
        execute() {
          log.push("B execute");
          throw new Error("B failed");
        },
        undo: () => { log.push("B undo"); },
      },
    ]);

    expect(() => command.execute()).toThrow("B failed");
    expect(log).toEqual(["A execute", "B execute", "A undo"]);
  });

  it("reports incomplete rollback instead of hiding the original failure", () => {
    const command = new CompositeCommand("Group", [
      {
        label: "A",
        execute: () => undefined,
        undo: () => { throw new Error("rollback failed"); },
      },
      {
        label: "B",
        execute: () => { throw new Error("execute failed"); },
        undo: () => undefined,
      },
    ]);

    let caught: unknown;
    try {
      command.execute();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    const aggregate = caught as AggregateError;
    expect(aggregate.errors).toHaveLength(2);
    expect(aggregate.message).toContain("rollback was incomplete");
  });

  it("recovers already-undone commands if undo fails halfway", () => {
    const log: string[] = [];
    const command = new CompositeCommand("Group", [
      {
        label: "A",
        execute: () => { log.push("A execute"); },
        undo() {
          log.push("A undo");
          throw new Error("A undo failed");
        },
      },
      recorded("B", log),
    ]);

    command.execute();
    expect(() => command.undo()).toThrow("A undo failed");
    expect(log).toEqual([
      "A execute", "B execute", "B undo", "A undo", "B execute",
    ]);
  });
});
