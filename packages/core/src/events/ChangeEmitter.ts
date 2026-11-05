export type Unsubscribe = () => void;

export type ChangeListener<T> = (change: Readonly<T>) => void;

export class ChangeEmitter<T> {
  private readonly listeners = new Set<ChangeListener<T>>();
  private readonly queue: T[] = [];

  private dispatching = false;

  subscribe(listener: ChangeListener<T>): Unsubscribe {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
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

        for (const listener of [...this.listeners]) {
          try {
            listener(current);
          } catch (error) {
            console.error("Change listener failed:", error);
          }
        }
      }
    } finally {
      this.queue.length = 0;
      this.dispatching = false;
    }
  }
}
