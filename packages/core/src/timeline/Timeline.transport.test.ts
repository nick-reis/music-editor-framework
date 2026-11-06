import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timeline } from "./Timeline";
import { EditorWorkspace } from "../workspace/EditorWorkspace";
import type { TimelineTransportChange } from "../events/ModelChange";

describe("Timeline headless playhead and transport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts paused at tick zero and emits nothing for no-op pause/reset", () => {
    const timeline = new Timeline();
    const listener = vi.fn();
    timeline.onTransportChange(listener);

    expect(timeline.playheadTick).toBe(0);
    expect(timeline.isPlaying).toBe(false);
    timeline.pause();
    timeline.resetPlayhead();

    expect(listener).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("advances 480 ticks per half-second at 120 BPM and default 480 PPQ", () => {
    const timeline = new Timeline();
    timeline.play();

    vi.advanceTimersByTime(500);
    expect(timeline.playheadTick).toBeCloseTo(480, 8);
    vi.advanceTimersByTime(500);
    expect(timeline.playheadTick).toBeCloseTo(960, 8);
    expect(timeline.isPlaying).toBe(true);
    timeline.pause();
  });

  it("respects fractional ticks and custom resolution", () => {
    const timeline = new Timeline({ bpm: 137, ticksPerQuarter: 960 });
    timeline.play();
    vi.advanceTimersByTime(125);
    expect(timeline.playheadTick).toBeCloseTo(137 * 960 * 0.125 / 60, 8);
    timeline.pause();
  });

  it("emits one playing transition and never schedules two clock intervals", () => {
    const timeline = new Timeline();
    const events: TimelineTransportChange[] = [];
    timeline.onTransportChange((event) => events.push(event));

    timeline.play();
    timeline.play();

    expect(vi.getTimerCount()).toBe(1);
    expect(events.filter((event) => event.type === "playback-changed"))
      .toEqual([{ type: "playback-changed", isPlaying: true }]);

    timeline.pause();
    timeline.pause();

    expect(vi.getTimerCount()).toBe(0);
    expect(events.filter((event) => event.type === "playback-changed"))
      .toEqual([
        { type: "playback-changed", isPlaying: true },
        { type: "playback-changed", isPlaying: false },
      ]);
  });

  it("pauses at the exact clock position and resumes without a jump", () => {
    const timeline = new Timeline(120);
    timeline.play();

    vi.advanceTimersByTime(350);
    timeline.pause();
    expect(timeline.playheadTick).toBeCloseTo(336, 8);
    expect(timeline.isPlaying).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(2000);
    expect(timeline.playheadTick).toBeCloseTo(336, 8);

    timeline.play();
    vi.advanceTimersByTime(250);
    expect(timeline.playheadTick).toBeCloseTo(576, 8);
    timeline.pause();
  });

  it("resetPlayhead pauses and returns to zero without redundant notifications", () => {
    const timeline = new Timeline();
    const events: TimelineTransportChange[] = [];
    timeline.onTransportChange((event) => events.push(event));
    timeline.play();
    vi.advanceTimersByTime(250);

    timeline.resetPlayhead();
    expect(timeline.isPlaying).toBe(false);
    expect(timeline.playheadTick).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(events.at(-2)).toEqual({ type: "playback-changed", isPlaying: false });
    expect(events.at(-1)).toMatchObject({
      type: "playhead-moved", tick: 0,
    });

    const length = events.length;
    timeline.resetPlayhead();
    expect(events).toHaveLength(length);
  });

  it("accepts bars, beats, seconds, raw ticks and an inclusive end position", () => {
    const timeline = new Timeline({ bpm: 120, length: { bars: 8 } });

    timeline.seekPlayhead({ bar: 3 });
    expect(timeline.playheadTick).toBe(3840);

    timeline.seekPlayhead({ bar: 3, beat: 2, tick: 120 });
    expect(timeline.playheadTick).toBe(4440);

    timeline.seekPlayhead({ seconds: 4.5 });
    expect(timeline.playheadTick).toBeCloseTo(4320);

    timeline.seekPlayheadTick(123.456);
    expect(timeline.playheadTick).toBe(123.456);

    timeline.seekPlayhead({ bar: 9 });
    expect(timeline.playheadTick).toBe(timeline.lengthTicks);
  });

  it("does not snap or quantize an explicitly sought raw tick", () => {
    const timeline = new Timeline();
    timeline.seekPlayheadTick(105.125);
    expect(timeline.playheadTick).toBe(105.125);
    timeline.seekPlayheadTick(105.125);
    expect(timeline.playheadTick).toBe(105.125);
  });

  it("seeking during playback replaces the clock anchor and keeps playing", () => {
    const timeline = new Timeline();
    timeline.play();
    vi.advanceTimersByTime(400);
    timeline.seekPlayheadTick(960);
    expect(timeline.playheadTick).toBe(960);
    expect(timeline.isPlaying).toBe(true);

    vi.advanceTimersByTime(500);
    expect(timeline.playheadTick).toBeCloseTo(1440, 8);

    timeline.seekPlayhead({ seconds: 2 });
    expect(timeline.playheadTick).toBeCloseTo(1920, 8);
    vi.advanceTimersByTime(250);
    expect(timeline.playheadTick).toBeCloseTo(2160, 8);
    timeline.pause();
  });

  it("rejects invalid seeks atomically without stopping playback", () => {
    const timeline = new Timeline({ bpm: 120, length: { bars: 2 } });
    timeline.play();
    vi.advanceTimersByTime(250);
    const before = timeline.playheadTick;
    const invalid = [-1, Infinity, Number.NaN, timeline.lengthTicks + 0.001];

    for (const tick of invalid) {
      expect(() => timeline.seekPlayheadTick(tick)).toThrow(/timeline bounds|finite/);
    }
    expect(() => timeline.seekPlayhead({ seconds: -1 })).toThrow(/timeline bounds/);
    expect(timeline.playheadTick).toBeCloseTo(before, 8);
    expect(timeline.isPlaying).toBe(true);

    vi.advanceTimersByTime(250);
    expect(timeline.playheadTick).toBeCloseTo(before + 240, 8);
    timeline.pause();
  });

  it("stops exactly at the end, then play() restarts from the beginning", () => {
    const timeline = new Timeline({ bpm: 120, length: { beats: 1 } });
    const events: TimelineTransportChange[] = [];
    timeline.onTransportChange((event) => events.push(event));
    timeline.play();

    vi.advanceTimersByTime(1000);
    expect(timeline.playheadTick).toBe(timeline.lengthTicks);
    expect(timeline.isPlaying).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(events.at(-1)).toEqual({ type: "playback-changed", isPlaying: false });

    timeline.play();
    expect(timeline.playheadTick).toBe(0);
    expect(timeline.isPlaying).toBe(true);
    vi.advanceTimersByTime(250);
    expect(timeline.playheadTick).toBeCloseTo(240, 8);
    timeline.pause();
  });

  it("seeking to the timeline end while playing automatically stops", () => {
    const timeline = new Timeline({ length: { beats: 1 } });
    timeline.play();
    timeline.seekPlayheadTick(timeline.lengthTicks);
    expect(timeline.playheadTick).toBe(timeline.lengthTicks);
    expect(timeline.isPlaying).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("changes BPM at the old-rate position, then advances using the new rate", () => {
    const timeline = new Timeline(120);
    timeline.play();
    vi.advanceTimersByTime(500);
    expect(timeline.playheadTick).toBeCloseTo(480, 8);

    timeline.setBpm(60);
    expect(timeline.playheadTick).toBeCloseTo(480, 8);
    vi.advanceTimersByTime(500);
    expect(timeline.playheadTick).toBeCloseTo(720, 8);

    timeline.setBpm(240);
    vi.advanceTimersByTime(250);
    expect(timeline.playheadTick).toBeCloseTo(1200, 8);
    timeline.pause();
  });

  it("preserves absolute playhead ticks through time signature changes", () => {
    const timeline = new Timeline();
    timeline.seekPlayheadTick(1234.5);
    timeline.setTimeSignature([3, 4]);

    expect(timeline.playheadTick).toBe(1234.5);
    expect(timeline.fromTick(timeline.playheadTick).bar).toBe(1);
  });

  it("clamps and pauses on shortening but does not restart on expansion", () => {
    const timeline = new Timeline({ length: { bars: 4 } });
    timeline.play();
    vi.advanceTimersByTime(1000);
    expect(timeline.playheadTick).toBeCloseTo(960, 8);

    timeline.setLength({ beats: 1 });
    expect(timeline.lengthTicks).toBe(480);
    expect(timeline.playheadTick).toBe(480);
    expect(timeline.isPlaying).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    timeline.setLength({ bars: 8 });
    expect(timeline.playheadTick).toBe(480);
    expect(timeline.isPlaying).toBe(false);
  });

  it("leaves playing active when a longer new length still contains the playhead", () => {
    const timeline = new Timeline({ bpm: 120, length: { bars: 8 } });
    timeline.play();
    vi.advanceTimersByTime(1000);
    timeline.setLength({ bars: 4 });
    expect(timeline.isPlaying).toBe(true);
    vi.advanceTimersByTime(250);
    expect(timeline.playheadTick).toBeCloseTo(1200, 8);
    timeline.pause();
  });

  it("does not create/invalidate history or flood workspace change events", () => {
    const timeline = new Timeline();
    const workspace = new EditorWorkspace([], "transport-history", timeline);
    workspace.history.execute("Tempo", () => timeline.setBpm(90));
    expect(workspace.history.canUndo).toBe(true);

    const workspaceEvents = vi.fn();
    const transportEvents = vi.fn();
    workspace.onChange(workspaceEvents);
    timeline.onTransportChange(transportEvents);

    timeline.play();
    vi.advanceTimersByTime(1000);
    timeline.seekPlayhead({ bar: 2 });
    timeline.pause();
    timeline.resetPlayhead();

    expect(workspaceEvents).not.toHaveBeenCalled();
    expect(transportEvents).toHaveBeenCalled();
    expect(workspace.history.canUndo).toBe(true);
    expect(workspace.history.undoLabel).toBe("Tempo");
    expect(workspace.history.undo()).toBe(true);
    expect(timeline.bpm).toBe(120);
    expect(timeline.playheadTick).toBe(0);
  });

  it("applies undo/redo tempo changes smoothly while playback continues", () => {
    const timeline = new Timeline({ bpm: 120, length: { bars: 8 } });
    const workspace = new EditorWorkspace([], "tempo-undo", timeline);
    workspace.history.execute("Slow down", () => timeline.setBpm(60));
    expect(workspace.history.canUndo).toBe(true);

    timeline.play();
    vi.advanceTimersByTime(500);
    expect(timeline.playheadTick).toBeCloseTo(240, 8);

    expect(workspace.history.undo()).toBe(true);
    expect(timeline.isPlaying).toBe(true);
    expect(timeline.playheadTick).toBeCloseTo(240, 8);
    vi.advanceTimersByTime(500);
    expect(timeline.playheadTick).toBeCloseTo(720, 8);

    expect(workspace.history.redo()).toBe(true);
    vi.advanceTimersByTime(500);
    expect(timeline.playheadTick).toBeCloseTo(960, 8);
    expect(timeline.isPlaying).toBe(true);
    timeline.pause();
  });

  it("runs independent clocks for two timelines", () => {
    const a = new Timeline(120);
    const b = new Timeline(60);
    a.play();
    b.play();

    expect(vi.getTimerCount()).toBe(2);
    vi.advanceTimersByTime(500);
    expect(a.playheadTick).toBeCloseTo(480, 8);
    expect(b.playheadTick).toBeCloseTo(240, 8);

    a.pause();
    vi.advanceTimersByTime(500);
    expect(a.playheadTick).toBeCloseTo(480, 8);
    expect(b.playheadTick).toBeCloseTo(480, 8);
    b.pause();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses wall-clock elapsed time rather than a fixed delta per update", () => {
    const timeline = new Timeline();
    timeline.play();

    // A deliberately late timer still advances based on elapsed monotonic time
    // when queried, without relying on a fixed 16ms tick increment.
    vi.advanceTimersByTime(103);
    expect(timeline.playheadTick).toBeCloseTo(98.88, 8);
    timeline.pause();
    expect(timeline.playheadTick).toBeCloseTo(98.88, 8);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("unsubscribes from the transport stream and isolates listener exceptions", () => {
    const timeline = new Timeline();
    const broken = vi.fn(() => { throw new Error("observer failure"); });
    const observer = vi.fn();
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    const unsubscribe = timeline.onTransportChange(observer);
    timeline.onTransportChange(broken);

    try {
      timeline.play();
      vi.advanceTimersByTime(100);
      expect(observer).toHaveBeenCalled();
      expect(broken).toHaveBeenCalled();

      const calls = observer.mock.calls.length;
      unsubscribe();
      timeline.pause();
      timeline.resetPlayhead();
      expect(observer).toHaveBeenCalledTimes(calls);
      expect(logger).toHaveBeenCalled();
    } finally {
      timeline.pause();
      logger.mockRestore();
    }
  });
});
