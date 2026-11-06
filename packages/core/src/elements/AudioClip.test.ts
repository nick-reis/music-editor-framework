import { describe, expect, it, vi } from "vitest";
import { AudioClip } from "./AudioClip";
import { MidiNote } from "./MidiNote";
import { Timeline } from "../timeline/Timeline";
import { AudioGrid } from "../grids/AudioGrid";
import { MidiGrid } from "../grids/MidiGrid";
import { GridContainer } from "../grids/GridContainer";
import { EditorWorkspace } from "../workspace/EditorWorkspace";

describe("AudioClip native-time projection", () => {
  const audioRows = [{ id: "audio", label: "Audio" }];

  it("preserves the legacy standalone constructor and basic tick behavior", () => {
    const clip = new AudioClip(1, 120, 480, 2, "clip-1");

    expect(clip.id).toBe("clip-1");
    expect(clip.row).toBe(1);
    expect(clip.getStartTick()).toBe(120);
    expect(clip.getEndTick()).toBe(600);
    expect(clip.durationTicks).toBe(480);
    expect(clip.sourceDurationSeconds).toBe(2);
    expect(clip.durationSeconds).toBe(2);
    expect(clip.resizable).toBe(false);

    clip.moveToTick(960);
    expect(clip.getStartTick()).toBe(960);
    expect(clip.durationTicks).toBe(480);
    expect(clip.sourceDurationSeconds).toBe(2);
  });

  it("does not allow direct reassignment of the native source duration", () => {
    const clip = new AudioClip(0, 0, 480, 2, "immutable-source");
    expect(Reflect.set(clip, "sourceDurationSeconds", 10)).toBe(false);
    expect(clip.sourceDurationSeconds).toBe(2);
    expect(clip.durationSeconds).toBe(2);
  });

  it("constructs from seconds with a shared timeline while detached", () => {
    const timeline = new Timeline({ bpm: 120, ticksPerQuarter: 480 });
    const clip = AudioClip.fromSeconds(0, 480, 2, timeline, "clip-2");

    expect(clip.startTick).toBe(480);
    expect(clip.durationTicks).toBe(1920);
    expect(clip.getEndTick()).toBe(2400);

    timeline.setBpm(60);
    expect(clip.durationTicks).toBe(960);
    expect(clip.getEndTick()).toBe(1440);
    expect(clip.sourceDurationSeconds).toBe(2);
  });

  it("automatically follows its owning workspace's timeline", () => {
    const importedAt = new Timeline(200);
    const clip = AudioClip.fromSeconds(0, 120, 2.5, importedAt, "clip");
    const grid = new AudioGrid(audioRows, "audio");
    grid.addElement(clip);
    const workspace = new EditorWorkspace([new GridContainer([grid], "tracks")]);

    // The project timeline wins over the import timeline.
    expect(clip.durationTicks).toBe(2400);
    expect(clip.getEndTick()).toBe(2520);

    workspace.timeline.setBpm(60);
    expect(clip.durationTicks).toBe(1200);
    expect(clip.getEndTick()).toBe(1320);

    importedAt.setBpm(30);
    expect(clip.durationTicks).toBe(1200);
    expect(clip.sourceDurationSeconds).toBe(2.5);
  });

  it("adapts legacy-created clips automatically when attached", () => {
    const clip = new AudioClip(0, 0, 480, 2, "legacy");
    const grid = new AudioGrid(audioRows, "grid");
    grid.addElement(clip);
    const workspace = new EditorWorkspace([new GridContainer([grid], "tracks")]);
    expect(clip.durationTicks).toBe(1920);
    workspace.timeline.setBpm(90);
    expect(clip.durationTicks).toBe(1440);
    expect(clip.durationSeconds).toBe(2);
  });

  it("avoids cumulative floating-point drift after repeated BPM changes", () => {
    const timeline = new Timeline();
    const clip = AudioClip.fromSeconds(0, 73, 1.234567, timeline);

    for (const bpm of [60, 180, 90, 137, 120]) {
      timeline.setBpm(bpm);
      expect(timeline.ticksToSeconds(clip.durationTicks))
        .toBeCloseTo(clip.sourceDurationSeconds, 10);
    }

    expect(clip.startTick).toBe(73);
    expect(clip.durationSeconds).toBe(1.234567);
  });

  it("never changes the clip state or emits a clip mutation for tempo changes", () => {
    const clip = new AudioClip(0, 0, 480, 2, "clip");
    const grid = new AudioGrid(audioRows, "audio");
    grid.addElement(clip);
    const workspace = new EditorWorkspace([new GridContainer([grid], "tracks")]);
    const elementChanges = vi.fn();
    const gridChanges = vi.fn();
    const workspaceChanges = vi.fn();
    clip.onChange(elementChanges);
    grid.onChange(gridChanges);
    workspace.onChange(workspaceChanges);

    workspace.timeline.setBpm(60);

    expect(clip.durationTicks).toBe(960);
    expect(elementChanges).not.toHaveBeenCalled();
    expect(gridChanges).not.toHaveBeenCalled();
    expect(workspaceChanges).toHaveBeenCalledExactlyOnceWith([{
      type: "timeline-changed",
      change: { type: "bpm", previousBpm: 120, bpm: 60 },
    }]);
  });

  it("supports timeline changes while clips are hard locked", () => {
    const clip = AudioClip.fromSeconds(0, 0, 2, new Timeline(120), "locked");
    const grid = new AudioGrid(audioRows, "audio");
    grid.addElement(clip);
    const workspace = new EditorWorkspace([new GridContainer([grid], "tracks")]);
    clip.setLocked(true);

    expect(() => clip.moveToTick(120)).toThrow(/locked/);
    expect(() => clip.resizeToDuration(960)).toThrow("Element cannot be resized");

    workspace.timeline.setBpm(60);
    expect(clip.locked).toBe(true);
    expect(clip.durationTicks).toBe(960);
    expect(clip.sourceDurationSeconds).toBe(2);
  });

  it("tracks BPM as one history action without recording per-clip edits", () => {
    const clip = AudioClip.fromSeconds(0, 0, 2, new Timeline());
    const grid = new AudioGrid(audioRows, "audio");
    grid.addElement(clip);
    const workspace = new EditorWorkspace([new GridContainer([grid], "tracks")]);

    workspace.history.execute("Change tempo", () => {
      workspace.timeline.setBpm(60);
      expect(clip.durationTicks).toBe(960);
    });

    expect(workspace.history.canUndo).toBe(true);
    expect(workspace.history.undoLabel).toBe("Change tempo");
    expect(workspace.history.undo()).toBe(true);
    expect(workspace.timeline.bpm).toBe(120);
    expect(clip.durationTicks).toBe(1920);
    expect(workspace.history.redo()).toBe(true);
    expect(workspace.timeline.bpm).toBe(60);
    expect(clip.durationTicks).toBe(960);
  });

  it("does not interfere with tick-based MIDI notes on BPM change", () => {
    const note = new MidiNote(0, 120, 480);
    const midi = new MidiGrid([{ id: "c4", label: "C4", pitch: 60 }]);
    midi.addElement(note);
    const workspace = new EditorWorkspace([new GridContainer([midi])]);

    workspace.timeline.setBpm(60);

    expect(note.startTick).toBe(120);
    expect(note.durationTicks).toBe(480);
    expect(note.getEndTick()).toBe(600);
  });

  it("does not permit direct manual resizing", () => {
    const clip = new AudioClip(0, 0, 480, 2, "clip");
    expect(() => clip.resizeToDuration(960)).toThrow("Element cannot be resized");
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid source audio duration %s",
    (durationSeconds) => {
      expect(() => new AudioClip(0, 0, 480, durationSeconds))
        .toThrow("Invalid audio duration");
      expect(() => AudioClip.fromSeconds(0, 0, durationSeconds, new Timeline()))
        .toThrow("Invalid audio duration");
    },
  );

  it("handles a different project resolution correctly", () => {
    const timeline = new Timeline({ bpm: 120, ticksPerQuarter: 960 });
    const clip = AudioClip.fromSeconds(0, 960, 2, timeline);
    const grid = new AudioGrid(audioRows);
    grid.addElement(clip);
    const workspace = new EditorWorkspace(
      [new GridContainer([grid])],
      "high-resolution",
      timeline,
    );

    expect(clip.durationTicks).toBe(3840);
    workspace.timeline.setBpm(60);
    expect(clip.durationTicks).toBe(1920);
  });
});
