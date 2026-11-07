import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { CanvasSurface } from "./CanvasSurface";

function makeCanvas(width = 800, height = 400) {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
  };

  let cssWidth = width;
  let cssHeight = height;

  const canvas = {
    width: 300,
    height: 150,
    getContext: vi.fn(() => context),
    getBoundingClientRect: vi.fn(() => ({
      width: cssWidth,
      height: cssHeight,
    })),
  } as unknown as HTMLCanvasElement;

  return {
    canvas,
    context,
    setCssSize(nextWidth: number, nextHeight: number) {
      cssWidth = nextWidth;
      cssHeight = nextHeight;
    },
  };
}

describe("CanvasSurface", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sets backing pixels from CSS size and DPR", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const { canvas, context } = makeCanvas();
    const invalidate = vi.fn();

    const surface = new CanvasSurface(canvas, invalidate);

    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(800);
    expect(invalidate).toHaveBeenCalledOnce();

    const painter = vi.fn();
    surface.paint(painter);

    expect(context.setTransform).toHaveBeenCalledWith(
      2, 0, 0, 2, 0, 0,
    );
    expect(painter).toHaveBeenCalledWith(
      context,
      { width: 800, height: 400, pixelRatio: 2 },
    );
    expect(context.restore).toHaveBeenCalledOnce();
    surface.dispose();
  });

  it("does not invalidate when dimensions are unchanged", () => {
    const { canvas } = makeCanvas();
    const invalidate = vi.fn();
    const surface = new CanvasSurface(canvas, invalidate);
    invalidate.mockClear();

    expect(surface.syncSize()).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
    surface.dispose();
  });

  it("detects CSS resize and updates only changed dimensions", () => {
    const { canvas, setCssSize } = makeCanvas();
    const invalidate = vi.fn();
    const surface = new CanvasSurface(canvas, invalidate);
    invalidate.mockClear();

    setCssSize(900, 400);
    expect(surface.syncSize()).toBe(true);
    expect(canvas.width).toBe(900);
    expect(canvas.height).toBe(400);
    expect(invalidate).toHaveBeenCalledOnce();
    surface.dispose();
  });

  it("updates DPR when the next paint occurs", () => {
    vi.stubGlobal("devicePixelRatio", 1);
    const { canvas, context } = makeCanvas();
    const surface = new CanvasSurface(canvas, vi.fn());

    vi.stubGlobal("devicePixelRatio", 2);
    const painter = vi.fn();
    surface.paint(painter);

    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(800);
    expect(context.setTransform).toHaveBeenCalledWith(
      2, 0, 0, 2, 0, 0,
    );
    surface.dispose();
  });

  it("avoids layout measurements on every paint", () => {
    const { canvas } = makeCanvas();
    const surface = new CanvasSurface(canvas, vi.fn());
    const measure = vi.mocked(canvas.getBoundingClientRect);
    measure.mockClear();

    surface.paint(vi.fn());
    surface.paint(vi.fn());

    expect(measure).not.toHaveBeenCalled();
    surface.dispose();
  });

  it("disconnects a resize observer when disposed", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      vi.fn().mockImplementation(() => ({
        observe,
        disconnect,
      })),
    );
    const { canvas } = makeCanvas();
    const surface = new CanvasSurface(canvas, vi.fn());

    expect(observe).toHaveBeenCalledWith(canvas);
    surface.dispose();
    surface.dispose();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("does not paint or remeasure after disposal", () => {
    const { canvas } = makeCanvas();
    const surface = new CanvasSurface(canvas, vi.fn());
    const painter = vi.fn();
    const measure = vi.mocked(canvas.getBoundingClientRect);
    measure.mockClear();

    surface.dispose();
    expect(surface.syncSize()).toBe(false);
    surface.paint(painter);

    expect(painter).not.toHaveBeenCalled();
    expect(measure).not.toHaveBeenCalled();
  });

  it("restores canvas state if a painter throws", () => {
    const { canvas, context } = makeCanvas();
    const surface = new CanvasSurface(canvas, vi.fn());

    expect(() => surface.paint(() => {
      throw new Error("Painter failed");
    })).toThrow("Painter failed");
    expect(context.restore).toHaveBeenCalledOnce();
    surface.dispose();
  });

  it("throws if Canvas 2D is not available", () => {
    const { canvas } = makeCanvas();
    vi.mocked(canvas.getContext).mockReturnValue(null);

    expect(() => new CanvasSurface(canvas, vi.fn()))
      .toThrow("Canvas 2D context unavailable");
  });

  it("is safe to import without browser globals", () => {
    // Instantiation requires a canvas, but the module does not.
    expect(typeof CanvasSurface).toBe("function");
  });
});
