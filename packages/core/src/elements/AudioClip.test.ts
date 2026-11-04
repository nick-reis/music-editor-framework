import { describe, expect, it } from "vitest";
import { AudioClip } from "./AudioClip";
import { Timeline } from "../timeline/Timeline";

describe("AudioClip", () => {
  it("inherits shared element behavior", () => {
    const clip = new AudioClip(1, 120, 480, 2, "clip-1");

    expect(clip.id).toBe("clip-1");
    expect(clip.row).toBe(1);
    expect(clip.getStartTick()).toBe(120);
    expect(clip.getEndTick()).toBe(600);
    expect(clip.resizable).toBe(false);
  });

  it("cannot be manually resized", () => {
    const clip = new AudioClip(0, 0, 480, 2, "clip-1");

    expect(() => clip.resizeToDuration(960)).toThrow("Element cannot be resized");
  });

  it("moves without changing duration or real-time duration", () => {
    const clip = new AudioClip(0, 120, 480, 2, "clip-1");

    clip.moveToTick(960);

    expect(clip.startTick).toBe(960);
    expect(clip.durationTicks).toBe(480);
    expect(clip.durationSeconds).toBe(2);
  });

  it("synchronizes tick duration while preserving start tick and seconds", () => {
    const timeline = new Timeline(120);
    const clip = new AudioClip(0, 120, 480, 2, "clip-1");

    clip.syncToTempo(timeline.secondsToTicks(clip.durationSeconds));

    expect(clip.startTick).toBe(120);
    expect(clip.durationTicks).toBe(1920);
    expect(clip.durationSeconds).toBe(2);
  });

  it("avoids rounding drift when synchronizing repeatedly at different tempos", () => {
    const clip = new AudioClip(0, 73, 480, 1.234567, "clip-1");
    const timeline = new Timeline();

    for (const bpm of [60, 180, 90, 137, 120]) {
      timeline.setBpm(bpm);
      clip.syncToTempo(timeline.secondsToTicks(clip.durationSeconds));
      expect(timeline.ticksToSeconds(clip.durationTicks)).toBeCloseTo(
        clip.durationSeconds,
        10,
      );
    }

    expect(clip.startTick).toBe(73);
    expect(clip.durationSeconds).toBe(1.234567);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid audio duration %s",
    (durationSeconds) => {
      expect(
        () => new AudioClip(0, 0, 480, durationSeconds, "clip-1"),
      ).toThrow("Invalid audio duration");
    },
  );
});
