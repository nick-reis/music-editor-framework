import { describe, expect, it, vi } from "vitest";
import { Timeline } from "./Timeline";
import { MidiNote } from "../elements/MidiNote";
import { AudioClip } from "../elements/AudioClip";
import { MidiGrid } from "../grids/MidiGrid";
import { AudioGrid } from "../grids/AudioGrid";
import { GridContainer } from "../grids/GridContainer";
import { EditorWorkspace } from "../workspace/EditorWorkspace";

const midiRows = [{ id: "c4", label: "C4", pitch: 60 }];
const audioRows = [{ id: "a", label: "Audio" }];

function midiWorkspace(
  timeline: Timeline = new Timeline({ length: { bars: 2 } }),
  notes: MidiNote[] = [new MidiNote(0, 0, 480)],
) {
  const grid = new MidiGrid(midiRows);
  for (const note of notes) grid.addElement(note);
  const workspace = new EditorWorkspace([new GridContainer([grid])], undefined, timeline);
  return { workspace, grid, note: notes[0], timeline };
}

describe("Musical coordinates and bounded timelines", () => {
  it("defaults to a finite 16-bar 4/4 timeline", () => {
    const timeline = new Timeline();
    expect(timeline.lengthTicks).toBe(16 * 4 * 480);
    expect(timeline.timeSignature).toEqual([4, 4]);
    expect(Object.isFrozen(timeline.timeSignature)).toBe(true);
    expect(timeline.toTick({ bar: 1 })).toBe(0);
    expect(timeline.toTick({ bar: 17 })).toBe(timeline.lengthTicks);
    expect(() => timeline.toTick({ bar: 18 })).toThrow(/outside timeline bounds/);
  });

  it("converts musical bars, fractional beats and subticks", () => {
    const timeline = new Timeline({ length: { bars: 4 } });
    expect(timeline.toTick({ bar: 3 })).toBe(3840);
    expect(timeline.toTick({ bar: 3, beat: 2.5 })).toBe(4560);
    expect(timeline.toTick({ bar: 3, beat: 2, tick: 240 })).toBe(4560);
    expect(timeline.fromTick(4560)).toEqual({ bar: 3, beat: 2, tick: 240 });
    expect(timeline.fromTick(0)).toEqual({ bar: 1, beat: 1, tick: 0 });
    expect(timeline.fromTick(timeline.lengthTicks)).toEqual({
      bar: 5, beat: 1, tick: 0,
    });
  });

  it("uses the denominator as the coordinate beat unit in 6/8", () => {
    const timeline = new Timeline({
      bpm: 120, ticksPerQuarter: 960,
      timeSignature: [6, 8], length: { bars: 2 },
    });
    expect(timeline.lengthTicks).toBe(5760);
    expect(timeline.toTick({ bar: 2, beat: 1.5 })).toBe(3120);
    expect(timeline.fromTick(3120)).toEqual({ bar: 2, beat: 1, tick: 240 });
    expect(timeline.toTickDelta({ bars: 1, beats: 0.5 })).toBe(3120);
  });

  it("accepts seconds for absolute positions and signed offsets", () => {
    const timeline = new Timeline({ bpm: 120, length: { seconds: 8 } });
    expect(timeline.lengthTicks).toBe(7680);
    expect(timeline.toTick({ seconds: 3 })).toBe(2880);
    expect(timeline.toTickDelta({ seconds: -1.5 })).toBe(-1440);
    expect(timeline.toTickDelta({ bars: -1, beats: 0.5 })).toBe(-1680);
    expect(timeline.fromTick(2880)).toEqual({ bar: 2, beat: 3, tick: 0 });
  });

  it("rejects invalid musical coordinates, mixed inputs and fractional bars", () => {
    const timeline = new Timeline({ length: { bars: 4 } });
    expect(() => timeline.toTick({ bar: 0 })).toThrow();
    expect(() => timeline.toTick({ bar: 2.5 })).toThrow();
    expect(() => timeline.toTick({ bar: 1, beat: 5 })).toThrow();
    expect(() => timeline.toTick({ bar: 1, beat: 4.5, tick: 300 })).toThrow();
    expect(() => timeline.toTick({ bar: 1, tick: 480 })).toThrow();
    expect(() => timeline.toTick({ seconds: -1 })).toThrow();
    expect(() => timeline.toTick({ bar: 1, seconds: 2 } as never)).toThrow();
    expect(() => timeline.toTickDelta({ bars: 1.5 })).toThrow();
    expect(() => timeline.toTickDelta({ bars: 1, seconds: 2 } as never)).toThrow();
    expect(() => timeline.toTickDelta({ beats: Number.NaN })).toThrow();
  });

  it("rejects invalid meter, resolution and timeline length", () => {
    expect(() => new Timeline({ timeSignature: [0, 4] })).toThrow();
    expect(() => new Timeline({ timeSignature: [4, 3] })).toThrow();
    expect(() => new Timeline({ timeSignature: [4, 0] })).toThrow();
    expect(() => new Timeline({ length: { bars: 0 } })).toThrow();
    expect(() => new Timeline({ length: { bars: 1.5 } })).toThrow();
    expect(() => new Timeline({ length: { bars: -1, beats: 5 } })).toThrow();
    expect(() => new Timeline({ length: { seconds: Infinity } })).toThrow();
    expect(() => new Timeline({ length: { seconds: -1 } })).toThrow();
  });

  it("updates finite length from either musical units or seconds", () => {
    const timeline = new Timeline({ bpm: 120, length: { bars: 2 } });
    expect(timeline.lengthTicks).toBe(3840);
    timeline.setLength({ seconds: 5 });
    expect(timeline.lengthTicks).toBe(4800);
    timeline.setLength({ bars: 3, beats: 0.5 });
    expect(timeline.lengthTicks).toBe(6000);
    expect(() => timeline.setLength({ bars: -1, beats: 5 })).toThrow();
    expect(timeline.lengthTicks).toBe(6000);
  });

  it("changes time signature without silently shifting content or timeline end", () => {
    const timeline = new Timeline({ timeSignature: [4, 4], length: { bars: 2 } });
    timeline.setTimeSignature([3, 4]);
    expect(timeline.timeSignature).toEqual([3, 4]);
    expect(timeline.lengthTicks).toBe(3840);
    expect(timeline.toTick({ bar: 2 })).toBe(1440);
    expect(timeline.fromTick(3840)).toEqual({ bar: 3, beat: 3, tick: 0 });
  });

  it("emits distinct change events for time signature and length", () => {
    const timeline = new Timeline({ length: { bars: 2 } });
    const listener = vi.fn();
    timeline.onChange(listener);
    timeline.setTimeSignature([3, 4]);
    timeline.setLength({ bars: 3 });
    expect(listener).toHaveBeenNthCalledWith(1, {
      type: "time-signature",
      previousTimeSignature: [4, 4],
      timeSignature: [3, 4],
    });
    expect(listener).toHaveBeenNthCalledWith(2, {
      type: "length", previousLengthTicks: 3840, lengthTicks: 4320,
    });
  });

  it("moves and resizes detached MIDI notes with an explicit timeline", () => {
    const timeline = new Timeline({ length: { bars: 4 } });
    const note = new MidiNote(0, 0, 480);
    expect(() => note.moveTo({ bar: 2 })).toThrow(/explicit timeline/);
    expect(() => note.moveBy({ seconds: 1 })).toThrow(/explicit timeline/);
    note.moveTo({ bar: 2 }, timeline);
    expect(note.startTick).toBe(1920);
    note.moveBy({ seconds: -0.5 }, timeline);
    expect(note.startTick).toBe(1440);
    note.resizeBy({ beats: 0.5 }, timeline);
    expect(note.durationTicks).toBe(720);
    note.resizeBy({ beats: -0.25 }, timeline);
    expect(note.durationTicks).toBe(600);
    expect(() => note.resizeBy({ seconds: -10 }, timeline)).toThrow();
    expect(note.durationTicks).toBe(600);
  });

  it("resolves the attached workspace timeline and creates one history entry", () => {
    const { workspace, note } = midiWorkspace();
    workspace.history.execute("Musical edit", () => {
      note.moveTo({ bar: 2 });
      note.moveBy({ beats: 0.5 });
      note.resizeBy({ beats: 1 });
    });
    expect(note.startTick).toBe(2160);
    expect(note.durationTicks).toBe(960);
    expect(workspace.history.undoLabel).toBe("Musical edit");
    expect(workspace.history.undo()).toBe(true);
    expect(note.startTick).toBe(0);
    expect(note.durationTicks).toBe(480);
    expect(workspace.history.redo()).toBe(true);
    expect(note.startTick).toBe(2160);
    expect(note.durationTicks).toBe(960);
  });

  it("rejects mixing timeline contexts and respects hard locking", () => {
    const { note } = midiWorkspace();
    const other = new Timeline();
    expect(() => note.moveTo({ seconds: 2 }, other)).toThrow(/different timeline/);
    note.locked = true;
    expect(() => note.moveBy({ beats: 1 })).toThrow(/locked/);
    expect(() => note.resizeBy({ beats: 1 })).toThrow(/locked/);
    expect(note.startTick).toBe(0);
    expect(note.durationTicks).toBe(480);
  });

  it("enforces bounds even through existing low-level tick operations", () => {
    const { note, timeline } = midiWorkspace();
    const end = timeline.lengthTicks;
    expect(() => note.moveToTick(-1)).toThrow(/timeline bounds/);
    expect(() => note.moveToTick(end)).toThrow(/timeline bounds/);
    expect(() => note.moveTo({ bar: 3 })).toThrow(/timeline bounds/);
    expect(() => note.resizeToDuration(end + 1)).toThrow(/timeline bounds/);
    expect(() => note.moveBy({ seconds: -1 })).toThrow(/timeline bounds/);
    expect(note.startTick).toBe(0);
    expect(note.durationTicks).toBe(480);
    note.moveToTick(end - 480);
    expect(note.getEndTick()).toBe(end);
  });

  it("rejects a late element insertion beyond the bound without attaching", () => {
    const { grid, timeline } = midiWorkspace();
    const beyond = new MidiNote(0, timeline.lengthTicks, 480);
    expect(() => grid.addElement(beyond)).toThrow(/timeline bounds/);
    expect(beyond.grid).toBeNull();
    expect(grid.getElement(beyond.id)).toBeUndefined();
  });

  it("rejects a detached grid or container with invalid elements", () => {
    const timeline = new Timeline({ length: { bars: 1 } });
    const far = new MidiNote(0, 2000, 480);
    const grid = new MidiGrid(midiRows);
    grid.addElement(far);
    const container = new GridContainer([grid]);
    const workspace = new EditorWorkspace([], undefined, timeline);
    expect(() => workspace.addContainer(container)).toThrow(/timeline bounds/);
    expect(container.workspace).toBeNull();
    expect(() => new EditorWorkspace([container], undefined, new Timeline({
      length: { bars: 1 },
    }))).toThrow(/timeline bounds/);
    expect(() => new GridContainer([new MidiGrid(midiRows)])).not.toThrow();
  });

  it("rejects adding an out-of-bounds grid to an existing workspace container", () => {
    const { workspace } = midiWorkspace();
    const container = workspace.getContainers()[0];
    const grid = new MidiGrid(midiRows);
    grid.addElement(new MidiNote(0, 5000, 480));
    expect(() => container.addGrid(grid)).toThrow(/timeline bounds/);
    expect(grid.container).toBeNull();
  });

  it("prevents shrinking a timeline over content, without mutation or events", () => {
    const timeline = new Timeline({ length: { bars: 3 } });
    const note = new MidiNote(0, 3000, 480);
    const { workspace } = midiWorkspace(timeline, [note]);
    const listener = vi.fn();
    workspace.onChange(listener);
    expect(() => timeline.setLength({ bars: 1 })).toThrow(/timeline bounds/);
    expect(timeline.lengthTicks).toBe(5760);
    expect(listener).not.toHaveBeenCalled();
    workspace.history.execute("Extend", () => timeline.setLength({ bars: 4 }));
    expect(timeline.lengthTicks).toBe(7680);
    expect(workspace.history.undo()).toBe(true);
    expect(timeline.lengthTicks).toBe(5760);
    expect(workspace.history.redo()).toBe(true);
    expect(timeline.lengthTicks).toBe(7680);
  });

  it("preflights BPM changes against native-time audio end boundaries", () => {
    const timeline = new Timeline({ bpm: 120, length: { beats: 4 } });
    const clip = AudioClip.fromSeconds(0, 1200, 0.5, timeline);
    const grid = new AudioGrid(audioRows);
    grid.addElement(clip);
    const workspace = new EditorWorkspace(
      [new GridContainer([grid])], undefined, timeline,
    );
    expect(clip.getEndTick()).toBe(1680);
    timeline.setBpm(180);
    expect(clip.getEndTick()).toBe(1920);
    expect(() => timeline.setBpm(181)).toThrow(/timeline bounds/);
    expect(timeline.bpm).toBe(180);
    expect(clip.getEndTick()).toBe(1920);
    workspace.history.execute("Slow tempo", () => timeline.setBpm(60));
    expect(clip.getEndTick()).toBe(1440);
    expect(workspace.history.undo()).toBe(true);
    expect(clip.getEndTick()).toBe(1920);
  });

  it("rolls back combined time-signature, length and musical edits atomically", () => {
    const { workspace, note, timeline } = midiWorkspace();
    const listener = vi.fn();
    workspace.onChange(listener);

    expect(() => workspace.history.execute("Bad composite", () => {
      timeline.setTimeSignature([3, 4]);
      timeline.setLength({ bars: 3 });
      note.moveTo({ bar: 2, beat: 2 });
      note.resizeBy({ seconds: 100 }); // Cannot fit within the new end
    })).toThrow(/timeline bounds/);

    expect(timeline.timeSignature).toEqual([4, 4]);
    expect(timeline.lengthTicks).toBe(3840);
    expect(note.startTick).toBe(0);
    expect(note.durationTicks).toBe(480);
    expect(workspace.history.canUndo).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not record history for an unchanged timeline configuration", () => {
    const { workspace, timeline } = midiWorkspace();
    workspace.history.execute("No change", () => {
      timeline.setBpm(120);
      timeline.setTimeSignature([4, 4]);
      timeline.setLength({ bars: 2 });
    });
    expect(workspace.history.canUndo).toBe(false);
  });

  it("does not allow adding an audio clip whose source duration crosses the end", () => {
    const { workspace, timeline } = midiWorkspace();
    const audioGrid = new AudioGrid(audioRows);
    workspace.getContainers()[0].addGrid(audioGrid);
    const outside = new Timeline({ length: { bars: 16 } });
    const clip = AudioClip.fromSeconds(0, timeline.lengthTicks - 240, 1, outside);
    expect(() => audioGrid.addElement(clip)).toThrow(/timeline bounds/);
    expect(clip.grid).toBeNull();
    expect(() => AudioClip.fromSeconds(
      0, timeline.lengthTicks - 240, 1, timeline,
    )).toThrow(/timeline bounds/);
  });
});
