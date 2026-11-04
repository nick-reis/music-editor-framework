import { describe, expect, it, vi } from "vitest";
import type { Command } from "./Command";
import { CommandHistory } from "./CommandHistory";

function counterCommand(counter: { value: number }, label = "Increment"): Command {
  return {
    label,
    execute: () => { counter.value++; },
    undo: () => { counter.value--; },
  };
}

describe("CommandHistory", () => {
  it("executes, undoes, and redoes a command with correct labels", () => {
    const history = new CommandHistory();
    const counter = { value: 0 };
    const listener = vi.fn();
    history.onChange(listener);

    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(false);

    history.execute(counterCommand(counter, "Increase"));
    expect(counter.value).toBe(1);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
    expect(history.undoLabel).toBe("Increase");
    expect(listener).toHaveBeenLastCalledWith({
      canUndo: true, canRedo: false, undoLabel: "Increase", redoLabel: null,
    });

    expect(history.undo()).toBe(true);
    expect(counter.value).toBe(0);
    expect(history.canUndo).toBe(false);
    expect(history.redoLabel).toBe("Increase");

    expect(history.redo()).toBe(true);
    expect(counter.value).toBe(1);
    expect(history.canRedo).toBe(false);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("clears redo history after a different command is executed", () => {
    const history = new CommandHistory();
    const counter = { value: 0 };

    history.execute(counterCommand(counter, "First"));
    history.undo();
    expect(history.canRedo).toBe(true);

    history.execute(counterCommand(counter, "Second"));
    expect(history.canRedo).toBe(false);
    expect(history.undoLabel).toBe("Second");
    expect(counter.value).toBe(1);
  });

  it("does not record a command whose execution fails", () => {
    const history = new CommandHistory();
    const listener = vi.fn();
    history.onChange(listener);

    expect(() => history.execute({
      label: "Fail",
      execute: () => { throw new Error("execute failed"); },
      undo: () => undefined,
    })).toThrow("execute failed");

    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps undo history intact if undo throws", () => {
    const history = new CommandHistory();
    history.execute({
      label: "Cannot undo",
      execute: () => undefined,
      undo: () => { throw new Error("undo failed"); },
    });

    expect(() => history.undo()).toThrow("undo failed");
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
    expect(history.undoLabel).toBe("Cannot undo");
  });

  it("keeps redo history intact if redo throws", () => {
    const history = new CommandHistory();
    let attempts = 0;

    history.execute({
      label: "Fail redo",
      execute() {
        attempts++;
        if (attempts === 2) throw new Error("redo failed");
      },
      undo: () => undefined,
    });
    history.undo();

    expect(() => history.redo()).toThrow("redo failed");
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
    expect(history.redoLabel).toBe("Fail redo");
  });

  it("rejects nested execution and keeps history unchanged", () => {
    const history = new CommandHistory();
    const nested = counterCommand({ value: 0 });

    expect(() => history.execute({
      label: "Outer",
      execute: () => history.execute(nested),
      undo: () => undefined,
    })).toThrow("A history operation is already executing");

    expect(history.canUndo).toBe(false);
  });

  it("clears history and only notifies on an actual change", () => {
    const history = new CommandHistory();
    const listener = vi.fn();
    history.onChange(listener);

    history.clear();
    expect(listener).not.toHaveBeenCalled();

    history.execute(counterCommand({ value: 0 }));
    history.clear();

    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    history.clear();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps separate histories independent", () => {
    const first = new CommandHistory();
    const second = new CommandHistory();
    const firstValue = { value: 0 };
    const secondValue = { value: 0 };

    first.execute(counterCommand(firstValue));
    second.execute(counterCommand(secondValue));
    first.undo();

    expect(firstValue.value).toBe(0);
    expect(secondValue.value).toBe(1);
    expect(first.canRedo).toBe(true);
    expect(second.canUndo).toBe(true);
  });
});
