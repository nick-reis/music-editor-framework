import { describe, expect, it } from "vitest";
import { Timeline } from "./Timeline";

describe("Timeline", () => {
  it.each([
    [60, 480, 1],
    [120, 480, 0.5],
    [180, 480, 1 / 3],
  ])("converts ticks to seconds at %i BPM", (bpm, ticks, seconds) => {
    expect(new Timeline(bpm).ticksToSeconds(ticks)).toBeCloseTo(seconds);
  });

  it.each([
    [60, 1, 480],
    [120, 0.5, 480],
    [180, 1 / 3, 480],
  ])("converts seconds to ticks at %i BPM", (bpm, seconds, ticks) => {
    expect(new Timeline(bpm).secondsToTicks(seconds)).toBeCloseTo(ticks);
  });

  it("uses the updated BPM for subsequent conversions", () => {
    const timeline = new Timeline(120);

    expect(timeline.ticksToSeconds(480)).toBeCloseTo(0.5);
    timeline.setBpm(60);
    expect(timeline.bpm).toBe(60);
    expect(timeline.ticksToSeconds(480)).toBeCloseTo(1);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid BPM %s",
    (bpm) => {
      expect(() => new Timeline(bpm)).toThrow(
        "BPM must be a positive finite number",
      );
      expect(() => new Timeline(120).setBpm(bpm)).toThrow(
        "BPM must be a positive finite number",
      );
    },
  );

  it("round-trips fractional tick values with floating-point precision", () => {
    const timeline = new Timeline(137);
    const ticks = 123.456789;

    expect(timeline.secondsToTicks(timeline.ticksToSeconds(ticks))).toBeCloseTo(
      ticks,
      10,
    );
  });

  it("handles zero and fractional ticks", () => {
    const timeline = new Timeline(120);

    expect(timeline.ticksToSeconds(0)).toBe(0);
    expect(timeline.ticksToSeconds(240)).toBeCloseTo(0.25);
    expect(timeline.secondsToTicks(0)).toBe(0);
    expect(timeline.secondsToTicks(0.125)).toBeCloseTo(120);
  });
});
