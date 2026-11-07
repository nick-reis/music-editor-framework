import type {
  EditorWorkspace,
  ToolManager,
} from "@music-editor/core";

export interface RendererRuntimeOptions {
  readonly workspace: EditorWorkspace;
  readonly tools: ToolManager;
}

/**
 * Coordinates rendering for one editor instance.
 *
 * Owns renderer resources, not document state.
 * No DOM access is performed during construction.
 */
export class RendererRuntime {
  readonly workspace: EditorWorkspace;
  readonly tools: ToolManager;

  private disposed = false;

  constructor(options: RendererRuntimeOptions) {
    this.workspace = options.workspace;
    this.tools = options.tools;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Releases renderer-owned resources without disposing core objects.
   */
  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
  }
}

export function createRendererRuntime(
  options: RendererRuntimeOptions,
): RendererRuntime {
  return new RendererRuntime(options);
}
