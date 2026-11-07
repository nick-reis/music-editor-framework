import {
  createRendererRuntime,
} from "@music-editor/renderer";

import type {
  RendererRuntime,
  RendererRuntimeOptions,
  GridContainerView,
} from "@music-editor/renderer";

import type {
  EditorWorkspace,
  Grid,
  GridContainer,
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


function rendererMountContract(
  renderer: RendererRuntime,
  container: GridContainer,
  grid: Grid,
  ruler: HTMLCanvasElement,
  surface: HTMLCanvasElement,
): void {
  const view: GridContainerView = renderer.mountContainer({
    container,
    ruler,
    motion: { zoomDamping: 20, panDamping: 12 },
  });

  const detach = view.attachGrid(grid, surface, { rowHeight: 20 });
  view.panBy(100);
  view.zoomAt(200, 1.5);
  detach();
  view.dispose();

  // @ts-expect-error rowHeight must be numeric
  view.attachGrid(grid, surface, { rowHeight: "20" });
}

void rendererMountContract;
