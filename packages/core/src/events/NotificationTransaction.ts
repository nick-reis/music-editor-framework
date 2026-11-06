type Delivery = () => void;

type Frame = {
  readonly owner: object;
  readonly notifications: Delivery[];
  readonly afterCommit: Map<object, Delivery>;
  publishOnFailure: boolean;
};

/**
 * Isolates external notifications until an owning workspace's history operation
 * commits. Model-to-model propagation remains synchronous.
 */
export class NotificationTransaction {
  private static readonly frames: Frame[] = [];
  private static readonly queue: Delivery[] = [];
  private static dispatching = false;

  static run<R>(owner: object | null, operation: () => R): R {
    if (owner === null || this.find(owner)) {
      return operation();
    }

    const frame: Frame = {
      owner,
      notifications: [],
      afterCommit: new Map(),
      publishOnFailure: false,
    };

    this.frames.push(frame);
    let succeeded = false;

    try {
      const result = operation();
      succeeded = true;
      return result;
    } finally {
      this.frames.pop();

      if (succeeded || frame.publishOnFailure) {
        this.publish([
          ...frame.afterCommit.values(),
          ...frame.notifications,
        ]);
      }
    }
  }

  static enqueue(owner: object | null, delivery: Delivery): void {
    const frame = owner === null ? undefined : this.find(owner);

    if (frame) {
      frame.notifications.push(delivery);
    } else {
      this.publish([delivery]);
    }
  }

  static afterCommit(
    owner: object | null,
    key: object,
    action: Delivery,
  ): void {
    const frame = owner === null ? undefined : this.find(owner);

    if (frame) {
      // Reconcile a given derived-state owner at most once per transaction.
      frame.afterCommit.set(key, action);
    } else {
      this.publish([action]);
    }
  }

  static publishOnFailure(owner: object | null): void {
    if (owner === null) return;

    const frame = this.find(owner);
    if (frame) frame.publishOnFailure = true;
  }

  private static find(owner: object): Frame | undefined {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (this.frames[i].owner === owner) {
        return this.frames[i];
      }
    }

    return undefined;
  }

  private static publish(deliveries: readonly Delivery[]): void {
    this.queue.push(...deliveries);

    if (this.dispatching) return;

    this.dispatching = true;
    let index = 0;

    try {
      while (index < this.queue.length) {
        const deliver = this.queue[index++];

        try {
          deliver();
        } catch (error) {
          console.error("Notification delivery failed:", error);
        }
      }
    } finally {
      this.queue.length = 0;
      this.dispatching = false;
    }
  }
}
