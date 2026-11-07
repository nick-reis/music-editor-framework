import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { RenderScheduler } from "./RenderScheduler";

describe("RenderScheduler", () => {
  const pending = new Map<number, FrameRequestCallback>();
  let nextId = 1;

  function flush(timeMs: number): void {
    const frames = [...pending.values()];
    pending.clear();
    for (const frame of frames) frame(timeMs);
  }

  function installClock(): void {
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback): number => {
        const id = nextId++;
        pending.set(id, callback);
        return id;
      },
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      (id: number): void => {
        pending.delete(id);
      },
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    pending.clear();
    nextId = 1;
  });

  it("coalesces repeated invalidations", () => {
    installClock();
    const scheduler = new RenderScheduler();
    const callback = vi.fn(() => false);

    scheduler.register(callback);
    scheduler.invalidate();
    scheduler.invalidate();

    expect(pending.size).toBe(1);
    flush(100);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(pending.size).toBe(0);

    scheduler.dispose();
  });

  it("runs only while a task needs another frame", () => {
    installClock();
    const scheduler = new RenderScheduler();
    const received: number[] = [];

    scheduler.register(({ deltaSeconds }) => {
      received.push(deltaSeconds);
      return received.length < 4;
    });

    for (let i = 0; i < 4; i++) {
      expect(pending.size).toBe(1);
      flush(100 + 16 * i);
    }

    expect(received).toHaveLength(4);
    expect(received[0]).toBe(0);
    expect(received[1]).toBeCloseTo(0.016);
    expect(pending.size).toBe(0);

    scheduler.dispose();
  });

  it("caps elapsed time after a delayed frame", () => {
    installClock();
    const scheduler = new RenderScheduler();
    const deltas: number[] = [];

    scheduler.register((frame) => {
      deltas.push(frame.deltaSeconds);
      return deltas.length < 2;
    });

    flush(100);
    flush(3000);
    expect(deltas).toEqual([0, 0.05]);
    scheduler.dispose();
  });

  it("starts a fresh clock for a new invalidation", () => {
    installClock();
    const scheduler = new RenderScheduler();
    const deltas: number[] = [];

    scheduler.register(({ deltaSeconds }) => {
      deltas.push(deltaSeconds);
      return false;
    });

    flush(100);
    scheduler.invalidate();
    flush(999);
    expect(deltas).toEqual([0, 0]);
    scheduler.dispose();
  });

  it("cancels work when the last task unregisters", () => {
    installClock();
    const scheduler = new RenderScheduler();
    const unsubscribe = scheduler.register(() => true);

    expect(pending.size).toBe(1);
    unsubscribe();
    unsubscribe();
    expect(pending.size).toBe(0);

    scheduler.dispose();
  });

  it("allows independent registrations of the same callback", () => {
    installClock();
    const scheduler = new RenderScheduler();
    const callback = vi.fn(() => false);

    const unsubscribeFirst = scheduler.register(callback);
    const unsubscribeSecond = scheduler.register(callback);

    unsubscribeFirst();
    flush(100);
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribeSecond();
    scheduler.dispose();
  });

  it("handles unregistering another task during a frame", () => {
    installClock();
    const scheduler = new RenderScheduler();
    const other = vi.fn(() => false);
    let unregisterOther = () => {};

    scheduler.register(() => {
      unregisterOther();
      return false;
    });
    unregisterOther = scheduler.register(other);

    flush(100);
    expect(other).not.toHaveBeenCalled();
    scheduler.dispose();
  });

  it("cancels pending work on disposal and refuses new registrations", () => {
    installClock();
    const scheduler = new RenderScheduler();
    scheduler.register(() => true);

    scheduler.dispose();
    scheduler.dispose();
    scheduler.invalidate();

    expect(pending.size).toBe(0);
    expect(() => scheduler.register(() => false)).toThrow("disposed");
  });

  it("can be imported and constructed without browser globals", () => {
    const scheduler = new RenderScheduler();
    expect(() => scheduler.dispose()).not.toThrow();
  });
});
