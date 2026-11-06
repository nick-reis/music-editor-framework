import { describe, expect, it, vi } from "vitest";
import { MidiGrid } from "./MidiGrid";
import { AudioGrid } from "./AudioGrid";
import { GridContainer } from "./GridContainer";
import { EditorWorkspace } from "../workspace/EditorWorkspace";
import { Timeline } from "../timeline/Timeline";
import { MidiNote } from "../elements/MidiNote";
import { AudioClip } from "../elements/AudioClip";

const midiRows = [{ id: "c4", label: "C4", pitch: 60 }];
const audioRows = [{ id: "audio", label: "Audio" }];

function editor(options: { bpm?: number; bars?: number } = {}) {
  const timeline = new Timeline({
    bpm: options.bpm ?? 120,
    timeSignature: [4, 4],
    length: { bars: options.bars ?? 8 },
  });
  const midi = new MidiGrid(midiRows, "midi");
  const audio = new AudioGrid(audioRows, "audio");
  const container = new GridContainer([midi, audio], "tracks");
  const workspace = new EditorWorkspace([container], "workspace", timeline);
  return { workspace, timeline, midi, audio };
}

describe("Grid-owned element creation", () => {
  it("creates a MIDI note using bars and fractional beats without a timeline parameter", () => {
    const { midi, timeline } = editor();
    const note = midi.createElement({
      row: 0,
      start: { bar: 3, beat: 2.5 },
      duration: { beats: 0.5 },
      id: "note-from-bars",
    });

    expect(note).toBeInstanceOf(MidiNote);
    expect(note.id).toBe("note-from-bars");
    expect(note.startTick).toBe(4560);
    expect(note.durationTicks).toBe(240);
    expect(note.grid).toBe(midi);
    expect(midi.getElement(note.id)).toBe(note);
    expect(note.getEndTick()).toBeLessThanOrEqual(timeline.lengthTicks);
  });

  it("creates a MIDI note using seconds for its start and duration", () => {
    const { midi } = editor();
    const note = midi.createElement({
      row: 0,
      start: { seconds: 3 },
      duration: { seconds: 0.25 },
    });
    expect(note.startTick).toBe(2880);
    expect(note.durationTicks).toBe(240);
    note.moveBy({ beats: 1.5 });
    expect(note.startTick).toBe(3600);
  });

  it("creates an audio clip at a musical position with native source seconds", () => {
    const { audio } = editor();
    const clip = audio.createElement({
      row: 0,
      start: { bar: 2, beat: 1 },
      sourceDurationSeconds: 1.5,
      id: "audio-from-bars",
    });
    expect(clip).toBeInstanceOf(AudioClip);
    expect(clip.id).toBe("audio-from-bars");
    expect(clip.grid).toBe(audio);
    expect(clip.startTick).toBe(1920);
    expect(clip.sourceDurationSeconds).toBe(1.5);
    expect(clip.durationTicks).toBe(1440);
  });

  it("creates an audio clip using seconds without converting at the call site", () => {
    const { audio, timeline } = editor();
    const clip = audio.createElement({
      row: 0,
      start: { seconds: 2.25 },
      sourceDurationSeconds: 1.25,
    });
    expect(clip.startTick).toBe(2160);
    expect(clip.durationTicks).toBe(1200);
    timeline.setBpm(60);
    expect(clip.startTick).toBe(2160);
    expect(clip.durationTicks).toBe(600);
  });

  it("requires grid ownership by a workspace, not a caller-provided timeline", () => {
    const grid = new MidiGrid(midiRows);
    expect(() => grid.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 },
    })).toThrow(/Grid must belong to a workspace/);
    expect(grid.getElements()).toEqual([]);

    const container = new GridContainer([grid]);
    expect(() => grid.createElement({
      row: 0, start: { seconds: 2 }, duration: { beats: 1 },
    })).toThrow(/Grid must belong to a workspace/);
    expect(container.workspace).toBeNull();

    new EditorWorkspace([container], undefined, new Timeline());
    expect(grid.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 },
    }).grid).toBe(grid);
  });

  it("rejects invalid rows and duplicate IDs without altering existing elements", () => {
    const { midi } = editor();
    const note = midi.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 1 }, id: "stable",
    });
    expect(() => midi.createElement({
      row: 4, start: { bar: 1 }, duration: { beats: 1 }, id: "bad-row",
    })).toThrow(/row is outside grid bounds/);
    expect(() => midi.createElement({
      row: 0, start: { bar: 2 }, duration: { beats: 1 }, id: "stable",
    })).toThrow(/already exists/);
    expect(midi.getElements()).toEqual([note]);
  });

  it("rejects out-of-bounds starts, overflowing durations, and invalid durations", () => {
    const { midi, audio } = editor({ bars: 2 });
    expect(() => midi.createElement({
      row: 0, start: { bar: 3 }, duration: { beats: 1 },
    })).toThrow(/timeline bounds/);
    expect(() => midi.createElement({
      row: 0, start: { bar: 2, beat: 4 }, duration: { beats: 2 },
    })).toThrow(/timeline bounds/);
    expect(() => midi.createElement({
      row: 0, start: { seconds: 0 }, duration: { beats: -1, bars: 1 },
    })).toThrow(/cannot be negative/);
    expect(() => midi.createElement({
      row: 0, start: { bar: 1 }, duration: { beats: 0 },
    })).toThrow(/length must be positive/);
    expect(() => audio.createElement({
      row: 0, start: { bar: 2, beat: 4 },
      sourceDurationSeconds: 2,
    })).toThrow(/timeline bounds/);
    expect(midi.getElements()).toEqual([]);
    expect(audio.getElements()).toEqual([]);
  });

  it("records creation in workspace history and restores the exact object on redo", () => {
    const { workspace, midi } = editor();
    const listener = vi.fn();
    workspace.onChange(listener);
    let created: MidiNote | undefined;
    workspace.history.execute("Insert MIDI note", () => {
      created = midi.createElement({
        row: 0,
        start: { bar: 2 },
        duration: { beats: 1 },
      });
    });
    expect(created).toBeDefined();
    expect(workspace.history.undoLabel).toBe("Insert MIDI note");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(workspace.history.undo()).toBe(true);
    expect(midi.getElements()).toEqual([]);
    expect(created!.grid).toBeNull();
    expect(workspace.history.redo()).toBe(true);
    expect(midi.getElements()).toEqual([created]);
    expect(created!.grid).toBe(midi);
  });

  it("rolls back earlier creations and drops notifications when a later one fails", () => {
    const { workspace, midi } = editor({ bars: 2 });
    const listener = vi.fn();
    workspace.onChange(listener);
    expect(() => workspace.history.execute("Failed insertion", () => {
      midi.createElement({
        row: 0, start: { bar: 1 }, duration: { beats: 1 },
      });
      midi.createElement({
        row: 0, start: { bar: 2, beat: 4 }, duration: { bars: 1 },
      });
    })).toThrow(/timeline bounds/);
    expect(midi.getElements()).toEqual([]);
    expect(workspace.history.canUndo).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("still permits low-level element construction for restored documents", () => {
    const { midi } = editor();
    const restored = new MidiNote(0, 480, 240, "restored-note");
    midi.addElement(restored);
    expect(midi.getElement("restored-note")).toBe(restored);
  });
});
