import { describe, expect, it, vi } from "vitest";
import { ChangeEmitter } from "./ChangeEmitter";

describe("ChangeEmitter", () => {
  it("delivers ordinary notifications synchronously and in order", () => {
    const emitter = new ChangeEmitter<number>();
    const first = vi.fn();
    const second = vi.fn();
    emitter.subscribe(first);
    emitter.subscribe(second);

    emitter.emit(1);
    emitter.emit(2);

    expect(first.mock.calls.map(([value]) => value)).toEqual([1, 2]);
    expect(second.mock.calls.map(([value]) => value)).toEqual([1, 2]);
  });

  it("queues reentrant notifications until every listener receives the current event", () => {
    const emitter = new ChangeEmitter<number>();
    const received: string[] = [];

    emitter.subscribe((value) => {
      received.push("first:" + value);
      if (value === 1) {
        emitter.emit(2);
        emitter.emit(3);
      }
    });
    emitter.subscribe((value) => {
      received.push("second:" + value);
    });

    emitter.emit(1);

    expect(received).toEqual([
      "first:1",
      "second:1",
      "first:2",
      "second:2",
      "first:3",
      "second:3",
    ]);
  });

  it("handles multiple levels of reentrancy without changing event order", () => {
    const emitter = new ChangeEmitter<number>();
    const received: string[] = [];

    emitter.subscribe((value) => {
      received.push("A" + value);
      if (value < 4) emitter.emit(value + 1);
    });
    emitter.subscribe((value) => {
      received.push("B" + value);
    });

    emitter.emit(1);

    expect(received).toEqual([
      "A1", "B1",
      "A2", "B2",
      "A3", "B3",
      "A4", "B4",
    ]);
  });

  it("isolates exceptions from a listener and continues dispatching queued events", () => {
    const emitter = new ChangeEmitter<number>();
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    const received: number[] = [];

    try {
      emitter.subscribe((value) => {
        if (value === 1) {
          emitter.emit(2);
          throw new Error("render failed");
        }
      });
      emitter.subscribe((value) => received.push(value));

      expect(() => emitter.emit(1)).not.toThrow();

      expect(received).toEqual([1, 2]);
      expect(logger).toHaveBeenCalledExactlyOnceWith(
        "Change listener failed:",
        expect.objectContaining({ message: "render failed" }),
      );
    } finally {
      logger.mockRestore();
    }
  });

  it("uses a listener snapshot for each event when subscriptions change during dispatch", () => {
    const emitter = new ChangeEmitter<number>();
    const received: string[] = [];
    let unsubscribeSecond = () => {};

    emitter.subscribe((value) => {
      received.push("first:" + value);
      if (value === 1) {
        unsubscribeSecond();
        emitter.subscribe((next) => received.push("third:" + next));
        emitter.emit(2);
      }
    });
    unsubscribeSecond = emitter.subscribe((value) => {
      received.push("second:" + value);
    });

    emitter.emit(1);

    expect(received).toEqual([
      "first:1",
      "second:1",
      "first:2",
      "third:2",
    ]);
  });

  it("supports idempotent unsubscription", () => {
    const emitter = new ChangeEmitter<string>();
    const listener = vi.fn();
    const unsubscribe = emitter.subscribe(listener);

    emitter.emit("before");
    unsubscribe();
    unsubscribe();
    emitter.emit("after");

    expect(listener).toHaveBeenCalledExactlyOnceWith("before");
  });

  it("does not register a duplicate listener twice", () => {
    const emitter = new ChangeEmitter<string>();
    const listener = vi.fn();

    emitter.subscribe(listener);
    emitter.subscribe(listener);
    emitter.emit("once");

    expect(listener).toHaveBeenCalledExactlyOnceWith("once");
  });

  it("continues to operate normally after a reentrant dispatch finishes", () => {
    const emitter = new ChangeEmitter<number>();
    const received: number[] = [];

    emitter.subscribe((value) => {
      received.push(value);
      if (value === 1) emitter.emit(2);
    });

    emitter.emit(1);
    emitter.emit(3);

    expect(received).toEqual([1, 2, 3]);
  });
});
