import { NotificationTransaction } from "./NotificationTransaction";

export type Unsubscribe = () => void;

export type ChangeListener<T> = (change: Readonly<T>) => void;

type Subscription<T> = {
  readonly listener: ChangeListener<T>;
  readonly token: object;
};

/**
 * Internal model listeners propagate synchronously. External subscribers are
 * delivered only after the owning workspace's transaction commits.
 */
export class ChangeEmitter<T> {
  private readonly listeners = new Map<ChangeListener<T>, object>();
  private readonly internalListeners = new Set<ChangeListener<T>>();
  private readonly queue: T[] = [];
  private dispatching = false;

  constructor(
    private readonly owner: () => object | null = () => null,
  ) {}

  subscribe(listener: ChangeListener<T>): Unsubscribe {
    if (!this.listeners.has(listener)) {
      this.listeners.set(listener, {});
    }

    const token = this.listeners.get(listener)!;

    return () => {
      if (this.listeners.get(listener) === token) {
        this.listeners.delete(listener);
      }
    };
  }

  /** @internal Used only for model-to-model forwarding. */
  subscribeInternal(listener: ChangeListener<T>): Unsubscribe {
    this.internalListeners.add(listener);

    return () => {
      this.internalListeners.delete(listener);
    };
  }

  emit(change: T): void {
    this.queue.push(change);

    if (this.dispatching) return;

    this.dispatching = true;
    let index = 0;

    try {
      while (index < this.queue.length) {
        const current = this.queue[index++];

        for (const listener of [...this.internalListeners]) {
          try {
            listener(current);
          } catch (error) {
            console.error("Change listener failed:", error);
          }
        }

        const subscribers: Subscription<T>[] = [...this.listeners].map(
          ([listener, token]) => ({ listener, token }),
        );

        if (subscribers.length === 0) continue;

        NotificationTransaction.enqueue(this.owner(), () => {
          // Check subscription status when delivery begins, not between
          // callbacks: preserve per-event listener snapshot semantics while
          // still skipping listeners removed before the transaction commits.
          const active = subscribers.filter(
            ({ listener, token }) => this.listeners.get(listener) === token,
          );

          for (const { listener } of active) {
            try {
              listener(current);
            } catch (error) {
              console.error("Change listener failed:", error);
            }
          }
        });
      }
    } finally {
      this.queue.length = 0;
      this.dispatching = false;
    }
  }
}
