import { describe, expect, it, vi } from "vitest";
import { Timeline } from "@music-editor/core";
import { HorizontalCamera } from "../camera/HorizontalCamera";
import {
  drawRuler,
  drawTimingGrid,
  projectTimingLines,
} from "./timingGrid";

describe("musical timing projection", () => {
  it("projects bars and beats against the same camera", () => {
    const timeline = new Timeline();
    const camera = new HorizontalCamera();

    const lines = projectTimingLines(timeline, camera, 250);
    expect(lines.find((line) =>
      line.kind === "bar" && line.barNumber === 1
    )?.x).toBe(0);
    expect(lines.find((line) =>
      line.kind === "bar" && line.barNumber === 2
    )?.x).toBe(96);
    expect(lines.find((line) =>
      line.kind === "beat" && line.tick === 480
    )?.x).toBe(24);
  });

  it("uses the actual project's meter", () => {
    const timeline = new Timeline({ timeSignature: [3, 4] });
    const camera = new HorizontalCamera();
    const lines = projectTimingLines(timeline, camera, 250);
    const secondBar = lines.find((line) =>
      line.kind === "bar" && line.barNumber === 2
    );

    expect(secondBar?.tick).toBe(1440);
    expect(secondBar?.x).toBe(72);
  });

  it("responds to the visible scroll offset", () => {
    const timeline = new Timeline();
    const camera = new HorizontalCamera();
    camera.setScrollLeftImmediate(48);

    const secondBar = projectTimingLines(timeline, camera, 250)
      .find((line) => line.kind === "bar" && line.barNumber === 2);

    expect(secondBar?.x).toBe(48);
  });

  it("does not project beyond the bounded project timeline", () => {
    const timeline = new Timeline({ length: { bars: 1 } });
    const camera = new HorizontalCamera();

    const lines = projectTimingLines(timeline, camera, 800);
    expect(lines.every((line) => line.tick <= timeline.lengthTicks))
      .toBe(true);

    camera.setScrollLeftImmediate(100_000);
    expect(projectTimingLines(timeline, camera, 800)).toEqual([]);
  });

  it("skips nonvisible and invalid viewport sizes", () => {
    const timeline = new Timeline();
    const camera = new HorizontalCamera();

    expect(projectTimingLines(timeline, camera, 0)).toEqual([]);
    expect(projectTimingLines(timeline, camera, NaN)).toEqual([]);
  });

  it("draws ruler and grid vertical lines at the same X positions", () => {
    const timeline = new Timeline();
    const camera = new HorizontalCamera();
    const rulerContext = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
    };
    const gridContext = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    };

    drawRuler(
      rulerContext as unknown as CanvasRenderingContext2D,
      { width: 250, height: 28, pixelRatio: 1 },
      timeline,
      camera,
    );
    drawTimingGrid(
      gridContext as unknown as CanvasRenderingContext2D,
      { width: 250, height: 40, pixelRatio: 1 },
      timeline,
      camera,
      2,
      20,
    );

    const rulerXs = rulerContext.moveTo.mock.calls
      .map((call) => call[0]);
    // Two horizontal row boundaries precede the musical timing lines.
    const gridXs = gridContext.moveTo.mock.calls
      .slice(2)
      .map((call) => call[0]);

    expect(gridXs).toEqual(rulerXs);
    expect(rulerXs).toContain(96.5);
  });
});
