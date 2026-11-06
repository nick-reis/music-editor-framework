import { describe, expect, it, vi } from "vitest";
import { Timeline } from "./Timeline";
import { TICKS_PER_QUARTER_NOTE } from "../types/time";

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

describe("Timeline change notifications", () => {
  it("initializes with the default BPM", () => {
    const timeline = new Timeline();

    expect(timeline.bpm).toBe(120);
  });

  it("accepts a custom initial BPM", () => {
    const timeline = new Timeline(90);

    expect(timeline.bpm).toBe(90);
  });

  it("notifies listeners when BPM changes", () => {
    const timeline = new Timeline(120);
    const listener = vi.fn();

    timeline.onChange(listener);
    timeline.setBpm(140);

    expect(timeline.bpm).toBe(140);

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      previousBpm: 120,
      bpm: 140,
    });
  });

  it("reports consecutive BPM changes correctly", () => {
    const timeline = new Timeline(120);
    const listener = vi.fn();

    timeline.onChange(listener);

    timeline.setBpm(140);
    timeline.setBpm(90);

    expect(listener).toHaveBeenNthCalledWith(1, {
      previousBpm: 120,
      bpm: 140,
    });

    expect(listener).toHaveBeenNthCalledWith(2, {
      previousBpm: 140,
      bpm: 90,
    });
  });

  it("does not notify when BPM is unchanged", () => {
    const timeline = new Timeline(120);
    const listener = vi.fn();

    timeline.onChange(listener);
    timeline.setBpm(120);

    expect(listener).not.toHaveBeenCalled();
  });

  it.each([
    0,
    -120,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])("rejects invalid BPM during construction (%s)", (bpm) => {
    expect(() => new Timeline(bpm)).toThrow(
      "BPM must be a positive finite number",
    );
  });

  it("rejects invalid BPM without changing state or notifying", () => {
    const timeline = new Timeline(120);
    const listener = vi.fn();

    timeline.onChange(listener);

    expect(() => timeline.setBpm(-10)).toThrow();
    expect(() => timeline.setBpm(Number.NaN)).toThrow();
    expect(() => timeline.setBpm(Number.POSITIVE_INFINITY)).toThrow();

    expect(timeline.bpm).toBe(120);
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying listeners after unsubscribing", () => {
    const timeline = new Timeline(120);
    const listener = vi.fn();

    const unsubscribe = timeline.onChange(listener);

    timeline.setBpm(140);
    unsubscribe();
    timeline.setBpm(160);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("supports multiple independent subscribers", () => {
    const timeline = new Timeline(120);
    const first = vi.fn();
    const second = vi.fn();

    const unsubscribe = timeline.onChange(first);
    timeline.onChange(second);

    timeline.setBpm(140);
    unsubscribe();
    timeline.setBpm(160);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("converts ticks to seconds using the current BPM", () => {
    const timeline = new Timeline(120);
    const quarterNote = TICKS_PER_QUARTER_NOTE;

    expect(timeline.ticksToSeconds(quarterNote)).toBeCloseTo(0.5);

    timeline.setBpm(60);

    expect(timeline.ticksToSeconds(quarterNote)).toBeCloseTo(1);
  });

  it("converts seconds to ticks using the current BPM", () => {
    const timeline = new Timeline(120);
    const quarterNote = TICKS_PER_QUARTER_NOTE;

    expect(timeline.secondsToTicks(0.5)).toBeCloseTo(quarterNote);

    timeline.setBpm(60);

    expect(timeline.secondsToTicks(0.5)).toBeCloseTo(quarterNote / 2);
  });

  it("preserves timing through round-trip conversions", () => {
    const timeline = new Timeline(137);
    const originalTicks = 1920;

    const seconds = timeline.ticksToSeconds(originalTicks);
    const restoredTicks = timeline.secondsToTicks(seconds);

    expect(restoredTicks).toBeCloseTo(originalTicks);
  });

  it("does not emit events during time conversions", () => {
    const timeline = new Timeline(120);
    const listener = vi.fn();

    timeline.onChange(listener);

    timeline.ticksToSeconds(480);
    timeline.secondsToTicks(2);

    expect(listener).not.toHaveBeenCalled();
  });
});


describe("Timeline configurable resolution and workspace history", () => {
  it("preserves legacy 480-tick resolution and accepts a custom resolution", () => {
    const defaultTimeline = new Timeline(120);
    const custom = new Timeline({ bpm: 120, ticksPerQuarter: 960 });

    expect(defaultTimeline.ticksPerQuarter).toBe(480);
    expect(custom.ticksPerQuarter).toBe(960);
    expect(custom.secondsToTicks(2)).toBe(3840);
    expect(custom.ticksToSeconds(3840)).toBe(2);
    custom.setBpm(60);
    expect(custom.ticksPerQuarter).toBe(960);
    expect(custom.secondsToTicks(2)).toBe(1920);
  });

  it("prevents changing project tick resolution after construction", () => {
    const timeline = new Timeline({ ticksPerQuarter: 960 });
    expect(Reflect.set(timeline, "ticksPerQuarter", 480)).toBe(false);
    expect(timeline.ticksPerQuarter).toBe(960);
  });

  it.each([0, -1, 0.1, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid ticks-per-quarter resolution %s",
    (ticksPerQuarter) => {
      expect(() => new Timeline({ ticksPerQuarter }))
        .toThrow(/Ticks per quarter must be a positive safe integer/);
    },
  );

  it("rejects invalid conversion values and overflow", () => {
    const timeline = new Timeline();

    expect(() => timeline.secondsToTicks(Infinity))
      .toThrow("Seconds must be finite");
    expect(() => timeline.ticksToSeconds(Number.NaN))
      .toThrow("Ticks must be finite");
    expect(() => timeline.secondsToTicks(Number.MAX_VALUE))
      .toThrow("Ticks conversion overflow");
  });

  it("supports negative time offsets and fractional ticks without rounding", () => {
    const timeline = new Timeline(137);
    const ticks = -123.456789;

    expect(timeline.secondsToTicks(timeline.ticksToSeconds(ticks)))
      .toBeCloseTo(ticks, 10);
    expect(timeline.secondsToTicks(0)).toBe(0);
  });

  it("exposes a start-aware API for native audio durations", () => {
    const timeline = new Timeline({ bpm: 120, ticksPerQuarter: 960 });

    expect(timeline.durationSecondsToTicks(0, 2)).toBe(3840);
    expect(timeline.durationSecondsToTicks(5000, 2)).toBe(3840);
    expect(() => timeline.durationSecondsToTicks(Infinity, 2))
      .toThrow("Ticks must be finite");
    expect(() => timeline.durationSecondsToTicks(0, 0))
      .toThrow("Audio duration must be positive");
  });

  it("does not notify on an unchanged tempo", () => {
    const timeline = new Timeline();
    const listener = vi.fn();
    timeline.onChange(listener);

    timeline.setBpm(120);
    expect(listener).not.toHaveBeenCalled();
  });
});
