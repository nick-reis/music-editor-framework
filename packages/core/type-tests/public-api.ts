/**
 * Compile-only consumer contract for the DECLARATION package entry point.
 * This file intentionally imports only from @music-editor/core.
 * Run through the check:public-api script AFTER building declarations.
 */
import {
  AudioClip,
  AudioGrid,
  ChangeEmitter,
  EditableElement,
  EditorWorkspace,
  Grid,
  GridContainer,
  MidiGrid,
  MidiNote,
  Timeline,
  ToolId,
} from "@music-editor/core";
import type {
  AudioClipCreation,
  ChangeListener,
  ElementChange,
  ElementState,
  GridChange,
  GridContainerChange,
  GridRow,
  MidiNoteCreation,
  MidiRow,
  Position,
  TimeSignature,
  TimelineOptions,
  ToolId as ToolIdentifier,
  Unsubscribe,
  WorkspaceChange,
} from "@music-editor/core";

type VelocityState = { velocity: number };

class VelocityNote extends EditableElement<VelocityState> {
  readonly resizable = true;

  constructor(row: number, startTick: number, durationTicks: number, velocity: number, id?: string) {
    super({ row, startTick, durationTicks, velocity }, id);
  }

  get velocity(): number {
    return this.state.velocity;
  }

  setVelocity(velocity: number): void {
    this.updateState({ velocity });
  }

  protected override validateState({ velocity }: Readonly<VelocityState>): void {
    if (!Number.isInteger(velocity) || velocity < 0 || velocity > 127) {
      throw new RangeError("Invalid MIDI velocity");
    }
  }
}

class VelocityGrid extends Grid<VelocityNote, GridRow> {
  readonly supportedTools: ReadonlySet<ToolIdentifier> = new Set([ToolId.Pointer]);
  readonly toolFallbacks: Readonly<Partial<Record<ToolIdentifier, ToolIdentifier>>> = {};

  constructor(rows: readonly GridRow[], id?: string) {
    super(rows, id);
  }

  protected override acceptsTransferredElement(element: EditableElement): boolean {
    return element instanceof VelocityNote;
  }

  createElement(row: number, startTick: number, durationTicks: number, velocity: number): VelocityNote {
    const element = new VelocityNote(row, startTick, durationTicks, velocity);
    this.addElement(element);
    return element;
  }
}

// Not executed: only the package's generated .d.ts must type-check.
function consumerContract(): void {
  const options: TimelineOptions = { bpm: 120, length: { bars: 8 } };
  const meter: TimeSignature = [4, 4];
  const timeline = new Timeline(options);
  timeline.setTimeSignature(meter);

  const midiRows: MidiRow[] = [{ id: "c4", label: "C4", pitch: 60 }];
  const midi = new MidiGrid(midiRows, "midi");
  const target = new MidiGrid(midiRows, "midi-target");
  const custom = new VelocityGrid([{ id: "custom-row", label: "Custom" }]);
  const secondCustom = new VelocityGrid([{ id: "custom-target", label: "Custom Target" }]);
  const audio = new AudioGrid([{ id: "audio-row", label: "Audio" }]);
  const container = new GridContainer([midi, target, custom, secondCustom, audio], "tracks");
  const workspace = new EditorWorkspace([container], "document", timeline);

  const start: Position = { bar: 1, beat: 1 };
  const noteRequest: MidiNoteCreation = {
    row: 0, start, duration: { beats: 1 },
  };
  const audioRequest: AudioClipCreation = {
    row: 0, start, sourceDurationSeconds: 1.5,
  };
  const note: MidiNote = midi.createElement(noteRequest);
  const clip: AudioClip = audio.createElement(audioRequest);
  const velocityNote = custom.createElement(0, 0, 480, 100);

  const initial: ElementState = {
    row: note.row,
    startTick: note.startTick,
    durationTicks: note.durationTicks,
    locked: note.locked,
  };
  const listener: ChangeListener<ElementChange> = (change) => {
    const properties: readonly string[] = change.properties;
    const id: string = change.elementId;
    void properties;
    void id;
  };
  const unsubscribe: Unsubscribe = velocityNote.onChange(listener);

  workspace.history.execute("Edit passage", () => {
    velocityNote.setVelocity(110);
    velocityNote.moveToTick(480);
    velocityNote.resizeToDuration(240);
    note.moveTo({ bar: 2 });
    note.setLocked(true);
    note.setLocked(false);
  });
  workspace.history.undo();
  workspace.history.redo();

  workspace.moveElements([note], { by: { ticks: 120 } });
  workspace.moveElementToGrid(note, target, { row: 0 });
  workspace.moveElementToGrid(velocityNote, secondCustom, { row: 0 });

  // Canonical time conversion and workspace lookups are part of the public contract.
  const tick: number = workspace.timeline.toTick(start);
  const grid: Grid | undefined = workspace.getGrid(midi.id);
  const selected: ReadonlySet<EditableElement> = workspace.selection.getSelectedElements();
  const clipSeconds: number = clip.sourceDurationSeconds;
  const rowIndex: number = custom.getRow(0) ? 0 : 1;
  const emitter = new ChangeEmitter<GridChange>();
  const stop = emitter.subscribe(() => {});

  const onContainer: ChangeListener<readonly GridContainerChange[]> = () => {};
  const onWorkspace: ChangeListener<readonly WorkspaceChange[]> = () => {};
  const offContainer = container.onChange(onContainer);
  const offWorkspace = workspace.onChange(onWorkspace);
  void initial; void tick; void grid; void selected; void clipSeconds; void rowIndex;
  void stop; void unsubscribe; void offContainer; void offWorkspace;

  // The following methods are implementation details, NOT supported consumer APIs.
  // The @ts-expect-error directives must NOT go unused in generated declarations.
  // @ts-expect-error internal edit-step preparation is hidden from consumers
  velocityNote.prepareStateUpdate({ velocity: 10 });
  // @ts-expect-error internal positioning preparation is hidden
  velocityNote.preparePosition(0, 120, 1, timeline);
  // @ts-expect-error internal initial-state revalidation is hidden
  velocityNote.assertValidState();
  // @ts-expect-error internal state projection is hidden
  velocityNote.durationTicksForTimeline(timeline, 0, 480, 120);
  // @ts-expect-error internal element event forwarding is hidden
  velocityNote.onInternalChange(() => {});
  // @ts-expect-error internal grid insertion step is hidden
  custom.prepareElementInsert(velocityNote, 0);
  // @ts-expect-error internal grid removal step is hidden
  custom.prepareElementRemove(velocityNote);
  // @ts-expect-error internal grid type acceptance check is hidden
  custom.canReceiveElement(velocityNote);
  // @ts-expect-error internal grid event forwarding is hidden
  custom.onInternalChange(() => {});
  // @ts-expect-error internal container event forwarding is hidden
  container.onInternalChange(() => {});
  // @ts-expect-error internal timeline event forwarding is hidden
  timeline.onInternalChange(() => {});
  // @ts-expect-error internal timing projection is hidden
  timeline.durationAtBpm(0, 1.5, 120);
  // @ts-expect-error internal timeline fit check is hidden
  timeline.assertFitsElement(note);
  // @ts-expect-error internal timeline interval validation is hidden
  timeline.assertInterval(0, 480);
  // @ts-expect-error internal listener registration is hidden
  emitter.subscribeInternal(() => {});
}

// @ts-expect-error internals are not exported by the package entry point
import type { EditStep } from "@music-editor/core";

void consumerContract;
