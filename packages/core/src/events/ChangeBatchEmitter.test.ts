import { describe, expect, it, vi } from "vitest";
import { ChangeBatchEmitter } from "./ChangeBatchEmitter";

describe("ChangeBatchEmitter", () => {
  it("emits an array for an unbatched change", () => {
    const emitter = new ChangeBatchEmitter<string>();
    const listener = vi.fn();
    emitter.onChange(listener);

    emitter.emit("first");
    emitter.emit("second");

    expect(listener).toHaveBeenNthCalledWith(1, ["first"]);
    expect(listener).toHaveBeenNthCalledWith(2, ["second"]);
  });

  it("holds notifications until the outer batch completes", () => {
    const emitter = new ChangeBatchEmitter<number>();
    const listener = vi.fn();
    emitter.onChange(listener);

    const result = emitter.batch(() => {
      emitter.emit(1);
      emitter.batch(() => {
        emitter.emit(2);
        expect(listener).not.toHaveBeenCalled();
      });
      emitter.emit(3);
      expect(listener).not.toHaveBeenCalled();
      return "result";
    });

    expect(result).toBe("result");
    expect(listener).toHaveBeenCalledExactlyOnceWith([1, 2, 3]);
  });

  it("does not notify for empty batches", () => {
    const emitter = new ChangeBatchEmitter<number>();
    const listener = vi.fn();
    emitter.onChange(listener);

    emitter.batch(() => undefined);

    expect(listener).not.toHaveBeenCalled();
  });

  it("flushes successful mutations even when the batch throws", () => {
    const emitter = new ChangeBatchEmitter<string>();
    const listener = vi.fn();
    emitter.onChange(listener);

    expect(() => emitter.batch(() => {
      emitter.emit("applied");
      throw new Error("failed");
    })).toThrow("failed");

    expect(listener).toHaveBeenCalledExactlyOnceWith(["applied"]);

    emitter.emit("later");
    expect(listener).toHaveBeenNthCalledWith(2, ["later"]);
  });

  it("allows unsubscribing and doesn't reuse previous batches", () => {
    const emitter = new ChangeBatchEmitter<number>();
    const listener = vi.fn();
    const unsubscribe = emitter.onChange(listener);

    emitter.batch(() => emitter.emit(1));
    emitter.batch(() => emitter.emit(2));
    unsubscribe();
    emitter.emit(3);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, [1]);
    expect(listener).toHaveBeenNthCalledWith(2, [2]);
  });
});
