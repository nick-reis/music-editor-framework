import { NotificationTransaction } from "../events/NotificationTransaction";
import { getOwningWorkspace } from "../internal/ModelOwnership";
import { MutationCapture } from "../mutations/MutationCapture";
import type { EditDirection, EditPlan, EditStep } from "./EditPlan";

/**
 * Single model-edit coordinator; does not own a history stack or document copy.
 */
export class EditExecutor {
  private constructor() {}

  static execute(plan: EditPlan): void {
    if (plan.steps.length === 0) return;
    const owner = getOwningWorkspace(plan.target);

    // A logical edit must resolve each state object to ONE final snapshot.
    const stateOwners = new Set<object>();
    for (const step of plan.steps) {
      if (step.stateOwner !== undefined) {
        if (stateOwners.has(step.stateOwner)) {
          throw new Error(
            "Multiple state transitions for one model: consolidate into one final snapshot",
          );
        }
        stateOwners.add(step.stateOwner);
      }
    }

    // Scope checks must happen before any writes (including cross-grid edits).
    MutationCapture.assertTarget(plan.target);
    for (const step of plan.steps) {
      for (const target of step.targets) {
        MutationCapture.assertTarget(target);
      }
    }

    // Capture the actual immutable domain versions from the prepared steps.
    // Preserve the prior single-step shape expected by state consumers.
    const snapshot = (direction: "before" | "after"): Readonly<object> => {
      if (plan.steps.length === 1) return plan.steps[0][direction];
      return Object.freeze({
        steps: Object.freeze(plan.steps.map((step) => step[direction])),
      });
    };
    const before = snapshot("before");
    const after = snapshot("after");

    const run = (direction: EditDirection, replay: boolean): void => {
      if (replay && MutationCapture.isRecording(plan.target)) {
        throw new Error("Cannot replay during mutation capture");
      }

      const execute = (): void => {
        const ordered = direction === "forward"
          ? plan.steps
          : [...plan.steps].reverse();

        // All steps check the SAME committed source state. Compound planners
        // use distinct stateOwners and consolidate edits to a single owner.
        for (const step of ordered) step.validate(direction);

        const applied: EditStep[] = [];
        let failing: EditStep | undefined;
        try {
          for (const step of ordered) {
            failing = step;
            step.apply(direction);
            applied.push(step);
            failing = undefined;
          }

          if (!replay) {
            MutationCapture.record({
              target: plan.target,
              before,
              after,
              undo: () => run("backward", true),
              redo: () => run("forward", true),
            });
          }
        } catch (originalError) {
          const recoveryErrors: unknown[] = [];

          // The failing step may already have performed a partial write.
          if (failing) {
            try {
              failing.recover(direction);
            } catch (recoveryError) {
              recoveryErrors.push(recoveryError);
            }
          }
          const inverse: EditDirection =
            direction === "forward" ? "backward" : "forward";
          for (const step of applied.reverse()) {
            try {
              step.apply(inverse);
            } catch (recoveryError) {
              recoveryErrors.push(recoveryError);
            }
          }
          if (recoveryErrors.length > 0) {
            NotificationTransaction.publishOnFailure(owner);
            owner?.history.invalidateOnDirectEdit();
            throw new AggregateError(
              [originalError, ...recoveryErrors],
              "Atomic edit failed and recovery was incomplete",
            );
          }
          throw originalError;
        }

        if (plan.publish) {
          plan.publish(direction);
        } else {
          for (const step of ordered) step.publish(direction);
        }
      };

      NotificationTransaction.run(owner, () => {
        const runBatches = (index: number): void => {
          const scope = plan.batchTargets?.[index];
          if (scope) scope.batchChanges(() => runBatches(index + 1));
          else execute();
        };
        runBatches(0);
      });
    };

    run("forward", false);
  }
}
