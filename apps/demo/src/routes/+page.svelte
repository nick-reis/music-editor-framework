<script lang="ts">
  import { onMount } from "svelte";

  import {
    AudioGrid,
    EditorWorkspace,
    GridContainer,
    MidiGrid,
    ToolManager,
  } from "@music-editor/core";
  import {
    createRendererRuntime,
    type GridContainerView,
  } from "@music-editor/renderer";

  let rulerCanvas: HTMLCanvasElement;
  let midiCanvas: HTMLCanvasElement;
  let audioCanvas: HTMLCanvasElement;

  let view: GridContainerView | null = null;

  onMount(() => {
    const midiRows = Array.from({ length: 12 }, (_, index) => ({
      id: "midi-row-" + index,
      label: "Note " + (71 - index),
      pitch: 71 - index,
    }));

    const midi = new MidiGrid(midiRows, "midi-grid");
    const audio = new AudioGrid(
      [{ id: "audio-row", label: "Audio" }],
      "audio-grid",
    );
    const container = new GridContainer(
      [midi, audio],
      "demo-container",
    );

    const workspace = new EditorWorkspace([container]);
    const tools = new ToolManager();
    const renderer = createRendererRuntime({ workspace, tools });

    view = renderer.mountContainer({
      container,
      ruler: rulerCanvas,
    });

    view.attachGrid(midi, midiCanvas, { rowHeight: 20 });
    view.attachGrid(audio, audioCanvas, { rowHeight: 80 });

    return () => {
      renderer.dispose();
      view = null;
    };
  });

  function zoom(factor: number): void {
    if (!view) return;

    const anchorX = rulerCanvas.getBoundingClientRect().width / 2;
    view.zoomAt(anchorX, factor);
  }
</script>

<svelte:head>
  <title>Music Editor Renderer</title>
</svelte:head>

<main class="p-6">
  <section class="editor">
    <header class="toolbar">
      <strong>Music Editor</strong>

      <div class="controls">
        <button onclick={() => view?.panBy(-100)}>← Pan</button>
        <button onclick={() => view?.panBy(100)}>Pan →</button>
        <button onclick={() => zoom(1 / 1.5)}>Zoom −</button>
        <button onclick={() => zoom(1.5)}>Zoom +</button>
      </div>
    </header>

    <div class="editor-row ruler-row">
      <div class="sidebar">Timeline</div>
      <canvas bind:this={rulerCanvas} aria-label="Musical timeline ruler"></canvas>
    </div>

    <div class="editor-row midi-row">
      <div class="sidebar">MIDI</div>
      <canvas bind:this={midiCanvas} aria-label="MIDI timing grid"></canvas>
    </div>

    <div class="editor-row audio-row">
      <div class="sidebar">Audio</div>
      <canvas bind:this={audioCanvas} aria-label="Audio timing grid"></canvas>
    </div>
  </section>
</main>

<style>
  .editor {
    width: 100%;
    overflow: hidden;
    border: 1px solid #3f3f46;
    border-radius: 8px;
    background: #18181b;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid #3f3f46;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  button {
    padding: 5px 10px;
    border-radius: 5px;
    background: #27272a;
    cursor: pointer;
  }

  button:hover {
    background: #3f3f46;
  }

  .editor-row {
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr);
    min-width: 0;
  }

  .sidebar {
    padding: 8px;
    background: #27272a;
    border-right: 1px solid #3f3f46;
    font-size: 12px;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    min-width: 0;
  }

  .ruler-row {
    height: 28px;
  }

  .midi-row {
    height: 240px;
  }

  .audio-row {
    height: 80px;
  }
</style>
