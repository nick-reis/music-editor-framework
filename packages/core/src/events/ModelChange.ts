import type { EditableElement } from "../elements/EditableElement";
import type { ToolId } from "../tools/ToolId";
import type { ElementId, GridContainerId, GridId } from "../types/ids";
import type { BPM, Tick, TimeSignature } from "../types/time";

export interface ElementState {
  row: number;
  startTick: number;
  durationTicks: number;
  locked: boolean;
}

export type ChangedProperties<
  TState extends ElementState = ElementState & Record<string, unknown>,
> = readonly Extract<keyof TState, string>[];

export type ElementChange<
  TState extends ElementState = ElementState & Record<string, unknown>,
> = {
  readonly elementId: ElementId;
  readonly properties: ChangedProperties<TState>;
};

export type GridChange<
  TState extends ElementState = ElementState & Record<string, unknown>,
> =
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
      readonly type: "grid-reordered";
      readonly gridId: GridId;
      readonly fromIndex: number;
      readonly toIndex: number;
    }
  | {
      readonly type: "grid-changed";
      readonly gridId: GridId;
      readonly change: GridChange;
    };

export type WorkspaceChange =
  | {
      readonly type: "timeline-changed";
      readonly change: TimelineChange;
    }
  | {
      readonly type: "container-added";
      readonly containerId: GridContainerId;
    }
  | {
      readonly type: "container-removed";
      readonly containerId: GridContainerId;
    }
  | {
      readonly type: "container-reordered";
      readonly containerId: GridContainerId;
      readonly fromIndex: number;
      readonly toIndex: number;
    }
  | {
      readonly type: "container-changed";
      readonly containerId: GridContainerId;
      readonly change: GridContainerChange;
    };

export type SelectionChange = {
  readonly addedElements: readonly EditableElement[];
  readonly removedElements: readonly EditableElement[];
};

export type ToolChange = {
  readonly previousTool: ToolId;
  readonly selectedTool: ToolId;
};

export type TimelineTransportChange =
  | {
      readonly type: "playhead-moved";
      readonly previousTick: Tick;
      readonly tick: Tick;
    }
  | {
      readonly type: "playback-changed";
      readonly isPlaying: boolean;
    };

export type TimelineChange =
  | {
      readonly type: "bpm";
      readonly previousBpm: BPM;
      readonly bpm: BPM;
    }
  | {
      readonly type: "time-signature";
      readonly previousTimeSignature: TimeSignature;
      readonly timeSignature: TimeSignature;
    }
  | {
      readonly type: "length";
      readonly previousLengthTicks: Tick;
      readonly lengthTicks: Tick;
    };
