import { describe, expect, it } from "vitest";
import { EditorWorkspace, ToolManager } from "@music-editor/core";
import { createRendererRuntime } from "./RendererRuntime";

describe("RendererRuntime", () => {
  it("uses the supplied core instances", () => {
    const workspace = new EditorWorkspace();
    const tools = new ToolManager();

    const renderer = createRendererRuntime({ workspace, tools });

    expect(renderer.workspace).toBe(workspace);
    expect(renderer.tools).toBe(tools);
    expect(renderer.isDisposed).toBe(false);

    renderer.dispose();
  });

  it("supports idempotent disposal", () => {
    const renderer = createRendererRuntime({
      workspace: new EditorWorkspace(),
      tools: new ToolManager(),
    });

    renderer.dispose();
    renderer.dispose();

    expect(renderer.isDisposed).toBe(true);
  });
});
