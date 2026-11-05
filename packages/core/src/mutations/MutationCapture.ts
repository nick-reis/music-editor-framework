export interface ReversibleMutation<TState extends object = object> {
  readonly target: object;
  readonly before: Readonly<TState>;
  readonly after: Readonly<TState>;

  undo(): void;
  redo(): void;
}

export class MutationCapture {
  private static active: MutationCapture | null = null;

  private readonly recorded: ReversibleMutation[] = [];
  private used = false;

  constructor(
    private readonly accepts: (target: object) => boolean = () => true,
  ) {}

  static get recording(): boolean {
    return MutationCapture.active !== null;
  }

  static assertTarget(target: object): void {
    const active = MutationCapture.active;

    if (active !== null && !active.accepts(target)) {
      throw new Error("Mutation target is outside the recording scope");
    }
  }

  static record(mutation: ReversibleMutation): void {
    MutationCapture.active?.recorded.push(mutation);
  }

  get mutations(): readonly ReversibleMutation[] {
    return Object.freeze([...this.recorded]);
  }

  run<R>(operation: () => R): R {
    if (MutationCapture.active !== null) {
      throw new Error("A mutation capture is already active");
    }

    if (this.used) {
      throw new Error("Mutation capture has already been used");
    }

    this.used = true;
    MutationCapture.active = this;

    try {
      const result = operation();

      if (
        result !== null &&
        (typeof result === "object" || typeof result === "function") &&
        "then" in result &&
        typeof result.then === "function"
      ) {
        throw new Error("Mutation capture must be synchronous");
      }

      return result;
    } finally {
      MutationCapture.active = null;
    }
  }
}
