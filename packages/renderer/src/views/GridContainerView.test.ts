import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  AudioGrid,
  EditorWorkspace,
  GridContainer,
  MidiGrid,
  Timeline,
  ToolManager,
} from "@music-editor/core";
import { createRendererRuntime } from "../RendererRuntime";

function makeCanvas(width: number, height: number) {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
  };
  const canvas = {
    width: 300,
    height: 150,
    getContext: vi.fn(() => context),
    getBoundingClientRect: vi.fn(() => ({ width, height })),
  } as unknown as HTMLCanvasElement;

  return { context, canvas };
}

function makeWorkspace(timeline = new Timeline()) {
  const midi = new MidiGrid(
    [{ id: "pitch-60", label: "C4", pitch: 60 }],
    "midi",
  );
  const audio = new AudioGrid(
    [{ id: "track-1", label: "Audio" }],
    "audio",
  );
  const container = new GridContainer([midi, audio], "container-1");
  const workspace = new EditorWorkspace(
    [container],
    "workspace-1",
    timeline,
  );

  return { workspace, container, midi, audio };
}

describe("GridContainerView integration", () => {
  const pending = new Map<number, FrameRequestCallback>();
  let nextId = 1;

  function installFrames() {
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback) => {
        const id = nextId++;
        pending.set(id, callback);
        return id;
      },
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      (id: number) => { pending.delete(id); },
    );
  }

  function flush(timeMs: number) {
    const frames = [...pending.values()];
    pending.clear();
    for (const frame of frames) frame(timeMs);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    pending.clear();
    nextId = 1;
  });

  it("paints the ruler and two grids from one registered frame", () => {
    installFrames();
    const { workspace, container, midi, audio } = makeWorkspace();
    const renderer = createRendererRuntime({
      workspace, tools: new ToolManager(),
    });

    const ruler = makeCanvas(500, 28);
    const midiCanvas = makeCanvas(500, 40);
    const audioCanvas = makeCanvas(500, 80);
    const view = renderer.mountContainer({
      container,
      ruler: ruler.canvas,
    });
    view.attachGrid(midi, midiCanvas.canvas);
    view.attachGrid(audio, audioCanvas.canvas, { rowHeight: 80 });

    expect(pending.size).toBe(1);
    flush(100);

    expect(ruler.context.clearRect).toHaveBeenCalledOnce();
    expect(midiCanvas.context.clearRect).toHaveBeenCalledOnce();
    expect(audioCanvas.context.clearRect).toHaveBeenCalledOnce();
    expect(pending.size).toBe(0);
    renderer.dispose();
  });

  it("clamps pan to the measured ruler width and timeline length", () => {
    installFrames();
    const { workspace, container, midi } = makeWorkspace();
    const renderer = createRendererRuntime({
      workspace, tools: new ToolManager(),
    });
    const ruler = makeCanvas(400, 28);
    const midiCanvas = makeCanvas(400, 20);
    const view = renderer.mountContainer({
      container, ruler: ruler.canvas,
    });
    view.attachGrid(midi, midiCanvas.canvas);
    flush(100);

    // The 16-bar default project is 1536px wide. Max scroll = 1136px.
    view.panBy(100_000);
    flush(116);
    for (let i = 0; i < 100; i++) flush(132 + i * 16);

    // Request another paint at the final clamped position so only
    // that one frame is inspected, not the entire animation history.
    ruler.context.moveTo.mockClear();
    view.panBy(100_000);
    flush(1750);

    // Tick 23040 (bar 13) is 16px into the rightmost viewport:
    // 23040 * 0.05 - (1536 - 400) = 16.
    expect(ruler.context.moveTo.mock.calls.some(
      (call) => call[0] === 16.5 && call[1] === 0,
    )).toBe(true);

    view.panBy(-100_000);
    for (let i = 0; i < 100; i++) flush(1800 + i * 16);

    ruler.context.moveTo.mockClear();
    view.panBy(-100_000);
    flush(3500);
    // Tick zero is visible again and cannot be panned past.
    expect(ruler.context.moveTo.mock.calls.some(
      (call) => call[0] === 0.5 && call[1] === 0,
    )).toBe(true);
    renderer.dispose();
  });

  it("repaints all surfaces when the shared camera pans or zooms", () => {
    installFrames();
    const { workspace, container, midi, audio } = makeWorkspace();
    const renderer = createRendererRuntime({
      workspace, tools: new ToolManager(),
    });
    const ruler = makeCanvas(500, 28);
    const midiCanvas = makeCanvas(500, 40);
    const audioCanvas = makeCanvas(500, 80);

    const view = renderer.mountContainer({
      container, ruler: ruler.canvas,
    });
    view.attachGrid(midi, midiCanvas.canvas);
    view.attachGrid(audio, audioCanvas.canvas);
    flush(100);

    view.panBy(100);
    expect(pending.size).toBe(1);
    flush(116);
    expect(pending.size).toBe(1);
    flush(132);

    view.zoomAt(120, 1.5);
    flush(148);

    expect(ruler.context.clearRect.mock.calls.length)
      .toBeGreaterThan(2);
    expect(midiCanvas.context.clearRect.mock.calls.length)
      .toBe(ruler.context.clearRect.mock.calls.length);
    expect(audioCanvas.context.clearRect.mock.calls.length)
      .toBe(ruler.context.clearRect.mock.calls.length);
    renderer.dispose();
  });

  it("does not repaint an unrelated container when another moves", () => {
    installFrames();
    const { workspace, container, midi } = makeWorkspace();

    const secondGrid = new AudioGrid(
      [{ id: "other-row", label: "Other" }],
      "other-grid",
    );
    const secondContainer = new GridContainer(
      [secondGrid], "container-2",
    );
    workspace.addContainer(secondContainer);

    const renderer = createRendererRuntime({
      workspace, tools: new ToolManager(),
    });
    const firstRuler = makeCanvas(400, 28);
    const otherRuler = makeCanvas(400, 28);
    const firstGridCanvas = makeCanvas(400, 20);
    const otherGridCanvas = makeCanvas(400, 40);

    const first = renderer.mountContainer({
      container, ruler: firstRuler.canvas,
    });
    first.attachGrid(midi, firstGridCanvas.canvas);

    const second = renderer.mountContainer({
      container: secondContainer,
      ruler: otherRuler.canvas,
    });
    second.attachGrid(secondGrid, otherGridCanvas.canvas);

    flush(100);
    first.panBy(100);
    flush(116);
    flush(132);

    expect(firstRuler.context.clearRect.mock.calls.length)
      .toBeGreaterThan(1);
    expect(otherRuler.context.clearRect).toHaveBeenCalledOnce();
    expect(otherGridCanvas.context.clearRect).toHaveBeenCalledOnce();
    renderer.dispose();
  });

  it("detaches one grid without destroying its container view", () => {
    installFrames();
    const { workspace, container, midi, audio } = makeWorkspace();
    const renderer = createRendererRuntime({
      workspace, tools: new ToolManager(),
    });
    const ruler = makeCanvas(400, 28);
    const midiCanvas = makeCanvas(400, 20);
    const audioCanvas = makeCanvas(400, 80);
    const view = renderer.mountContainer({
      container, ruler: ruler.canvas,
    });
    const detach = view.attachGrid(midi, midiCanvas.canvas);
    view.attachGrid(audio, audioCanvas.canvas);
    flush(100);

    detach();
    detach();
    view.panBy(100);
    flush(116);

    expect(midiCanvas.context.clearRect).toHaveBeenCalledOnce();
    expect(audioCanvas.context.clearRect.mock.calls.length)
      .toBeGreaterThan(1);
    renderer.dispose();
  });

  it("invalidates the view when the core timeline changes", () => {
    installFrames();
    const { workspace, container } = makeWorkspace();
    const renderer = createRendererRuntime({
      workspace, tools: new ToolManager(),
    });
    const ruler = makeCanvas(400, 28);
    renderer.mountContainer({ container, ruler: ruler.canvas });

    flush(100);
    workspace.timeline.setTimeSignature([3, 4]);
    expect(pending.size).toBe(1);
    flush(116);

    expect(ruler.context.clearRect).toHaveBeenCalledTimes(2);
    renderer.dispose();
  });

  it("invalidates the view for changes in its own grid container", () => {
    installFrames();
    const { workspace, container, midi } = makeWorkspace();
    const renderer = createRendererRuntime({
      workspace, tools: new ToolManager(),
    });
    const ruler = makeCanvas(400, 28);
    const gridCanvas = makeCanvas(400, 20);
    const view = renderer.mountContainer({
      container, ruler: ruler.canvas,
    });
    view.attachGrid(midi, gridCanvas.canvas);
    flush(100);

    container.addGrid(new AudioGrid(
      [{ id: "extra-row", label: "Extra" }],
      "extra-grid",
    ));
    expect(pending.size).toBe(1);
    flush(116);

    expect(ruler.context.clearRect).toHaveBeenCalledTimes(2);
    expect(gridCanvas.context.clearRect).toHaveBeenCalledTimes(2);
    renderer.dispose();
  });

  it("uses the workspace tick resolution for the default camera", () => {
    installFrames();
    const { workspace, container } = makeWorkspace(
      new Timeline({ ticksPerQuarter: 960 }),
    );
    const renderer = createRendererRuntime({
      workspace, tools: new ToolManager(),
    });
    const ruler = makeCanvas(400, 28);
    renderer.mountContainer({ container, ruler: ruler.canvas });
    flush(100);

    // Tick 3840 is the second bar: 96 pixels at 24 px per quarter.
    expect(ruler.context.moveTo.mock.calls.some(
      (call) => call[0] === 96.5 && call[1] === 0,
    )).toBe(true);
    renderer.dispose();
  });

  it("cleans up pending frames and preserves the core on disposal", () => {
    installFrames();
    const { workspace, container } = makeWorkspace();
    const renderer = createRendererRuntime({
      workspace, tools: new ToolManager(),
    });
    const ruler = makeCanvas(400, 28);
    const view = renderer.mountContainer({
      container, ruler: ruler.canvas,
    });

    view.panBy(100);
    expect(pending.size).toBe(1);

    renderer.dispose();
    renderer.dispose();
    view.dispose();

    expect(pending.size).toBe(0);
    expect(workspace.getContainer(container.id)).toBe(container);
    workspace.timeline.setTimeSignature([3, 4]);
    expect(pending.size).toBe(0);
    expect(() => renderer.mountContainer({
      container, ruler: ruler.canvas,
    })).toThrow("disposed");
  });

  it("rejects mounting foreign containers and grids", () => {
    installFrames();
    const { workspace, container } = makeWorkspace();
    const renderer = createRendererRuntime({
      workspace, tools: new ToolManager(),
    });
    const ruler = makeCanvas(400, 28);
    const foreign = new GridContainer([], "foreign");

    expect(() => renderer.mountContainer({
      container: foreign, ruler: ruler.canvas,
    })).toThrow("another workspace");

    const view = renderer.mountContainer({
      container, ruler: ruler.canvas,
    });
    const foreignGrid = new AudioGrid(
      [{ id: "foreign-row", label: "Foreign" }],
      "foreign-grid",
    );
    expect(() => view.attachGrid(
      foreignGrid, makeCanvas(400, 40).canvas,
    )).toThrow("another container");

    renderer.dispose();
  });

  it("automatically detaches when the core container is removed", () => {
    installFrames();
    const { workspace, container } = makeWorkspace();
    const renderer = createRendererRuntime({
      workspace, tools: new ToolManager(),
    });
    const ruler = makeCanvas(400, 28);
    const view = renderer.mountContainer({
      container, ruler: ruler.canvas,
    });
    flush(100);

    expect(workspace.removeContainer(container.id)).toBe(true);
    expect(() => view.attachGrid(
      new AudioGrid([{ id: "x", label: "X" }], "new-grid"),
      makeCanvas(400, 40).canvas,
    )).toThrow("disposed");

    renderer.dispose();
  });
});
