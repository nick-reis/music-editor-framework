import { describe, expect, it, vi } from "vitest";
import { EditorWorkspace } from "./EditorWorkspace";
import { Timeline } from "../timeline/Timeline";
import { GridContainer } from "../grids/GridContainer";
import { MidiGrid } from "../grids/MidiGrid";
import { Grid } from "../grids/Grid";
import { ToolId } from "../tools/ToolId";
import { AudioGrid } from "../grids/AudioGrid";
import { MidiNote } from "../elements/MidiNote";
import { AudioClip } from "../elements/AudioClip";

function setup() {
  const timeline = new Timeline({ bpm: 120, length: { bars: 8 } });
  const rowsA = [{ id: "c4", label: "C4", pitch: 60 }, { id: "d4", label: "D4", pitch: 62 }];
  const rowsB = [
    { id: "e4", label: "E4", pitch: 64 },
    { id: "f4", label: "F4", pitch: 65 },
    { id: "g4", label: "G4", pitch: 67 },
  ];
  const source = new MidiGrid(rowsA, "midi-source");
  const target = new MidiGrid(rowsB, "midi-target");
  const audio = new AudioGrid([{ id: "a", label: "Audio" }], "audio");
  const first = new GridContainer([source, audio], "first");
  const second = new GridContainer([target], "second");
  const workspace = new EditorWorkspace([first, second], "ws", timeline);
  return { workspace, timeline, source, target, audio };
}

describe("Atomic grouped movement", () => {
  it("moves several MIDI notes by bars, beats and rows as one history mutation", () => {
    const { workspace, source } = setup();
    const a = source.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 }, id: "a",
    });
    const b = source.createElement({
      row: 0, start: { bar: 2 }, duration: { beats: 0.5 }, id: "b",
    });

    workspace.history.execute("Move group", () => {
      workspace.moveElements([a, b], {
        by: { bars: 1, beats: 0.5 },
        rows: 1,
      });
    });

    expect([a.startTick, b.startTick]).toEqual([2160, 4080]);
    expect([a.row, b.row]).toEqual([1, 1]);
    expect(workspace.history.undoLabel).toBe("Move group");
    expect(workspace.history.undo()).toBe(true);
    expect([a.startTick, b.startTick]).toEqual([0, 1920]);
    expect([a.row, b.row]).toEqual([0, 0]);
    expect(workspace.history.redo()).toBe(true);
    expect([a.startTick, b.startTick]).toEqual([2160, 4080]);
    expect([a.row, b.row]).toEqual([1, 1]);
  });

  it("moves elements across multiple grids with one workspace change batch", () => {
    const { workspace, source, target } = setup();
    const a = source.createElement({
      row: 0, start: { bar: 2 }, duration: { beats: 1 },
    });
    const b = target.createElement({
      row: 1, start: { bar: 3 }, duration: { beats: 2 },
    });
    const events = vi.fn();
    workspace.onChange(events);

    workspace.history.execute("Group", () => {
      workspace.moveElements([a, b], {
        by: { beats: 0.5 }, rows: 1,
      });
    });

    expect(events).toHaveBeenCalledTimes(1);
    expect(events.mock.calls[0][0]).toHaveLength(2);
    expect(a.row).toBe(1);
    expect(b.row).toBe(2);
    expect(workspace.history.undo()).toBe(true);
    expect(events).toHaveBeenCalledTimes(2);
    expect(events.mock.calls[1][0]).toHaveLength(2);
    expect(a.row).toBe(0);
    expect(b.row).toBe(1);
  });

  it("preflights every target, preventing partial edits and notifications", () => {
    const { workspace, source } = setup();
    const a = source.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 },
    });
    const b = source.createElement({
      row: 1, start: { bar: 8, beat: 3 }, duration: { beats: 1 },
    });
    const events = vi.fn();
    workspace.onChange(events);
    expect(() => workspace.moveElements([a, b], {
      by: { beats: 2 },
    })).toThrow(/timeline bounds/);
    expect([a.startTick, b.startTick]).toEqual([0, 7 * 1920 + 960]);
    expect(events).not.toHaveBeenCalled();
    expect(workspace.history.canUndo).toBe(false);
  });

  it("rejects a locked member before moving any other member", () => {
    const { workspace, source } = setup();
    const a = source.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 },
    });
    const b = source.createElement({
      row: 1, start: { bar: 2 }, duration: { beats: 1 },
    });
    b.locked = true;
    expect(() => workspace.moveElements([a, b], {
      by: { beats: 1 },
    })).toThrow(/locked/);
    expect(a.startTick).toBe(0);
    expect(a.row).toBe(0);
    expect(b.startTick).toBe(1920);
    expect(b.row).toBe(1);
  });

  it("rejects invalid rows, duplicates, foreign elements and out-of-range moves", () => {
    const { workspace, source, timeline } = setup();
    const a = source.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 },
    });
    expect(() => workspace.moveElements([a, a], {
      by: { beats: 1 },
    })).toThrow(/Duplicate elements/);
    expect(() => workspace.moveElements([a], {
      by: { ticks: 1 }, rows: 1.5,
    })).toThrow(/integer/);
    expect(() => workspace.moveElements([a], {
      by: { ticks: 0 }, rows: -1,
    })).toThrow(/row/);
    expect(() => workspace.moveElements([a], {
      by: { seconds: -1 },
    })).toThrow(/timeline bounds/);
    expect(() => workspace.moveElements([new MidiNote(0, 0, 480)], {
      by: { beats: 1 },
    })).toThrow(/workspace/);
    expect(timeline.lengthTicks).toBe(8 * 1920);
    expect(a.startTick).toBe(0);
  });

  it("no-op grouped movement creates no history entry or notifications", () => {
    const { workspace, source } = setup();
    const a = source.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 },
    });
    const listener = vi.fn();
    workspace.onChange(listener);
    workspace.history.execute("Zero", () => {
      workspace.moveElements([a], { by: { beats: 0 }, rows: 0 });
    });
    expect(workspace.history.canUndo).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("a direct successful grouped move invalidates previous undo history", () => {
    const { workspace, source } = setup();
    const a = source.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 },
    });
    workspace.history.execute("First edit", () => a.moveTo({ bar: 2 }));
    expect(workspace.history.canUndo).toBe(true);
    workspace.moveElements([a], { by: { beats: 1 } });
    expect(a.startTick).toBe(2400);
    expect(workspace.history.canUndo).toBe(false);
  });
});

