import { ChangeEmitter } from "../events/ChangeEmitter";
import type { ChangeListener, Unsubscribe } from "../events/ChangeEmitter";
import type { ToolChange } from "../events/ModelChange";

import { ToolId } from "../tools/ToolId";
import type { Grid } from "../grids/Grid";

type ToolTarget = Pick<Grid, "supportedTools" | "toolFallbacks">;

export class ToolManager {
  private _selectedTool: ToolId;

  private readonly changes = new ChangeEmitter<ToolChange>();

  constructor(initialTool: ToolId = ToolId.Pointer) {
    this._selectedTool = initialTool;
  }

  onChange(listener: ChangeListener<ToolChange>): Unsubscribe {
    return this.changes.subscribe(listener);
  }

  get selectedTool(): ToolId {
    return this._selectedTool;
  }

  setSelectedTool(tool: ToolId): void {
    if (this._selectedTool === tool) return;

    const previousTool = this._selectedTool;
    this._selectedTool = tool;

    this.changes.emit({
      previousTool,
      selectedTool: tool,
    });
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
