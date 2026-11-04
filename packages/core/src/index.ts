export { EditableElement } from "./elements/EditableElement";
export { MidiNote } from "./elements/MidiNote";
export { AudioClip } from "./elements/AudioClip";

export { Grid } from "./grids/Grid";
export { MidiGrid } from "./grids/MidiGrid";
export { AudioGrid } from "./grids/AudioGrid";
export { GridContainer } from "./grids/GridContainer";

export type { GridRow } from "./grids/rows/GridRow";
export type { MidiRow } from "./grids/rows/MidiRow";

export { EditorWorkspace } from "./workspace/EditorWorkspace";
export { SelectionManager } from "./managers/SelectionManager";
export { ToolManager } from "./managers/ToolManager";
export { Timeline } from "./timeline/Timeline";

// Observation infrastructure
export { ChangeEmitter } from "./events/ChangeEmitter";

export type { ChangeListener, Unsubscribe } from "./events/ChangeEmitter";

// Change contracts
export type {
  ElementState,
  ChangedProperties,
  ElementChange,
  GridChange,
  GridContainerChange,
  WorkspaceChange,
  SelectionChange,
  ToolChange,
  TimelineChange,
} from "./events/ModelChange";

// Tools
export { ToolId } from "./tools/ToolId";
export type { ToolId as ToolIdType } from "./tools/ToolId";

// Identifiers
export type {
  ElementId,
  GridId,
  GridContainerId,
  WorkspaceId,
} from "./types/ids";

// Coordinates
export type { RowIndex, GridPosition, ScreenPoint } from "./types/coordinates";

// Time
export { TICKS_PER_QUARTER_NOTE } from "./types/time";
export type { Tick, Seconds, BPM } from "./types/time";
