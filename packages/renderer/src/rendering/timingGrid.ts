import type { Timeline } from "@music-editor/core";
import type { HorizontalCamera } from "../camera/HorizontalCamera";
import type { CanvasViewport } from "../canvas/CanvasSurface";

export interface TimingLine {
  readonly tick: number;
  readonly x: number;
  readonly kind: "bar" | "beat";
  readonly barNumber?: number;
}

export interface TimingTheme {
  readonly ruler: string;
  readonly background: string;
  readonly alternateRow: string;
  readonly barLine: string;
  readonly beatLine: string;
  readonly rowLine: string;
  readonly text: string;
}

/** The original piano-roll's dark palette is the starting visual theme. */
export const DEFAULT_TIMING_THEME: TimingTheme = {
  ruler: "#27272a",
  background: "#18181b",
  alternateRow: "#202024",
  barLine: "rgba(244,244,245,0.22)",
  beatLine: "rgba(244,244,245,0.05)",
  rowLine: "rgba(244,244,245,0.08)",
  text: "#a1a1aa",
};

/**
 * Project visible beats and bars using one container-local camera.
 * The same projection is reused by the ruler and every grid canvas.
 */
export function projectTimingLines(
  timeline: Timeline,
  camera: HorizontalCamera,
  width: number,
): TimingLine[] {
  if (!Number.isFinite(width) || width <= 0) return [];

  const [beatsPerBar, denominator] = timeline.timeSignature;
  const beatTicks = timeline.ticksPerQuarter * 4 / denominator;
  const barTicks = beatTicks * beatsPerBar;
  const start = Math.max(0, camera.xToTick(0));
  const end = Math.min(timeline.lengthTicks, camera.xToTick(width));

  if (end < start) return [];

  const scale = camera.state.pixelsPerTick;
  const barPixels = barTicks * scale;
  const beatPixels = beatTicks * scale;
  const lines: TimingLine[] = [];

  let barStep = 1;
  while (barPixels * barStep < 8) barStep *= 2;

  const firstBar =
    Math.ceil(start / barTicks / barStep) * barStep;

  for (
    let bar = firstBar;
    bar * barTicks <= end;
    bar += barStep
  ) {
    const tick = bar * barTicks;
    lines.push({
      tick,
      x: camera.tickToX(tick),
      kind: "bar",
      barNumber: bar + 1,
    });
  }

  // At low zoom, individual beat lines are too dense to be useful.
  if (beatPixels >= 10) {
    const firstBeat = Math.ceil(start / beatTicks);
    const lastBeat = Math.floor(end / beatTicks);

    for (let beat = firstBeat; beat <= lastBeat; beat++) {
      if (beat % beatsPerBar === 0) continue;

      const tick = beat * beatTicks;
      lines.push({
        tick,
        x: camera.tickToX(tick),
        kind: "beat",
      });
    }
  }

  return lines.sort((a, b) => a.x - b.x);
}

function crisp(value: number): number {
  return Math.round(value) + 0.5;
}

export function drawRuler(
  ctx: CanvasRenderingContext2D,
  viewport: CanvasViewport,
  timeline: Timeline,
  camera: HorizontalCamera,
  theme: TimingTheme = DEFAULT_TIMING_THEME,
): void {
  const { width, height } = viewport;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.ruler;
  ctx.fillRect(0, 0, width, height);

  const [beatsPerBar, denominator] = timeline.timeSignature;
  const barTicks =
    timeline.ticksPerQuarter * 4 / denominator * beatsPerBar;

  const barWidth = barTicks * camera.state.pixelsPerTick;
  let labelStep = 1;
  while (barWidth * labelStep < 48) labelStep *= 2;

  ctx.font = "500 11px system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.lineWidth = 1;

  for (const line of projectTimingLines(timeline, camera, width)) {
    const isBar = line.kind === "bar";
    const x = crisp(line.x);

    ctx.strokeStyle = isBar ? theme.barLine : theme.beatLine;
    ctx.beginPath();
    ctx.moveTo(x, isBar ? 0 : height - 8);
    ctx.lineTo(x, height);
    ctx.stroke();

    if (
      isBar &&
      line.barNumber !== undefined &&
      (line.barNumber - 1) % labelStep === 0
    ) {
      ctx.fillStyle = theme.text;
      ctx.fillText(String(line.barNumber), x + 4, 4);
    }
  }
}

export function drawTimingGrid(
  ctx: CanvasRenderingContext2D,
  viewport: CanvasViewport,
  timeline: Timeline,
  camera: HorizontalCamera,
  rowCount: number,
  rowHeight: number,
  theme: TimingTheme = DEFAULT_TIMING_THEME,
): void {
  const { width, height } = viewport;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  const visibleRows = Math.min(rowCount, Math.ceil(height / rowHeight));
  for (let row = 0; row < visibleRows; row++) {
    const y = row * rowHeight;
    if (row % 2 !== 0) {
      ctx.fillStyle = theme.alternateRow;
      ctx.fillRect(0, y, width, rowHeight);
    }

    ctx.strokeStyle = theme.rowLine;
    ctx.beginPath();
    ctx.moveTo(0, crisp(y + rowHeight));
    ctx.lineTo(width, crisp(y + rowHeight));
    ctx.stroke();
  }

  ctx.lineWidth = 1;
  for (const line of projectTimingLines(timeline, camera, width)) {
    const x = crisp(line.x);
    ctx.strokeStyle = line.kind === "bar"
      ? theme.barLine
      : theme.beatLine;

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
}
