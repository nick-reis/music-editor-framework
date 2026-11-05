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


describe("ChangeBatchEmitter notification safety", () => {
  it("freezes outgoing arrays for ordinary and batched notifications", () => {
    const emitter = new ChangeBatchEmitter<number>();
    const received: (readonly number[])[] = [];
    emitter.onChange((changes) => received.push(changes));

    emitter.emit(1);
    emitter.batch(() => {
      emitter.emit(2);
      emitter.emit(3);
    });

    expect(received).toEqual([[1], [2, 3]]);
    expect(received.every((changes) => Object.isFrozen(changes))).toBe(true);
    expect(Reflect.set(received[0], 0, 100)).toBe(false);
    expect(Reflect.set(received[1], 1, 100)).toBe(false);
    expect(received).toEqual([[1], [2, 3]]);
  });

  it("prevents one subscriber from corrupting the batch received by another", () => {
    const emitter = new ChangeBatchEmitter<string>();
    const received: (readonly string[])[] = [];
    const attempts: boolean[] = [];

    emitter.onChange((changes) => {
      attempts.push(Reflect.set(changes, 0, "corrupted"));
    });
    emitter.onChange((changes) => {
      received.push(changes);
    });

    emitter.batch(() => {
      emitter.emit("original");
      emitter.emit("second");
    });

    expect(attempts).toEqual([false]);
    expect(received).toEqual([["original", "second"]]);
  });

  it("does not recursively interrupt subscribers when an observer emits another change", () => {
    const emitter = new ChangeBatchEmitter<number>();
    const sequence: string[] = [];

    emitter.onChange((changes) => {
      sequence.push("first:" + changes.join(","));
      if (changes[0] === 1) {
        emitter.batch(() => {
          emitter.emit(2);
          emitter.emit(3);
        });
      }
    });
    emitter.onChange((changes) => {
      sequence.push("second:" + changes.join(","));
    });

    emitter.emit(1);

    expect(sequence).toEqual([
      "first:1",
      "second:1",
      "first:2,3",
      "second:2,3",
    ]);
  });

  it("does not recursively interrupt subscribers for nested unbatched events", () => {
    const emitter = new ChangeBatchEmitter<string>();
    const sequence: string[] = [];

    emitter.onChange((changes) => {
      sequence.push("first:" + changes[0]);
      if (changes[0] === "initial") emitter.emit("follow-up");
    });
    emitter.onChange((changes) => {
      sequence.push("second:" + changes[0]);
    });

    emitter.emit("initial");

    expect(sequence).toEqual([
      "first:initial",
      "second:initial",
      "first:follow-up",
      "second:follow-up",
    ]);
  });

  it("preserves all changes when an inner batch throws and is caught", () => {
    const emitter = new ChangeBatchEmitter<string>();
    const listener = vi.fn();
    emitter.onChange(listener);

    emitter.batch(() => {
      emitter.emit("before");
      try {
        emitter.batch(() => {
          emitter.emit("inside");
          throw new Error("inner failure");
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
      emitter.emit("after");
      expect(listener).not.toHaveBeenCalled();
    });

    expect(listener).toHaveBeenCalledExactlyOnceWith([
      "before", "inside", "after",
    ]);
  });

  it("keeps batch contents intact after a throwing operation and resets batching", () => {
    const emitter = new ChangeBatchEmitter<number>();
    const received: (readonly number[])[] = [];
    emitter.onChange((changes) => received.push(changes));

    expect(() => emitter.batch(() => {
      emitter.emit(1);
      throw new Error("failed after one change");
    })).toThrow("failed after one change");

    emitter.batch(() => {
      emitter.emit(2);
      emitter.emit(3);
    });

    expect(received).toEqual([[1], [2, 3]]);
    expect(received.every((changes) => Object.isFrozen(changes))).toBe(true);
  });

  it("freezes only the notification array, not model payload objects", () => {
    const emitter = new ChangeBatchEmitter<{ value: number }>();
    const payload = { value: 1 };
    let received: readonly { value: number }[] | undefined;
    emitter.onChange((changes) => {
      received = changes;
    });

    emitter.emit(payload);
    payload.value = 2;

    expect(Object.isFrozen(received)).toBe(true);
    expect(Object.isFrozen(payload)).toBe(false);
    expect(received).toEqual([{ value: 2 }]);
  });
});
