import {
  TICKS_PER_QUARTER_NOTE,
  type Tick,
} from "@music-editor/core";

export interface HorizontalCameraOptions {
  pixelsPerTick?: number;
  minPixelsPerTick?: number;
  maxPixelsPerTick?: number;
  zoomDamping?: number;
  panDamping?: number;
}

export interface HorizontalCameraState {
  readonly pixelsPerTick: number;
  readonly scrollLeft: number;
}

interface ZoomAnchor {
  readonly tick: Tick;
  readonly screenX: number;
}

// Defaults preserve the old piano-roll prototype's horizontal camera feel.
const DEFAULT_SCALE = 24 / TICKS_PER_QUARTER_NOTE;
const DEFAULT_MAX_SCALE = 320 / TICKS_PER_QUARTER_NOTE;
const SCALE_TOLERANCE = 0.02 / TICKS_PER_QUARTER_NOTE;
const SCROLL_TOLERANCE = 0.1;

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
  return value;
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be positive`);
  }
  return value;
}

function damp(
  current: number,
  target: number,
  damping: number,
  deltaSeconds: number,
): number {
  return target +
    (current - target) * Math.exp(-damping * deltaSeconds);
}

/**
 * Horizontal musical coordinates and motion, independent of the DOM.
 *
 * A future renderer-owned scheduler calls advance(elapsedSeconds).
 * All coordinates are viewport-local CSS pixels; ticks are never rounded.
 */
export class HorizontalCamera {
  private current: HorizontalCameraState;
  private target: HorizontalCameraState;
  private anchor: ZoomAnchor | null = null;

  readonly minPixelsPerTick: number;
  readonly maxPixelsPerTick: number;
  readonly zoomDamping: number;
  readonly panDamping: number;

  constructor(options: HorizontalCameraOptions = {}) {
    this.minPixelsPerTick =
      options.minPixelsPerTick ?? DEFAULT_SCALE;
    this.maxPixelsPerTick =
      options.maxPixelsPerTick ?? DEFAULT_MAX_SCALE;

    this.zoomDamping = options.zoomDamping ?? 20;
    this.panDamping = options.panDamping ?? 12;

    positive(this.minPixelsPerTick, "minPixelsPerTick");
    positive(this.maxPixelsPerTick, "maxPixelsPerTick");
    positive(this.zoomDamping, "zoomDamping");
    positive(this.panDamping, "panDamping");

    if (this.minPixelsPerTick > this.maxPixelsPerTick) {
      throw new RangeError("Invalid zoom range");
    }

    const scale = options.pixelsPerTick ?? DEFAULT_SCALE;

    if (
      !Number.isFinite(scale) ||
      scale < this.minPixelsPerTick ||
      scale > this.maxPixelsPerTick
    ) {
      throw new RangeError("Initial zoom is outside limits");
    }

    this.current = {
      pixelsPerTick: scale,
      scrollLeft: 0,
    };
    this.target = { ...this.current };
  }

  get state(): HorizontalCameraState {
    return { ...this.current };
  }

  get targetState(): HorizontalCameraState {
    return { ...this.target };
  }

  get isAnimating(): boolean {
    // Use exact state equality here, not the settling tolerance.
    // Otherwise an almost-settled camera can stop without snapping
    // to its target, leaving the final state slightly incorrect.
    return (
      this.current.pixelsPerTick !== this.target.pixelsPerTick ||
      this.current.scrollLeft !== this.target.scrollLeft
    );
  }

  tickToX(tick: Tick): number {
    return finite(
      finite(tick, "tick") * this.current.pixelsPerTick -
        this.current.scrollLeft,
      "screenX",
    );
  }

  xToTick(screenX: number): Tick {
    return finite(
      (finite(screenX, "screenX") + this.current.scrollLeft) /
        this.current.pixelsPerTick,
      "tick",
    );
  }

  /** Request a smoothly animated horizontal pan (positive = move right). */
  panBy(deltaX: number): void {
    const nextScrollLeft = finite(
      this.target.scrollLeft + finite(deltaX, "deltaX"),
      "scrollLeft",
    );

    this.target = {
      ...this.target,
      scrollLeft: nextScrollLeft,
    };
    this.anchor = null;
  }

  /** Apply native scrolling immediately and cancel pending camera motion. */
  setScrollLeftImmediate(scrollLeft: number): void {
    const nextScrollLeft = finite(scrollLeft, "scrollLeft");

    this.current = {
      ...this.current,
      scrollLeft: nextScrollLeft,
    };
    this.target = { ...this.current };
    this.anchor = null;
  }

  /** Request smooth zoom around a viewport-local screen coordinate. */
  zoomAt(screenX: number, factor: number): void {
    finite(screenX, "screenX");
    positive(factor, "factor");

    const nextScale = Math.max(
      this.minPixelsPerTick,
      Math.min(
        this.maxPixelsPerTick,
        this.target.pixelsPerTick * factor,
      ),
    );

    if (nextScale === this.target.pixelsPerTick) return;

    // Capture from the visible camera, not its animation target.
    // This also handles repeated pinch events while zooming.
    const tick = this.xToTick(screenX);
    const nextScrollLeft = finite(
      tick * nextScale - screenX,
      "scrollLeft",
    );

    this.anchor = { tick, screenX };
    this.target = {
      pixelsPerTick: nextScale,
      scrollLeft: nextScrollLeft,
    };
  }

  /**
   * Advance toward the target with time-based exponential damping.
   *
   * Returns true when the visible camera changes. The renderer scheduler,
   * not this class, owns requestAnimationFrame and resource disposal.
   */
  advance(deltaSeconds: number): boolean {
    const dt = Math.min(
      0.05,
      Math.max(0, finite(deltaSeconds, "deltaSeconds")),
    );

    if (dt === 0 || !this.isAnimating) return false;

    const scale = damp(
      this.current.pixelsPerTick,
      this.target.pixelsPerTick,
      this.zoomDamping,
      dt,
    );

    const scrollLeft = this.anchor
      ? this.anchor.tick * scale - this.anchor.screenX
      : damp(
          this.current.scrollLeft,
          this.target.scrollLeft,
          this.panDamping,
          dt,
        );

    const next: HorizontalCameraState = {
      pixelsPerTick: finite(scale, "pixelsPerTick"),
      scrollLeft: finite(scrollLeft, "scrollLeft"),
    };

    const settled =
      Math.abs(scale - this.target.pixelsPerTick) <= SCALE_TOLERANCE &&
      Math.abs(scrollLeft - this.target.scrollLeft) <= SCROLL_TOLERANCE;

    this.current = settled
      ? { ...this.target }
      : next;

    if (settled) this.anchor = null;

    return true;
  }
}
