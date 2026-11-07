import {
  createRendererRuntime,
} from "@music-editor/renderer";

import type {
  RendererRuntime,
  RendererRuntimeOptions,
} from "@music-editor/renderer";

import type {
  EditorWorkspace,
  ToolManager,
} from "@music-editor/core";

function consumerContract(
  workspace: EditorWorkspace,
  tools: ToolManager,
): void {
  const options: RendererRuntimeOptions = {
    workspace,
    tools,
  };

  const renderer: RendererRuntime =
    createRendererRuntime(options);

  renderer.dispose();

  // @ts-expect-error tools is required
  createRendererRuntime({ workspace });
}

void consumerContract;
