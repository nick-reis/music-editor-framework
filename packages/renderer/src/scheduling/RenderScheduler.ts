export interface RenderFrame {
  readonly timeMs: number;
  readonly deltaSeconds: number;
}

/** Return true while the registered work needs another animation frame. */
export type FrameCallback = (frame: RenderFrame) => boolean;

/**
 * One on-demand requestAnimationFrame loop for a renderer instance.
 *
 * This class neither knows about canvas nor owns document/camera state.
 * It is safe to import without a browser; RAF is only accessed on use.
 */
export class RenderScheduler {
  private readonly callbacks = new Set<FrameCallback>();

  private frameId: number | null = null;
  private previousTime: number | null = null;
  private disposed = false;

  /** Register a frame task. Each registration has its own cleanup handle. */
  register(callback: FrameCallback): () => void {
    if (this.disposed) {
      throw new Error("RenderScheduler is disposed");
    }

    // Wrap the callback so registering the same function more than once
    // still produces independent subscriptions.
    const task: FrameCallback = (frame) => callback(frame);
    this.callbacks.add(task);
    this.invalidate();

    return () => {
      this.callbacks.delete(task);

      if (this.callbacks.size === 0) {
        this.cancelPending();
      }
    };
  }

  /** Coalesce any number of invalidations into one pending frame. */
  invalidate(): void {
    if (
      this.disposed ||
      this.frameId !== null ||
      this.callbacks.size === 0
    ) {
      return;
    }

    this.frameId = requestAnimationFrame(this.onFrame);
  }

  private readonly onFrame = (timeMs: number): void => {
    this.frameId = null;
    if (this.disposed) return;

    const deltaSeconds = this.previousTime === null
      ? 0
      : Math.min(
          0.05,
          Math.max(0, (timeMs - this.previousTime) / 1000),
        );

    this.previousTime = timeMs;
    let needsAnotherFrame = false;

    try {
      // Use a snapshot so callbacks may safely unregister during a frame.
      for (const task of [...this.callbacks]) {
        if (!this.callbacks.has(task)) continue;
        if (task({ timeMs, deltaSeconds })) {
          needsAnotherFrame = true;
        }
      }
    } finally {
      if (needsAnotherFrame) {
        this.invalidate();
      }
      // The next independent invalidation starts with a fresh clock.
      if (this.frameId === null) {
        this.previousTime = null;
      }
    }
  };

  private cancelPending(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    this.previousTime = null;
  }

  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.cancelPending();
    this.callbacks.clear();
  }
}
