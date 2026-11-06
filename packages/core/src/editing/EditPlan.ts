/**
 * Internal, synchronous model-edit protocol.
 *
 * Preparing an edit is inert. Each step captures real immutable before/after
 * state. One logical edit records one mutation, regardless of step count.
 */
export type EditDirection = "forward" | "backward";

export interface EditStep {
  /** Real versioned state, not an operation description. */
  readonly before: Readonly<object>;
  readonly after: Readonly<object>;
  /** Every affected model, for history scope preflight. */
  readonly targets: readonly object[];
  /**
   * Exclusive state snapshot owner (e.g. one element or ordered collection).
   * A plan may only contain one state transition per owner; planners must
   * consolidate multiple changes into one final snapshot.
   */
  readonly stateOwner?: object;

  /** Check expected versions and domain constraints. Must not mutate. */
  validate(direction: EditDirection): void;
  /** Apply without recording or publishing. Prefer strong exception safety. */
  apply(direction: EditDirection): void;
  /**
   * Restore the pre-apply state if apply() throws, including a partial write.
   * Must also be safe if apply() failed before making any change.
   */
  recover(direction: EditDirection): void;
  /** Only called after ALL steps apply and the edit is recorded. */
  publish(direction: EditDirection): void;
}

export interface EditBatchTarget {
  batchChanges<R>(operation: () => R): R;
}

export interface EditPlan {
  readonly target: object;
  readonly steps: readonly EditStep[];
  /** Model propagation scopes, outermost first. Executor owns nesting. */
  readonly batchTargets?: readonly EditBatchTarget[];
  /** Optional semantic ordering of notifications, independent from write order. */
  readonly publish?: (direction: EditDirection) => void;
}