describe("Atomic cross-grid transfers", () => {
  it("moves a note between MIDI grids retaining identity, row, order and undoability", () => {
    const { workspace, source, target } = setup();
    const original = source.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 }, id: "moving",
    });
    const sourceNeighbor = source.createElement({
      row: 0, start: { bar: 2 }, duration: { beats: 1 }, id: "staying",
    });
    const targetNeighbor = target.createElement({
      row: 0, start: { bar: 2 }, duration: { beats: 1 }, id: "existing",
    });
    const update = vi.fn();
    original.onChange(update);

    workspace.history.execute("Transfer note", () => {
      workspace.moveElementToGrid(original, target, {
        row: 2, start: { bar: 3, beat: 2 }, index: 0,
      });
    });
    expect(original.grid).toBe(target);
    expect(original.startTick).toBe(4320);
    expect(original.row).toBe(2);
    expect(source.getElements()).toEqual([sourceNeighbor]);
    expect(target.getElements()).toEqual([original, targetNeighbor]);
    expect(update).toHaveBeenCalledTimes(1);

    expect(workspace.history.undo()).toBe(true);
    expect(original.grid).toBe(source);
    expect(original.startTick).toBe(0);
    expect(original.row).toBe(0);
    expect(source.getElements()).toEqual([original, sourceNeighbor]);
    expect(target.getElements()).toEqual([targetNeighbor]);

    expect(workspace.history.redo()).toBe(true);
    expect(original.grid).toBe(target);
    expect(original.startTick).toBe(4320);
    expect(original.row).toBe(2);
    expect(source.getElements()).toEqual([sourceNeighbor]);
    expect(target.getElements()).toEqual([original, targetNeighbor]);
    expect(update).toHaveBeenCalledTimes(3);
  });

  it("transfers audio clips across audio grids without changing source seconds", () => {
    const { workspace, audio, timeline } = setup();
    const extra = new AudioGrid([{ id: "other", label: "Other" }]);
    workspace.getContainers()[1].addGrid(extra);
    const clip = audio.createElement({
      row: 0, start: { seconds: 1 }, sourceDurationSeconds: 2,
    });
    workspace.history.execute("Transfer audio", () => {
      workspace.moveElementToGrid(clip, extra, {
        row: 0, start: { seconds: 4 },
      });
    });
    expect(clip.grid).toBe(extra);
    expect(clip.startTick).toBe(3840);
    expect(clip.sourceDurationSeconds).toBe(2);
    expect(clip.durationTicks).toBe(1920);
    expect(workspace.history.undo()).toBe(true);
    expect(clip.grid).toBe(audio);
    expect(clip.startTick).toBe(960);
    timeline.setBpm(60);
    expect(clip.durationTicks).toBe(960);
  });

  it("validates grid type, row, timeline bounds and locked status before transfer", () => {
    const { workspace, source, target, audio } = setup();
    const a = source.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 },
    });
    const b = target.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 }, id: "taken",
    });
    const events = vi.fn();
    workspace.onChange(events);

    expect(() => workspace.moveElementToGrid(a, audio, {
      row: 0,
    })).toThrow(/does not accept/);
    expect(() => workspace.moveElementToGrid(a, target, {
      row: 3,
    })).toThrow(/row/);
    // One tick past an otherwise exactly fitting final beat is invalid.
    expect(() => workspace.moveElementToGrid(a, target, {
      row: 1, start: { bar: 8, beat: 4, tick: 1 },
    })).toThrow(/timeline bounds/);
    expect(() => workspace.moveElementToGrid(a, target, {
      row: 1, index: 3,
    })).toThrow(/index/);
    a.locked = true;
    events.mockClear();
    expect(() => workspace.moveElementToGrid(a, target, {
      row: 1,
    })).toThrow(/locked/);
    expect(a.grid).toBe(source);
    expect(source.getElements()).toEqual([a]);
    expect(target.getElements()).toEqual([b]);
    expect(events).not.toHaveBeenCalled();
  });

  it("prevents destination identity collisions without detaching the source", () => {
    const { workspace, source, target } = setup();
    const a = source.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 }, id: "same",
    });
    target.createElement({
      row: 0, start: { bar: 2 }, duration: { beats: 1 }, id: "same",
    });
    expect(() => workspace.moveElementToGrid(a, target, {
      row: 0,
    })).toThrow(/already exists/);
    expect(a.grid).toBe(source);
    expect(source.getElements()).toEqual([a]);
  });

  it("keeps the original object selected after a cross-grid transfer", () => {
    const { workspace, source, target } = setup();
    const a = source.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 },
    });
    workspace.selection.setSelection([a]);
    workspace.moveElementToGrid(a, target, { row: 0 });
    expect(a.grid).toBe(target);
    expect(workspace.selection.getSelectedElements()).toContain(a);
  });

  it("emits one atomic workspace batch after transfer and on undo", () => {
    const { workspace, source, target } = setup();
    const a = source.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 },
    });
    const calls = vi.fn();
    workspace.onChange(calls);
    workspace.history.execute("Transfer", () => {
      workspace.moveElementToGrid(a, target, {
        row: 1, start: { bar: 2 },
      });
    });
    expect(calls).toHaveBeenCalledTimes(1);
    expect(calls.mock.calls[0][0].length).toBeGreaterThanOrEqual(2);
    workspace.history.undo();
    expect(calls).toHaveBeenCalledTimes(2);
    expect(calls.mock.calls[1][0].length).toBeGreaterThanOrEqual(2);
  });

  it("reverts a transfer as part of a larger failed history transaction", () => {
    const { workspace, source, target } = setup();
    const a = source.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 },
    });
    const events = vi.fn();
    workspace.onChange(events);
    expect(() => workspace.history.execute("Failed batch", () => {
      workspace.moveElementToGrid(a, target, {
        row: 1, start: { bar: 2 },
      });
      a.moveTo({ bar: 50 });
    })).toThrow(/timeline bounds/);
    expect(a.grid).toBe(source);
    expect(a.startTick).toBe(0);
    expect(a.row).toBe(0);
    expect(workspace.history.canUndo).toBe(false);
    expect(events).not.toHaveBeenCalled();
  });

  it("undoes multiple sequential transfers in one history entry without losing order", () => {
    const { workspace, source, target } = setup();
    const a = source.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 }, id: "first",
    });
    const b = source.createElement({
      row: 0, start: { bar: 2 }, duration: { beats: 1 }, id: "second",
    });
    const c = source.createElement({
      row: 0, start: { bar: 3 }, duration: { beats: 1 }, id: "third",
    });
    workspace.history.execute("Transfer two", () => {
      workspace.moveElementToGrid(a, target, { row: 0 });
      workspace.moveElementToGrid(b, target, { row: 1 });
    });
    expect(source.getElements()).toEqual([c]);
    expect(target.getElements()).toEqual([a, b]);
    expect(workspace.history.undo()).toBe(true);
    expect(source.getElements()).toEqual([a, b, c]);
    expect(target.getElements()).toEqual([]);
    expect(workspace.history.redo()).toBe(true);
    expect(source.getElements()).toEqual([c]);
    expect(target.getElements()).toEqual([a, b]);
  });

  it("supports transferring and then group-moving in the same compound edit", () => {
    const { workspace, source, target } = setup();
    const a = source.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 },
    });
    workspace.history.execute("Transfer and move", () => {
      workspace.moveElementToGrid(a, target, { row: 1 });
      workspace.moveElements([a], { by: { beats: 2 }, rows: 1 });
    });
    expect(a.grid).toBe(target);
    expect(a.row).toBe(2);
    expect(a.startTick).toBe(960);
    expect(workspace.history.undo()).toBe(true);
    expect(a.grid).toBe(source);
    expect(a.row).toBe(0);
    expect(a.startTick).toBe(0);
    expect(workspace.history.redo()).toBe(true);
    expect(a.grid).toBe(target);
    expect(a.row).toBe(2);
    expect(a.startTick).toBe(960);
  });

  it("restores a custom source grid on undo even if it rejects incoming transfers", () => {
    class OutboundOnlyGrid extends Grid<MidiNote> {
      readonly supportedTools: ReadonlySet<ToolId> = new Set([ToolId.Pointer]);
      readonly toolFallbacks: Readonly<Partial<Record<ToolId, ToolId>>> = {};
      constructor() {
        super([{ id: "special", label: "Special" }], "custom-source");
      }
    }

    const source = new OutboundOnlyGrid();
    const target = new MidiGrid([{ id: "c4", label: "C4", pitch: 60 }]);
    const workspace = new EditorWorkspace([new GridContainer([source, target])]);
    const note = new MidiNote(0, 0, 480, "custom-note");
    source.addElement(note);
    workspace.history.execute("Outbound", () => {
      workspace.moveElementToGrid(note, target, { row: 0 });
    });
    expect(note.grid).toBe(target);
    expect(workspace.history.undo()).toBe(true);
    expect(note.grid).toBe(source);
    expect(source.getElements()).toEqual([note]);
    expect(workspace.history.redo()).toBe(true);
    expect(note.grid).toBe(target);
  });

  it("does not allow transfers across different workspaces", () => {
    const { workspace, source } = setup();
    const a = source.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 },
    });
    const other = new MidiGrid([{ id: "x", label: "X", pitch: 72 }]);
    new EditorWorkspace([new GridContainer([other])]);
    expect(() => workspace.moveElementToGrid(a, other, {
      row: 0,
    })).toThrow(/this workspace/);
    expect(a.grid).toBe(source);
  });

  it("direct transfer invalidates existing history without creating a new entry", () => {
    const { workspace, source, target } = setup();
    const a = source.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 },
    });
    workspace.history.execute("Prepare", () => a.moveTo({ bar: 2 }));
    expect(workspace.history.canUndo).toBe(true);
    workspace.moveElementToGrid(a, target, { row: 0 });
    expect(a.grid).toBe(target);
    expect(workspace.history.canUndo).toBe(false);
  });
});


