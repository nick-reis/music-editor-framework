import { describe, expect, it, vi } from "vitest";
import { NotificationTransaction } from "./NotificationTransaction";

describe("NotificationTransaction", () => {
  it("delivers non-transaction notifications synchronously", () => {
    const owner = {};
    const received: number[] = [];

    NotificationTransaction.enqueue(owner, () => received.push(1));
    expect(received).toEqual([1]);
  });

  it("defers notifications until a successful transaction commits", () => {
    const owner = {};
    const received: string[] = [];

    const result = NotificationTransaction.run(owner, () => {
      NotificationTransaction.enqueue(owner, () => received.push("first"));
      NotificationTransaction.enqueue(owner, () => received.push("second"));
      expect(received).toEqual([]);
      return 42;
    });

    expect(result).toBe(42);
    expect(received).toEqual(["first", "second"]);
  });

  it("discards buffered notifications and after-commit hooks after failure", () => {
    const owner = {};
    const received: string[] = [];

    expect(() => NotificationTransaction.run(owner, () => {
      NotificationTransaction.enqueue(owner, () => received.push("mutation"));
      NotificationTransaction.afterCommit(owner, {}, () => received.push("commit"));
      throw new Error("cancelled");
    })).toThrow("cancelled");

    expect(received).toEqual([]);
  });

  it("runs deduplicated after-commit actions before ordinary notifications", () => {
    const owner = {};
    const key = {};
    const received: string[] = [];

    NotificationTransaction.run(owner, () => {
      NotificationTransaction.enqueue(owner, () => received.push("mutation"));
      NotificationTransaction.afterCommit(owner, key, () => received.push("old"));
      NotificationTransaction.afterCommit(owner, key, () => received.push("reconcile"));
      NotificationTransaction.afterCommit(owner, {}, () => received.push("other"));
    });

    expect(received).toEqual(["reconcile", "other", "mutation"]);
  });

  it("allows an independent owner to commit while another owner is recording", () => {
    const left = {};
    const right = {};
    const received: string[] = [];

    NotificationTransaction.run(left, () => {
      NotificationTransaction.enqueue(left, () => received.push("left"));
      NotificationTransaction.run(right, () => {
        NotificationTransaction.enqueue(right, () => received.push("right"));
      });

      expect(received).toEqual(["right"]);
    });

    expect(received).toEqual(["right", "left"]);
  });

  it("folds nested same-owner operations into one outer transaction", () => {
    const owner = {};
    const received: number[] = [];

    NotificationTransaction.run(owner, () => {
      NotificationTransaction.enqueue(owner, () => received.push(1));
      NotificationTransaction.run(owner, () => {
        NotificationTransaction.enqueue(owner, () => received.push(2));
      });
      expect(received).toEqual([]);
    });

    expect(received).toEqual([1, 2]);
  });

  it("publishes partial changes on explicitly marked incomplete rollback", () => {
    const owner = {};
    const received: number[] = [];

    expect(() => NotificationTransaction.run(owner, () => {
      NotificationTransaction.enqueue(owner, () => received.push(1));
      NotificationTransaction.publishOnFailure(owner);
      throw new Error("rollback failed");
    })).toThrow("rollback failed");

    expect(received).toEqual([1]);
  });

  it("keeps processing when a published observer throws", () => {
    const owner = {};
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    const received: number[] = [];

    try {
      NotificationTransaction.run(owner, () => {
        NotificationTransaction.enqueue(owner, () => {
          throw new Error("observer broke");
        });
        NotificationTransaction.enqueue(owner, () => received.push(2));
      });
      expect(received).toEqual([2]);
      expect(logger).toHaveBeenCalled();
    } finally {
      logger.mockRestore();
    }
  });

  it("does not recursively interrupt current delivery when a listener enqueues", () => {
    const owner = {};
    const received: number[] = [];

    NotificationTransaction.enqueue(owner, () => {
      received.push(1);
      NotificationTransaction.enqueue(owner, () => received.push(3));
      received.push(2);
    });

    expect(received).toEqual([1, 2, 3]);
  });
});
