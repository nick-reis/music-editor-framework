import { describe, expect, it, vi } from "vitest";
import { ToolId } from "../tools/ToolId";
import { ToolManager } from "./ToolManager";

describe("ToolManager", () => {
  const grid = (
    supportedTools: ToolId[],
    toolFallbacks: Partial<Record<ToolId, ToolId>> = {},
  ) => ({
    supportedTools: new Set(supportedTools),
    toolFallbacks,
  });

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

describe("ToolManager change notifications", () => {
  const midiGrid = {
    supportedTools: new Set([
      ToolId.Pointer,
      ToolId.Brush,
      ToolId.Eraser,
    ]),
    toolFallbacks: {},
  };

  const audioGrid = {
    supportedTools: new Set([
      ToolId.Pointer,
      ToolId.Eraser,
    ]),
    toolFallbacks: {
      [ToolId.Brush]: ToolId.Pointer,
    },
  };

  const restrictedGrid = {
    supportedTools: new Set([ToolId.Eraser]),
    toolFallbacks: {},
  };

  it("starts with Pointer by default", () => {
    const tools = new ToolManager();

    expect(tools.selectedTool).toBe(ToolId.Pointer);
  });

  it("accepts a custom initial tool", () => {
    const tools = new ToolManager(ToolId.Brush);

    expect(tools.selectedTool).toBe(ToolId.Brush);
  });

  it("notifies listeners when the selected tool changes", () => {
    const tools = new ToolManager(ToolId.Pointer);
    const listener = vi.fn();

    tools.onChange(listener);
    tools.setSelectedTool(ToolId.Brush);

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      previousTool: ToolId.Pointer,
      selectedTool: ToolId.Brush,
    });

    expect(tools.selectedTool).toBe(ToolId.Brush);
  });

  it("does not notify when selecting the same tool", () => {
    const tools = new ToolManager(ToolId.Brush);
    const listener = vi.fn();

    tools.onChange(listener);
    tools.setSelectedTool(ToolId.Brush);

    expect(listener).not.toHaveBeenCalled();
  });

  it("resolves supported tools without changing selection", () => {
    const tools = new ToolManager(ToolId.Brush);
    const listener = vi.fn();

    tools.onChange(listener);

    expect(tools.getEffectiveTool(midiGrid)).toBe(
      ToolId.Brush,
    );

    expect(tools.selectedTool).toBe(ToolId.Brush);
    expect(listener).not.toHaveBeenCalled();
  });

  it("uses a fallback without overwriting the global tool", () => {
    const tools = new ToolManager(ToolId.Brush);
    const listener = vi.fn();

    tools.onChange(listener);

    expect(tools.getEffectiveTool(audioGrid)).toBe(
      ToolId.Pointer,
    );

    expect(tools.selectedTool).toBe(ToolId.Brush);
    expect(listener).not.toHaveBeenCalled();
  });

  it("restores the selected tool when returning to a compatible grid", () => {
    const tools = new ToolManager(ToolId.Brush);
    const listener = vi.fn();

    tools.onChange(listener);

    expect(tools.getEffectiveTool(midiGrid)).toBe(
      ToolId.Brush,
    );

    expect(tools.getEffectiveTool(audioGrid)).toBe(
      ToolId.Pointer,
    );

    expect(tools.getEffectiveTool(midiGrid)).toBe(
      ToolId.Brush,
    );

    expect(tools.selectedTool).toBe(ToolId.Brush);
    expect(listener).not.toHaveBeenCalled();
  });

  it("returns null when no supported tool or fallback exists", () => {
    const tools = new ToolManager(ToolId.Brush);

    expect(tools.getEffectiveTool(restrictedGrid)).toBe(
      null,
    );

    expect(tools.selectedTool).toBe(ToolId.Brush);
  });

  it("returns the global selection when no grid is provided", () => {
    const tools = new ToolManager(ToolId.Eraser);

    expect(tools.getEffectiveTool()).toBe(ToolId.Eraser);
    expect(tools.getEffectiveTool(null)).toBe(ToolId.Eraser);
  });

  it("does not use a fallback unsupported by the grid", () => {
    const tools = new ToolManager(ToolId.Brush);

    const invalidFallbackGrid = {
      supportedTools: new Set([ToolId.Eraser]),
      toolFallbacks: {
        [ToolId.Brush]: ToolId.Pointer,
      },
    };

    expect(
      tools.getEffectiveTool(invalidFallbackGrid),
    ).toBe(null);
  });

  it("allows listeners to unsubscribe", () => {
    const tools = new ToolManager();
    const listener = vi.fn();

    const unsubscribe = tools.onChange(listener);

    tools.setSelectedTool(ToolId.Brush);
    unsubscribe();
    tools.setSelectedTool(ToolId.Eraser);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("notifies multiple listeners independently", () => {
    const tools = new ToolManager();
    const firstListener = vi.fn();
    const secondListener = vi.fn();

    const unsubscribe = tools.onChange(firstListener);
    tools.onChange(secondListener);

    tools.setSelectedTool(ToolId.Brush);
    unsubscribe();
    tools.setSelectedTool(ToolId.Eraser);

    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(2);
  });
});