describe("Transfer at the inclusive timeline boundary", () => {
  it("accepts a note ending exactly on the last tick and replays its transfer", () => {
    const { workspace, source, target, timeline } = setup();
    const note = source.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 },
      id: "end-boundary",
    });
    workspace.history.execute("Exactly fitting transfer", () => {
      workspace.moveElementToGrid(note, target, {
        row: 1, start: { bar: 8, beat: 4 },
      });
    });
    expect(note.grid).toBe(target);
    expect(note.startTick + note.durationTicks).toBe(timeline.lengthTicks);
    expect(workspace.history.undo()).toBe(true);
    expect(note.grid).toBe(source);
    expect(note.startTick).toBe(0);
    expect(workspace.history.redo()).toBe(true);
    expect(note.grid).toBe(target);
    expect(note.startTick + note.durationTicks).toBe(timeline.lengthTicks);
  });
});

describe("Transfer publication ordering", () => {
  it("publishes removal, destination addition, then destination position update", () => {
    const { workspace, source, target } = setup();
    const note = source.createElement({
      row: 0,
      start: { bar: 1 },
      duration: { beats: 1 },
      id: "ordered-transfer",
    });
    const events: string[] = [];
    source.onChange((changes) => {
      for (const change of changes) events.push(`source:${change.type}`);
    });
    target.onChange((changes) => {
      for (const change of changes) events.push(`target:${change.type}`);
    });

    workspace.history.execute("Transfer", () => {
      workspace.moveElementToGrid(note, target, {
        row: 1, start: { bar: 2 },
      });
    });
    expect(events).toEqual([
      "source:element-removed",
      "target:element-added",
      "target:element-updated",
    ]);
    expect(note.grid).toBe(target);

    events.length = 0;
    workspace.history.undo();
    expect(events).toEqual([
      "target:element-removed",
      "source:element-added",
      "source:element-updated",
    ]);
    expect(note.grid).toBe(source);
  });
});
