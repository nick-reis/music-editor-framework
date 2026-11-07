import { describe, expect, it } from "vitest";
import { HorizontalCamera } from "./HorizontalCamera";

describe("HorizontalCamera", () => {
  it("converts ticks and pixels without rounding", () => {
    const camera = new HorizontalCamera();

    expect(camera.tickToX(480)).toBe(24);
    expect(camera.xToTick(24)).toBe(480);
    expect(camera.xToTick(camera.tickToX(123.75))).toBeCloseTo(123.75);
  });

  it("animates toward a pan target", () => {
    const camera = new HorizontalCamera();

    camera.panBy(120);
    expect(camera.state.scrollLeft).toBe(0);

    camera.advance(1 / 60);
    expect(camera.state.scrollLeft).toBeGreaterThan(0);
    expect(camera.state.scrollLeft).toBeLessThan(120);
  });

  it("preserves the cursor anchor throughout zoom", () => {
    const camera = new HorizontalCamera();
    const anchorX = 100;
    const tick = camera.xToTick(anchorX);

    camera.zoomAt(anchorX, 2);
    for (let i = 0; i < 30; i++) {
      camera.advance(1 / 60);
      expect(camera.tickToX(tick)).toBeCloseTo(anchorX, 8);
    }
  });

  it("preserves fractional scroll positions and cancels pending motion", () => {
    const camera = new HorizontalCamera();

    camera.panBy(100);
    camera.advance(1 / 60);
    camera.setScrollLeftImmediate(10.25);

    expect(camera.state.scrollLeft).toBe(10.25);
    expect(camera.targetState.scrollLeft).toBe(10.25);
    expect(camera.isAnimating).toBe(false);
  });

  it("snaps to the exact target on settling", () => {
    const camera = new HorizontalCamera();

    camera.panBy(100);
    for (let i = 0; i < 120; i++) {
      camera.advance(1 / 60);
    }

    expect(camera.state.scrollLeft).toBe(100);
    expect(camera.isAnimating).toBe(false);
    expect(camera.advance(1 / 60)).toBe(false);
  });

  it("uses configurable damping", () => {
    const fast = new HorizontalCamera({ panDamping: 30 });
    const slow = new HorizontalCamera({ panDamping: 5 });

    fast.panBy(100);
    slow.panBy(100);
    fast.advance(1 / 60);
    slow.advance(1 / 60);

    expect(fast.state.scrollLeft).toBeGreaterThan(slow.state.scrollLeft);
  });

  it("uses frame-rate-independent damping", () => {
    const at60Hz = new HorizontalCamera();
    const at120Hz = new HorizontalCamera();

    at60Hz.panBy(100);
    at120Hz.panBy(100);

    for (let i = 0; i < 30; i++) at60Hz.advance(1 / 60);
    for (let i = 0; i < 60; i++) at120Hz.advance(1 / 120);

    expect(at60Hz.state.scrollLeft).toBeCloseTo(
      at120Hz.state.scrollLeft, 9,
    );
  });

  it("handles repeated zoom events and rapid reversal", () => {
    const camera = new HorizontalCamera();
    const anchorX = 135;
    const anchorTick = camera.xToTick(anchorX);

    camera.zoomAt(anchorX, 1.8);
    camera.advance(1 / 120);
    camera.zoomAt(anchorX, 1.2);
    camera.advance(1 / 120);
    camera.zoomAt(anchorX, 0.6);

    for (let i = 0; i < 80; i++) {
      camera.advance(1 / 120);
      expect(camera.tickToX(anchorTick)).toBeCloseTo(anchorX, 8);
    }

    expect(camera.isAnimating).toBe(false);
  });

  it("clamps zoom to configured limits", () => {
    const camera = new HorizontalCamera();

    camera.zoomAt(0, 1000);
    expect(camera.targetState.pixelsPerTick).toBeCloseTo(320 / 480);

    camera.zoomAt(0, 0.0001);
    expect(camera.targetState.pixelsPerTick).toBeCloseTo(24 / 480);
  });

  it("rejects invalid configuration and nonfinite input", () => {
    expect(() => new HorizontalCamera({ pixelsPerTick: 0 })).toThrow();
    expect(() => new HorizontalCamera({ panDamping: 0 })).toThrow();
    expect(() => new HorizontalCamera({
      minPixelsPerTick: 2,
      maxPixelsPerTick: 1,
    })).toThrow();

    const camera = new HorizontalCamera();
    expect(() => camera.panBy(Infinity)).toThrow();
    expect(() => camera.zoomAt(0, 0)).toThrow();
    expect(() => camera.zoomAt(NaN, 2)).toThrow();
    expect(() => camera.advance(NaN)).toThrow();
  });

  it("clamps pan targets to both timeline boundaries", () => {
    const camera = new HorizontalCamera();
    // 16 quarter notes of content at 24 px per quarter = 384 CSS px.
    camera.setBounds(480 * 16, 300);

    camera.panBy(100_000);
    expect(camera.targetState.scrollLeft).toBe(84);

    for (let i = 0; i < 120; i++) {
      camera.advance(1 / 60);
      expect(camera.state.scrollLeft).toBeGreaterThanOrEqual(0);
      expect(camera.state.scrollLeft).toBeLessThanOrEqual(84);
    }
    expect(camera.state.scrollLeft).toBe(84);

    camera.panBy(-100_000);
    expect(camera.targetState.scrollLeft).toBe(0);
    for (let i = 0; i < 120; i++) {
      camera.advance(1 / 60);
      expect(camera.state.scrollLeft).toBeGreaterThanOrEqual(0);
    }
    expect(camera.state.scrollLeft).toBe(0);
  });

  it("clamps native scrolling immediately when bounds are set", () => {
    const camera = new HorizontalCamera();
    camera.setBounds(480 * 16, 300);

    camera.setScrollLeftImmediate(100_000);
    expect(camera.state.scrollLeft).toBe(84);

    camera.setScrollLeftImmediate(-100);
    expect(camera.state.scrollLeft).toBe(0);
  });

  it("stays within bounds throughout cursor-anchored zoom", () => {
    const camera = new HorizontalCamera();
    const lengthTicks = 480 * 16;
    const viewportWidth = 300;
    camera.setBounds(lengthTicks, viewportWidth);
    camera.setScrollLeftImmediate(84);

    camera.zoomAt(250, 2);
    for (let i = 0; i < 120; i++) {
      camera.advance(1 / 60);
      const { scrollLeft, pixelsPerTick } = camera.state;
      const max = Math.max(
        0,
        lengthTicks * pixelsPerTick - viewportWidth,
      );
      expect(scrollLeft).toBeGreaterThanOrEqual(0);
      expect(scrollLeft).toBeLessThanOrEqual(max + 1e-8);
    }

    camera.zoomAt(250, 0.5);
    for (let i = 0; i < 120; i++) {
      camera.advance(1 / 60);
      const { scrollLeft, pixelsPerTick } = camera.state;
      expect(scrollLeft).toBeGreaterThanOrEqual(0);
      expect(scrollLeft).toBeLessThanOrEqual(
        Math.max(0, lengthTicks * pixelsPerTick - viewportWidth) + 1e-8,
      );
    }
  });

  it("reclamps current and target on viewport resizing or timeline shortening", () => {
    const camera = new HorizontalCamera();
    camera.setBounds(480 * 16, 300);
    camera.setScrollLeftImmediate(84);
    camera.panBy(-20);

    camera.setBounds(480 * 16, 500);
    expect(camera.state.scrollLeft).toBe(0);
    expect(camera.targetState.scrollLeft).toBe(0);

    camera.setBounds(480 * 16, 300);
    camera.setScrollLeftImmediate(84);
    camera.setBounds(480 * 8, 300);
    expect(camera.state.scrollLeft).toBe(0);
    expect(camera.targetState.scrollLeft).toBe(0);
  });

  it("rejects invalid viewport bounds", () => {
    const camera = new HorizontalCamera();

    expect(() => camera.setBounds(-1, 400)).toThrow();
    expect(() => camera.setBounds(480, -1)).toThrow();
    expect(() => camera.setBounds(Infinity, 400)).toThrow();
    expect(() => camera.setBounds(480, NaN)).toThrow();
  });

  it("does not access a DOM or start its own animation", () => {
    const camera = new HorizontalCamera();
    expect(camera.advance(1 / 60)).toBe(false);
    expect(camera.state).toEqual(camera.targetState);
  });
});
