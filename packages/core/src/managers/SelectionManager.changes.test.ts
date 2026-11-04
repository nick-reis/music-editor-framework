import { describe, expect, it, vi } from "vitest";
import { SelectionManager } from "./SelectionManager";

describe("SelectionManager change notifications", () => {
  it("notifies when an element is selected", () => {
    const selection = new SelectionManager();
    const listener = vi.fn();

    selection.onChange(listener);
    selection.select("note-1");

    expect(selection.isSelected("note-1")).toBe(true);
    expect(selection.count).toBe(1);

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      addedIds: ["note-1"],
      removedIds: [],
    });
  });

  it("notifies when an element is deselected", () => {
    const selection = new SelectionManager();
    selection.select("note-1");

    const listener = vi.fn();
    selection.onChange(listener);

    selection.deselect("note-1");

    expect(selection.isSelected("note-1")).toBe(false);

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      addedIds: [],
      removedIds: ["note-1"],
    });
  });

  it("does not notify for redundant selections", () => {
    const selection = new SelectionManager();
    selection.select("note-1");

    const listener = vi.fn();
    selection.onChange(listener);

    selection.select("note-1");
    selection.deselect("missing");

    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies correctly when toggling selection", () => {
    const selection = new SelectionManager();
    const listener = vi.fn();

    selection.onChange(listener);

    selection.toggle("note-1");
    selection.toggle("note-1");

    expect(listener).toHaveBeenNthCalledWith(1, {
      addedIds: ["note-1"],
      removedIds: [],
    });

    expect(listener).toHaveBeenNthCalledWith(2, {
      addedIds: [],
      removedIds: ["note-1"],
    });

    expect(selection.count).toBe(0);
  });

  it("reports only changed IDs when replacing selection", () => {
    const selection = new SelectionManager();

    selection.setSelection(["A", "B"]);

    const listener = vi.fn();
    selection.onChange(listener);

    selection.setSelection(["B", "C"]);

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      addedIds: ["C"],
      removedIds: ["A"],
    });

    expect([...selection.getSelectedIds()]).toEqual(["B", "C"]);
  });

  it("emits one notification when selecting multiple elements", () => {
    const selection = new SelectionManager();
    const listener = vi.fn();

    selection.onChange(listener);
    selection.setSelection(["A", "B", "C"]);

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      addedIds: ["A", "B", "C"],
      removedIds: [],
    });

    expect(selection.count).toBe(3);
  });

  it("does not notify when the selection is unchanged", () => {
    const selection = new SelectionManager();
    selection.setSelection(["A", "B"]);

    const listener = vi.fn();
    selection.onChange(listener);

    selection.setSelection(["B", "A", "A"]);

    expect(listener).not.toHaveBeenCalled();
  });

  it("clears the entire selection with one notification", () => {
    const selection = new SelectionManager();
    selection.setSelection(["A", "B", "C"]);

    const listener = vi.fn();
    selection.onChange(listener);

    selection.clear();

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      addedIds: [],
      removedIds: ["A", "B", "C"],
    });

    expect(selection.count).toBe(0);
  });

  it("does not notify when clearing an empty selection", () => {
    const selection = new SelectionManager();
    const listener = vi.fn();

    selection.onChange(listener);
    selection.clear();

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribing", () => {
    const selection = new SelectionManager();
    const listener = vi.fn();

    const unsubscribe = selection.onChange(listener);

    selection.select("A");
    unsubscribe();
    selection.select("B");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not expose its mutable internal selection set", () => {
    const selection = new SelectionManager();
    selection.select("A");

    const snapshot = selection.getSelectedIds();

    (snapshot as Set<string>).add("B");

    expect(selection.isSelected("B")).toBe(false);
    expect(selection.count).toBe(1);
  });

  it("does not emit a selection event during construction", () => {
    const selection = new SelectionManager();
    const listener = vi.fn();

    selection.onChange(listener);

    expect(selection.count).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });
});
