import type { ToolId } from "../tools/ToolId";
import type { ElementId, GridContainerId, GridId } from "../types/ids";
import type { BPM } from "../types/time";

export interface ElementState {
  row: number;
  startTick: number;
  durationTicks: number;
  locked: boolean;
}

export type ChangedProperties<TState> = readonly Extract<
  keyof TState,
  string
>[];

export type ElementChange<TState extends ElementState = ElementState> = {
  readonly elementId: ElementId;
  readonly properties: ChangedProperties<TState>;
};

export type GridChange<TState extends ElementState = ElementState> =
  | {
      readonly type: "element-added";
      readonly elementId: ElementId;
    }
  | {
      readonly type: "element-removed";
      readonly elementId: ElementId;
    }
  | {
      readonly type: "element-updated";
      readonly elementId: ElementId;
      readonly properties: ChangedProperties<TState>;
    };

export type GridContainerChange =
  | {
      readonly type: "grid-added";
      readonly gridId: GridId;
    }
  | {
      readonly type: "grid-removed";
      readonly gridId: GridId;
    }
  | {
      readonly type: "grid-changed";
      readonly gridId: GridId;
      readonly change: GridChange;
    };

export type WorkspaceChange =
  | {
      readonly type: "container-added";
      readonly containerId: GridContainerId;
    }
  | {
      readonly type: "container-removed";
      readonly containerId: GridContainerId;
    }
  | {
      readonly type: "container-changed";
      readonly containerId: GridContainerId;
      readonly change: GridContainerChange;
    };

export type SelectionChange = {
  readonly addedIds: readonly ElementId[];
  readonly removedIds: readonly ElementId[];
};

export type ToolChange = {
  readonly previousTool: ToolId;
  readonly selectedTool: ToolId;
};

export type TimelineChange = {
  readonly previousBpm: BPM;
  readonly bpm: BPM;
};
