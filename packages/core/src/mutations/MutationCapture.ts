import { getOwningWorkspace } from "../internal/ModelOwnership";

export interface ReversibleMutation<TState extends object = object> {
  readonly target: object;
  readonly before: Readonly<TState>;
  readonly after: Readonly<TState>;

  undo(): void;
  redo(): void;
}

export interface MutationScope {
  readonly owner: object;
  readonly ownerOf: (target: object) => object | null;
}

type ReplayMarker = {
  consumed: boolean;
};

export class MutationCapture {
  private static readonly stack: MutationCapture[] = [];
  private static readonly replays: ReplayMarker[] = [];

  private readonly recorded: ReversibleMutation[] = [];
  private used = false;

  constructor(
    private readonly accepts: (target: object) => boolean = () => true,
    private readonly scope?: MutationScope,
  ) {}

  static get recording(): boolean {
    return MutationCapture.stack.length > 0;
  }

  static isRecording(target: object): boolean {
    return MutationCapture.resolve(target) !== null;
  }

  static assertTarget(target: object): void {
    MutationCapture.resolve(target);
  }

  static record(mutation: ReversibleMutation): void {
    const replay = MutationCapture.replays.at(-1);

    // A history replay applies one model mutation before notifying
    // observers. Consume this marker before observers can make
    // their own direct edits.
    // The first recorded mutation belongs to the replay operation itself.
    // An inverse structural transfer may record against a different container
    // than the original entry's target. All model operations record before
    // emitting observer notifications, so subsequent edits remain direct.
    if (replay && !replay.consumed) {
      replay.consumed = true;
      return;
    }

    const capture = MutationCapture.resolve(mutation.target);
    capture?.recorded.push(mutation);

    // Only a capture owned by the document makes this edit undoable.
    // Standalone captures may observe the mutation, but do not protect
    // the workspace's existing undo/redo history.
    const workspace = getOwningWorkspace(mutation.target);
    if (workspace && capture?.scope?.owner !== workspace) {
      workspace.history.invalidateOnDirectEdit();
    }
  }

  static replayChange<R>(operation: () => R): R {
    const marker: ReplayMarker = { consumed: false };

    MutationCapture.replays.push(marker);

    try {
      return operation();
    } finally {
      MutationCapture.replays.pop();
    }
  }

  get mutations(): readonly ReversibleMutation[] {
    return Object.freeze([...this.recorded]);
  }

  run<R>(operation: () => R): R {
    if (this.used) {
      throw new Error("Mutation capture has already been used");
    }

    if (
      MutationCapture.stack.some(
        (active) =>
          active.scope === undefined ||
          this.scope === undefined ||
          active.scope.owner === this.scope.owner,
      )
    ) {
      throw new Error("A mutation capture is already active for this scope");
    }

    this.used = true;
    MutationCapture.stack.push(this);

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
      MutationCapture.stack.pop();
    }
  }

  private static resolve(target: object): MutationCapture | null {
    const captures = MutationCapture.stack;
    const current = captures[captures.length - 1];

    if (!current) return null;

    if (!current.scope) {
      if (!current.accepts(target)) {
        throw new Error("Mutation target is outside the recording scope");
      }

      return current;
    }

    const owner = current.scope.ownerOf(target);

    if (owner === null) {
      throw new Error("Mutation target is outside the recording scope");
    }

    for (let index = captures.length - 1; index >= 0; index--) {
      const capture = captures[index];

      if (capture.scope?.owner !== owner) continue;

      if (!capture.accepts(target)) {
        throw new Error("Mutation target is outside the recording scope");
      }

      return capture;
    }

    return null;
  }
}
