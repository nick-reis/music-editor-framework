import { describe, expect, it } from "vitest";
import { ToolId } from "../tools/ToolId";
import { ToolManager } from "./ToolManager";

const grid = (
  supportedTools: ToolId[],
  toolFallbacks: Partial<Record<ToolId, ToolId>> = {},
) => ({
  supportedTools: new Set(supportedTools),
  toolFallbacks,
});

describe("ToolManager", () => {
  it("defaults to Pointer", () => {
    expect(new ToolManager().selectedTool).toBe(ToolId.Pointer);
  });

  it("allows changing the globally selected tool", () => {
    const manager = new ToolManager();

    manager.setSelectedTool(ToolId.Brush);

    expect(manager.selectedTool).toBe(ToolId.Brush);
  });

  it("returns the selected tool when the grid supports it", () => {
    const manager = new ToolManager(ToolId.Brush);

    expect(manager.getEffectiveTool(grid([ToolId.Pointer, ToolId.Brush]))).toBe(
      ToolId.Brush,
    );
  });

  it("uses a grid's declared fallback when necessary", () => {
    const manager = new ToolManager(ToolId.Brush);

    expect(
      manager.getEffectiveTool(
        grid([ToolId.Pointer], { [ToolId.Brush]: ToolId.Pointer }),
      ),
    ).toBe(ToolId.Pointer);
  });

  it("never modifies the global selection when applying fallbacks", () => {
    const manager = new ToolManager(ToolId.Brush);

    manager.getEffectiveTool(
      grid([ToolId.Pointer], { [ToolId.Brush]: ToolId.Pointer }),
    );

    expect(manager.selectedTool).toBe(ToolId.Brush);
  });

  it("returns null when no supported tool or valid fallback exists", () => {
    const manager = new ToolManager(ToolId.Brush);

    expect(manager.getEffectiveTool(grid([ToolId.Eraser]))).toBeNull();
    expect(
      manager.getEffectiveTool(
        grid([ToolId.Eraser], { [ToolId.Brush]: ToolId.Pointer }),
      ),
    ).toBeNull();
  });

  it("restores the original effective tool when moving between grids", () => {
    const manager = new ToolManager(ToolId.Brush);
    const brushGrid = grid([ToolId.Pointer, ToolId.Brush]);
    const fallbackGrid = grid([ToolId.Pointer], {
      [ToolId.Brush]: ToolId.Pointer,
    });

    expect(manager.getEffectiveTool(brushGrid)).toBe(ToolId.Brush);
    expect(manager.getEffectiveTool(fallbackGrid)).toBe(ToolId.Pointer);
    expect(manager.getEffectiveTool(brushGrid)).toBe(ToolId.Brush);
    expect(manager.selectedTool).toBe(ToolId.Brush);
  });
});
