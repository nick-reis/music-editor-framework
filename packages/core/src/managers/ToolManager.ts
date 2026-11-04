import { ToolId } from "../tools/ToolId";
import type { Grid } from "../grids/Grid";

type ToolTarget = Pick<Grid, "supportedTools" | "toolFallbacks">;

export class ToolManager {
  private _selectedTool: ToolId;

  constructor(initialTool: ToolId = ToolId.Pointer) {
    this._selectedTool = initialTool;
  }

  get selectedTool(): ToolId {
    return this._selectedTool;
  }

  setSelectedTool(tool: ToolId): void {
    this._selectedTool = tool;
  }

  getEffectiveTool(grid: ToolTarget | null = null): ToolId | null {
    if (!grid) {
      return this._selectedTool;
    }

    if (grid.supportedTools.has(this._selectedTool)) {
      return this._selectedTool;
    }

    const fallback = grid.toolFallbacks[this._selectedTool];

    if (fallback && grid.supportedTools.has(fallback)) {
      return fallback;
    }

    return null;
  }
}
