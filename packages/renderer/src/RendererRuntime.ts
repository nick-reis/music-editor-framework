import type {
  EditorWorkspace,
  ToolManager,
} from "@music-editor/core";

import { RenderScheduler } from "./scheduling/RenderScheduler";
import {
  GridContainerView,
  type MountGridContainerOptions,
} from "./views/GridContainerView";

export interface RendererRuntimeOptions {
  readonly workspace: EditorWorkspace;
  readonly tools: ToolManager;
}

/**
 * Renderer-owned lifecycle for one editor instance.
 * Core workspace and tools always remain owned by the caller.
 */
export class RendererRuntime {
  readonly workspace: EditorWorkspace;
  readonly tools: ToolManager;

  private readonly scheduler = new RenderScheduler();
  private readonly views = new Set<GridContainerView>();
  private disposed = false;

  constructor(options: RendererRuntimeOptions) {
    this.workspace = options.workspace;
    this.tools = options.tools;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  mountContainer(
    options: MountGridContainerOptions,
  ): GridContainerView {
    if (this.disposed) {
      throw new Error("RendererRuntime is disposed");
    }

    const view = new GridContainerView(
      this.workspace,
      this.scheduler,
      options,
      () => { this.views.delete(view); },
    );

    this.views.add(view);
    return view;
  }

  /** Release mounted resources without modifying the core workspace. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (const view of [...this.views]) {
      view.dispose();
    }
    this.scheduler.dispose();
  }
}

export function createRendererRuntime(
  options: RendererRuntimeOptions,
): RendererRuntime {
  return new RendererRuntime(options);
}
