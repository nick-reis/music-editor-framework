import type {
  EditorWorkspace,
  Grid,
  GridContainer,
} from "@music-editor/core";

import {
  HorizontalCamera,
  type HorizontalCameraOptions,
} from "../camera/HorizontalCamera";
import { CanvasSurface } from "../canvas/CanvasSurface";
import { RenderScheduler } from "../scheduling/RenderScheduler";
import {
  drawRuler,
  drawTimingGrid,
  DEFAULT_TIMING_THEME,
  type TimingTheme,
} from "../rendering/timingGrid";

export interface MountGridContainerOptions {
  readonly container: GridContainer;
  readonly ruler: HTMLCanvasElement;
  readonly motion?: HorizontalCameraOptions;
  readonly theme?: Partial<TimingTheme>;
}

export interface GridSurfaceOptions {
  readonly rowHeight?: number;
}

interface MountedGrid {
  readonly grid: Grid;
  readonly surface: CanvasSurface;
  readonly rowHeight: number;
}

/**
 * A visual session for one core GridContainer.
 *
 * The host owns layout and element lifecycles; this view owns exactly one
 * horizontal camera, its mounted canvas resources and core subscriptions.
 */
export class GridContainerView {
  private readonly camera: HorizontalCamera;
  private readonly ruler: CanvasSurface;
  private readonly grids = new Map<string, MountedGrid>();
  private readonly theme: TimingTheme;

  private readonly unsubscribeCore: () => void;
  private readonly unregisterFrame: () => void;

  private dirty = true;
  private disposed = false;

  constructor(
    private readonly workspace: EditorWorkspace,
    private readonly scheduler: RenderScheduler,
    private readonly options: MountGridContainerOptions,
    private readonly onDispose: () => void,
  ) {
    if (options.container.workspace !== workspace) {
      throw new Error("Container belongs to another workspace");
    }

    // The prototype's default is 24 CSS px per quarter note. Use the
    // project's tick resolution rather than assuming the core default.
    const ticksPerQuarter = workspace.timeline.ticksPerQuarter;
    this.camera = new HorizontalCamera({
      pixelsPerTick: 24 / ticksPerQuarter,
      minPixelsPerTick: 24 / ticksPerQuarter,
      maxPixelsPerTick: 320 / ticksPerQuarter,
      ...options.motion,
    });
    this.theme = {
      ...DEFAULT_TIMING_THEME,
      ...options.theme,
    };

    this.ruler = new CanvasSurface(
      options.ruler,
      () => this.markDirty(),
    );
    this.updateCameraBounds();

    this.unsubscribeCore = workspace.onChange((changes) => {
      for (const change of changes) {
        if (
          change.type === "container-removed" &&
          change.containerId === options.container.id
        ) {
          this.dispose();
          return;
        }

        if (
          change.type === "timeline-changed" ||
          (change.type === "container-changed" &&
           change.containerId === options.container.id)
        ) {
          this.markDirty();
          return;
        }
      }
    });

    this.unregisterFrame = scheduler.register(({ deltaSeconds }) => {
      this.updateCameraBounds();
      const changed = this.camera.advance(deltaSeconds);
      if (changed || this.dirty) {
        this.dirty = false;
        this.paint();
      }

      return this.camera.isAnimating;
    });
  }

  attachGrid(
    grid: Grid,
    canvas: HTMLCanvasElement,
    options: GridSurfaceOptions = {},
  ): () => void {
    if (this.disposed) {
      throw new Error("Container view is disposed");
    }
    if (grid.container !== this.options.container) {
      throw new Error("Grid belongs to another container");
    }
    if (this.grids.has(grid.id)) {
      throw new Error("Grid " + grid.id + " is already mounted");
    }

    const rowHeight = options.rowHeight ?? 20;
    if (!Number.isFinite(rowHeight) || rowHeight <= 0) {
      throw new RangeError("Invalid row height");
    }

    const binding: MountedGrid = {
      grid,
      rowHeight,
      surface: new CanvasSurface(canvas, () => this.markDirty()),
    };

    this.grids.set(grid.id, binding);
    this.markDirty();

    return () => {
      if (this.grids.get(grid.id) !== binding) return;

      this.grids.delete(grid.id);
      binding.surface.dispose();
      this.markDirty();
    };
  }

  panBy(deltaX: number): void {
    if (this.disposed) return;
    this.updateCameraBounds();
    this.camera.panBy(deltaX);
    this.markDirty();
  }

  zoomAt(screenX: number, factor: number): void {
    if (this.disposed) return;
    this.updateCameraBounds();
    this.camera.zoomAt(screenX, factor);
    this.markDirty();
  }

  private updateCameraBounds(): void {
    this.camera.setBounds(
      this.workspace.timeline.lengthTicks,
      this.ruler.size.width,
    );
  }

  private markDirty(): void {
    if (this.disposed) return;
    this.dirty = true;
    this.scheduler.invalidate();
  }

  private paint(): void {
    const timeline = this.workspace.timeline;

    this.ruler.paint((ctx, viewport) => {
      drawRuler(ctx, viewport, timeline, this.camera, this.theme);
    });

    for (const { grid, surface, rowHeight } of this.grids.values()) {
      if (grid.container !== this.options.container) continue;

      surface.paint((ctx, viewport) => {
        drawTimingGrid(
          ctx,
          viewport,
          timeline,
          this.camera,
          grid.rowCount,
          rowHeight,
          this.theme,
        );
      });
    }
  }

  /** Detach this view without changing the core model. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.unsubscribeCore();
    this.unregisterFrame();

    for (const binding of this.grids.values()) {
      binding.surface.dispose();
    }
    this.grids.clear();
    this.ruler.dispose();
    this.onDispose();
  }
}
