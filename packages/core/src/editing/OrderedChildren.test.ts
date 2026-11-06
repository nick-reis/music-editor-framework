import { describe, expect, it, vi } from "vitest";
import { OrderedChildren } from "./OrderedChildren";
import { EditExecutor } from "./EditExecutor";

type Item = { id: string };

describe("Atomic structural recovery", () => {
  it("reverses a partially successful attachment even if the snapshot never changed", () => {
    const attached = new Set<Item>();
    const child: Item = { id: "child" };
    const published = vi.fn();
    const children = new OrderedChildren<Item>({
      isAttached: (item) => attached.has(item),
      attach: (item) => {
        attached.add(item);
        throw new Error("Attach failed after ownership write");
      },
      detach: (item) => { attached.delete(item); },
      subscribe: () => () => {},
      validateRemove: () => {},
      added: published, removed: published, reordered: published,
    });

    expect(() => EditExecutor.execute({
      target: {},
      steps: [children.prepareInsert(child, 0)],
    })).toThrow("Attach failed after ownership write");

    expect(attached.has(child)).toBe(false);
    expect(children.get(child.id)).toBeUndefined();
    expect(children.state.children).toEqual([]);
    expect(published).not.toHaveBeenCalled();
  });

  it("reattaches a child when detach throws after removing ownership", () => {
    const attached = new Set<Item>();
    const child: Item = { id: "child" };
    const published = vi.fn();
    let failDetach = false;
    const children = new OrderedChildren<Item>({
      isAttached: (item) => attached.has(item),
      attach: (item) => { attached.add(item); },
      detach: (item) => {
        attached.delete(item);
        if (failDetach) throw new Error("Detach failed after ownership write");
      },
      subscribe: () => () => {},
      validateRemove: () => {},
      added: published, removed: published, reordered: published,
    });
    children.hydrate(child);
    published.mockClear();
    failDetach = true;

    expect(() => EditExecutor.execute({
      target: {},
      steps: [children.prepareRemove(child)],
    })).toThrow("Detach failed after ownership write");

    expect(attached.has(child)).toBe(true);
    expect(children.get(child.id)).toBe(child);
    expect(children.state.children).toEqual([child]);
    expect(published).not.toHaveBeenCalled();
  });
});
