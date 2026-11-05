import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "../elements/MidiNote";
import { SelectionManager } from "./SelectionManager";

describe("SelectionManager change notifications", () => {
  function note(id: string): MidiNote {
    return new MidiNote(0, 0, 120, id);
  }

  it("notifies when an element is selected", () => {
    const selection = new SelectionManager();
    const element = note("note-1");
    const listener = vi.fn();

    selection.onChange(listener);
    selection.select(element);

    expect(selection.isSelected(element)).toBe(true);
    expect(selection.count).toBe(1);
    expect(listener).toHaveBeenCalledExactlyOnceWith({
      addedElements: [element],
      removedElements: [],
    });
  });

  it("notifies when an element is deselected", () => {
    const selection = new SelectionManager();
    const element = note("note-1");
    selection.select(element);
    const listener = vi.fn();
    selection.onChange(listener);

    selection.deselect(element);

    expect(selection.isSelected(element)).toBe(false);
    expect(listener).toHaveBeenCalledExactlyOnceWith({
      addedElements: [],
      removedElements: [element],
    });
  });

  it("does not notify for redundant selections", () => {
    const selection = new SelectionManager();
    const element = note("note-1");
    selection.select(element);

    const listener = vi.fn();
    selection.onChange(listener);

    selection.select(element);
    selection.deselect(note("other"));

    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies correctly when toggling selection", () => {
    const selection = new SelectionManager();
    const element = note("note-1");
    const listener = vi.fn();
    selection.onChange(listener);

    selection.toggle(element);
    selection.toggle(element);

    expect(listener).toHaveBeenNthCalledWith(1, {
      addedElements: [element],
      removedElements: [],
    });
    expect(listener).toHaveBeenNthCalledWith(2, {
      addedElements: [],
      removedElements: [element],
    });
    expect(selection.count).toBe(0);
  });

  it("reports only changed elements when replacing selection", () => {
    const selection = new SelectionManager();
    const a = note("A");
    const b = note("B");
    const c = note("C");
    selection.setSelection([a, b]);
    const listener = vi.fn();
    selection.onChange(listener);

    selection.setSelection([b, c]);

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      addedElements: [c],
      removedElements: [a],
    });
    expect([...selection.getSelectedElements()]).toEqual([b, c]);
  });

  it("emits one notification when selecting multiple elements", () => {
    const selection = new SelectionManager();
    const elements = [note("A"), note("B"), note("C")];
    const listener = vi.fn();
    selection.onChange(listener);

    selection.setSelection(elements);

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      addedElements: elements,
      removedElements: [],
    });
    expect(selection.count).toBe(3);
  });

  it("does not notify when selection is unchanged", () => {
    const selection = new SelectionManager();
    const a = note("A");
    const b = note("B");
    selection.setSelection([a, b]);
    const listener = vi.fn();
    selection.onChange(listener);

    selection.setSelection([b, a, a]);

    expect(listener).not.toHaveBeenCalled();
  });

  it("clears the entire selection with one notification", () => {
    const selection = new SelectionManager();
    const elements = [note("A"), note("B"), note("C")];
    selection.setSelection(elements);
    const listener = vi.fn();
    selection.onChange(listener);

    selection.clear();

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      addedElements: [],
      removedElements: elements,
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

    selection.select(note("A"));
    unsubscribe();
    selection.select(note("B"));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not expose its mutable internal selection set", () => {
    const selection = new SelectionManager();
    const a = note("A");
    const b = note("B");
    selection.select(a);
    const snapshot = selection.getSelectedElements();

    (snapshot as Set<MidiNote>).add(b);

    expect(selection.isSelected(b)).toBe(false);
    expect(selection.count).toBe(1);
  });

  it("does not emit a selection event during construction", () => {
    const selection = new SelectionManager();
    const listener = vi.fn();
    selection.onChange(listener);

    expect(selection.count).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it("distinguishes different elements with identical IDs", () => {
    const selection = new SelectionManager();
    const first = note("same-id");
    const second = note("same-id");
    const listener = vi.fn();
    selection.onChange(listener);

    selection.select(first);
    selection.select(second);

    expect(selection.count).toBe(2);
    expect(selection.isSelected(first)).toBe(true);
    expect(selection.isSelected(second)).toBe(true);
    expect(listener).toHaveBeenNthCalledWith(1, {
      addedElements: [first],
      removedElements: [],
    });
    expect(listener).toHaveBeenNthCalledWith(2, {
      addedElements: [second],
      removedElements: [],
    });

    selection.deselect(first);

    expect(selection.count).toBe(1);
    expect(selection.isSelected(second)).toBe(true);
  });
});
