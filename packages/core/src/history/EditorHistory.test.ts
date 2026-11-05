import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "../elements/MidiNote";
import { EditorHistory } from "./EditorHistory";

describe("EditorHistory", () => {
  it("starts empty and returns false for unavailable undo and redo", () => {
    const history = new EditorHistory();

    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.undoLabel).toBeNull();
    expect(history.redoLabel).toBeNull();
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(false);
  });

  it("records one callback as a single named entry and returns its result", () => {
    const history = new EditorHistory();
    const note = new MidiNote(0, 0, 120, "note");

    const result = history.execute("Move and resize", () => {
      note.moveToTick(480);
      note.resizeToDuration(240);
      note.row = 2;
      return { done: true };
    });

    expect(result).toEqual({ done: true });
    expect(history.canUndo).toBe(true);
    expect(history.undoLabel).toBe("Move and resize");
    expect([note.startTick, note.durationTicks, note.row]).toEqual([480, 240, 2]);

    expect(history.undo()).toBe(true);
    expect([note.startTick, note.durationTicks, note.row]).toEqual([0, 120, 0]);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
    expect(history.redoLabel).toBe("Move and resize");

    expect(history.redo()).toBe(true);
    expect([note.startTick, note.durationTicks, note.row]).toEqual([480, 240, 2]);
    expect(history.canRedo).toBe(false);
  });

  it("undoes and redoes changes to multiple elements as one action", () => {
    const history = new EditorHistory();
    const first = new MidiNote(0, 0, 120);
    const second = new MidiNote(1, 120, 120);

    history.execute("Move selection", () => {
      first.moveToTick(240);
      second.moveToTick(360);
      first.row = 1;
    });

    history.undo();
    expect([first.startTick, second.startTick, first.row]).toEqual([0, 120, 0]);
    expect(history.canUndo).toBe(false);

    history.redo();
    expect([first.startTick, second.startTick, first.row]).toEqual([240, 360, 1]);
  });

  it("records successful edits in separate entries with distinct labels", () => {
    const history = new EditorHistory();
    const note = new MidiNote(0, 0, 120);

    history.execute("First", () => note.moveToTick(240));
    history.execute("Second", () => note.moveToTick(480));

    expect(history.undoLabel).toBe("Second");
    history.undo();
    expect(note.startTick).toBe(240);
    expect(history.undoLabel).toBe("First");
    expect(history.redoLabel).toBe("Second");

    history.undo();
    expect(note.startTick).toBe(0);
    history.redo();
    history.redo();
    expect(note.startTick).toBe(480);
  });

  it("does not store an entry or clear redo for a no-op callback", () => {
    const history = new EditorHistory();
    const note = new MidiNote(0, 0, 120);
    history.execute("Move", () => note.moveToTick(240));
    history.undo();

    history.execute("No change", () => {
      note.moveToTick(0);
      note.row = 0;
    });

    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
    expect(history.redoLabel).toBe("Move");
    expect(history.redo()).toBe(true);
    expect(note.startTick).toBe(240);
  });

  it("does not rerun the callback when undoing or redoing", () => {
    const history = new EditorHistory();
    const note = new MidiNote(0, 0, 120);
    const callback = vi.fn(() => note.moveToTick(240));

    history.execute("Move", callback);
    history.undo();
    history.redo();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(note.startTick).toBe(240);
  });

  it("discards redo after a new successful edit", () => {
    const history = new EditorHistory();
    const note = new MidiNote(0, 0, 120);
    history.execute("First", () => note.moveToTick(240));
    history.undo();
    expect(history.canRedo).toBe(true);

    history.execute("Replacement", () => note.moveToTick(480));

    expect(history.redo()).toBe(false);
    expect(history.undoLabel).toBe("Replacement");
    expect(note.startTick).toBe(480);
  });

  it("rejects an empty or whitespace-only label before running the callback", () => {
    const history = new EditorHistory();
    const callback = vi.fn();

    expect(() => history.execute("   ", callback)).toThrow(/must not be empty/);
    expect(callback).not.toHaveBeenCalled();
    expect(history.canUndo).toBe(false);
  });

  it("rolls back all tracked mutations when a callback throws", () => {
    const history = new EditorHistory();
    const first = new MidiNote(0, 0, 120);
    const second = new MidiNote(0, 120, 120);

    expect(() => history.execute("Fail", () => {
      first.moveToTick(240);
      second.moveToTick(480);
      first.row = 2;
      throw new Error("operation failed");
    })).toThrow("operation failed");

    expect([first.startTick, first.row, second.startTick]).toEqual([0, 0, 120]);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);

    history.execute("Later", () => first.moveToTick(960));
    expect(history.undo()).toBe(true);
    expect(first.startTick).toBe(0);
  });

  it("rolls back earlier edits if a later edit fails validation", () => {
    const history = new EditorHistory();
    const first = new MidiNote(0, 0, 120);
    const second = new MidiNote(0, 0, 120);

    expect(() => history.execute("Invalid", () => {
      first.moveToTick(480);
      second.resizeToDuration(-10);
    })).toThrow("Invalid element timing");

    expect(first.startTick).toBe(0);
    expect(second.durationTicks).toBe(120);
    expect(history.canUndo).toBe(false);
  });

  it("rejects out-of-scope targets and rolls back earlier valid edits", () => {
    const allowed = new MidiNote(0, 0, 120);
    const outside = new MidiNote(0, 0, 120);
    const history = new EditorHistory((target) => target === allowed);

    expect(() => history.execute("Mixed", () => {
      allowed.moveToTick(240);
      outside.moveToTick(480);
    })).toThrow(/outside the recording scope/);

    expect(allowed.startTick).toBe(0);
    expect(outside.startTick).toBe(0);
    expect(history.canUndo).toBe(false);
  });

  it("prevents nested history operations and rolls back the outer operation", () => {
    const history = new EditorHistory();
    const note = new MidiNote(0, 0, 120);

    expect(() => history.execute("Outer", () => {
      note.moveToTick(240);
      history.execute("Inner", () => note.moveToTick(480));
    })).toThrow(/already executing/);

    expect(note.startTick).toBe(0);
    expect(history.canUndo).toBe(false);
  });

  it("does not corrupt stacks when undo fails after an independent state edit", () => {
    const history = new EditorHistory();
    const note = new MidiNote(0, 0, 120);
    history.execute("Move", () => note.moveToTick(240));

    note.moveToTick(480);
    expect(() => history.undo()).toThrow(/modified outside this mutation/);

    expect(note.startTick).toBe(480);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
    expect(history.undoLabel).toBe("Move");
  });

  it("detects snapshot conflicts even after an outside edit returns to the same value", () => {
    const history = new EditorHistory();
    const note = new MidiNote(0, 0, 120);
    history.execute("Move", () => note.moveToTick(240));

    note.moveToTick(480);
    note.moveToTick(240);

    expect(() => history.undo()).toThrow(/modified outside this mutation/);
    expect(note.startTick).toBe(240);
    expect(history.canUndo).toBe(true);
  });

  it("recovers already-replayed mutations if a later undo conflicts", () => {
    const history = new EditorHistory();
    const first = new MidiNote(0, 0, 120);
    const second = new MidiNote(0, 0, 120);

    history.execute("Move both", () => {
      first.moveToTick(240);
      second.moveToTick(480);
    });
    first.moveToTick(720);

    expect(() => history.undo()).toThrow(/modified outside this mutation/);
    expect([first.startTick, second.startTick]).toEqual([720, 480]);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
  });

  it("restores locked state in reverse order when a callback locks after editing", () => {
    const history = new EditorHistory();
    const note = new MidiNote(0, 0, 120);

    history.execute("Move then lock", () => {
      note.moveToTick(480);
      note.locked = true;
    });

    expect(note.locked).toBe(true);
    history.undo();
    expect([note.startTick, note.locked]).toEqual([0, false]);

    history.redo();
    expect([note.startTick, note.locked]).toEqual([480, true]);
  });

  it("emits undo/redo availability and labels on stack changes", () => {
    const history = new EditorHistory();
    const note = new MidiNote(0, 0, 120);
    const listener = vi.fn();
    history.onChange(listener);

    history.execute("Move", () => note.moveToTick(240));
    history.undo();
    history.redo();
    history.clear();

    expect(listener).toHaveBeenNthCalledWith(1, {
      canUndo: true,
      canRedo: false,
      undoLabel: "Move",
      redoLabel: null,
    });
    expect(listener).toHaveBeenNthCalledWith(2, {
      canUndo: false,
      canRedo: true,
      undoLabel: null,
      redoLabel: "Move",
    });
    expect(listener).toHaveBeenNthCalledWith(3, {
      canUndo: true,
      canRedo: false,
      undoLabel: "Move",
      redoLabel: null,
    });
    expect(listener).toHaveBeenNthCalledWith(4, {
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      redoLabel: null,
    });
  });

  it("does not notify history listeners for no-op callbacks or unavailable actions", () => {
    const history = new EditorHistory();
    const note = new MidiNote(0, 0, 120);
    const listener = vi.fn();
    history.onChange(listener);

    history.execute("No-op", () => note.moveToTick(0));
    history.undo();
    history.redo();
    history.clear();

    expect(listener).not.toHaveBeenCalled();
  });

  it("can unsubscribe history listeners", () => {
    const history = new EditorHistory();
    const note = new MidiNote(0, 0, 120);
    const listener = vi.fn();
    const unsubscribe = history.onChange(listener);

    history.execute("First", () => note.moveToTick(240));
    unsubscribe();
    history.undo();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("clears undo and redo entries without altering the current document", () => {
    const history = new EditorHistory();
    const note = new MidiNote(0, 0, 120);

    history.execute("First", () => note.moveToTick(240));
    history.execute("Second", () => note.moveToTick(480));
    history.undo();
    history.clear();

    expect(note.startTick).toBe(240);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(false);
  });

  it("rejects asynchronous operations without preserving partial tracked changes", () => {
    const history = new EditorHistory();
    const note = new MidiNote(0, 0, 120);

    expect(() => history.execute("Async", () => {
      note.moveToTick(240);
      return Promise.resolve();
    })).toThrow(/must be synchronous/);

    expect(note.startTick).toBe(0);
    expect(history.canUndo).toBe(false);
  });
});
