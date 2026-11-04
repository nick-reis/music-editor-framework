export type Unsubscribe = () => void;

export type ChangeListener<T> = (change: Readonly<T>) => void;

export class ChangeEmitter<T> {
  private readonly listeners = new Set<ChangeListener<T>>();

  subscribe(listener: ChangeListener<T>): Unsubscribe {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(change: T): void {
    for (const listener of [...this.listeners]) {
      listener(change);
    }
  }
}
