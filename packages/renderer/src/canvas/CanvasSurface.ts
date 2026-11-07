export interface CanvasViewport {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export type CanvasPainter = (
  context: CanvasRenderingContext2D,
  viewport: CanvasViewport,
) => void;

/**
 * Manages the backing resolution and context of a host-sized Canvas 2D.
 *
 * The host controls CSS sizing; this class never sets CSS width or height.
 * Paint functions receive CSS-pixel coordinates regardless of device DPR.
 */
export class CanvasSurface {
  private readonly context: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver | null;

  private viewport: CanvasViewport = {
    width: 0,
    height: 0,
    pixelRatio: 1,
  };

  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly invalidate: () => void,
  ) {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context unavailable");
    }

    this.context = context;
    this.observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => this.syncSize())
      : null;

    this.observer?.observe(canvas);
    this.syncSize();
  }

  /** Sync the backing bitmap with the host's CSS box and display DPR. */
  syncSize(): boolean {
    if (this.disposed) return false;

    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(
      0,
      Number.isFinite(bounds.width) ? bounds.width : 0,
    );
    const height = Math.max(
      0,
      Number.isFinite(bounds.height) ? bounds.height : 0,
    );

    const rawRatio = globalThis.devicePixelRatio ?? 1;
    const pixelRatio = Number.isFinite(rawRatio) && rawRatio > 0
      ? rawRatio
      : 1;

    const backingWidth = Math.round(width * pixelRatio);
    const backingHeight = Math.round(height * pixelRatio);

    const changed =
      this.viewport.width !== width ||
      this.viewport.height !== height ||
      this.viewport.pixelRatio !== pixelRatio ||
      this.canvas.width !== backingWidth ||
      this.canvas.height !== backingHeight;

    if (!changed) return false;

    // Changing a canvas backing dimension resets its drawing state.
    // Do so only when the bitmap dimensions actually need to change.
    if (this.canvas.width !== backingWidth) {
      this.canvas.width = backingWidth;
    }
    if (this.canvas.height !== backingHeight) {
      this.canvas.height = backingHeight;
    }

    this.viewport = { width, height, pixelRatio };
    this.invalidate();
    return true;
  }

  /** Paint in CSS pixels. The painter owns clearing its own content. */
  paint(painter: CanvasPainter): void {
    if (this.disposed) return;

    // Avoid a layout read on every animation frame. ResizeObserver updates
    // dimensions; checking DPR is cheap and handles a display change when
    // the next paint is requested. Without ResizeObserver, hosts can call
    // syncSize() explicitly when their CSS layout changes.
    const rawRatio = globalThis.devicePixelRatio ?? 1;
    const pixelRatio = Number.isFinite(rawRatio) && rawRatio > 0
      ? rawRatio
      : 1;
    if (pixelRatio !== this.viewport.pixelRatio) {
      this.syncSize();
    }

    const { width, height } = this.viewport;
    if (width <= 0 || height <= 0) return;

    this.context.save();
    try {
      this.context.setTransform(
        this.viewport.pixelRatio, 0,
        0, this.viewport.pixelRatio,
        0, 0,
      );
      painter(this.context, this.viewport);
    } finally {
      this.context.restore();
    }
  }

  /** Stop watching layout. Does not remove or resize the host's canvas. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.observer?.disconnect();
  }
}
