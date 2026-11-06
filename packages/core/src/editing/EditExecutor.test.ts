import { describe, expect, it, vi } from "vitest";
import { EditExecutor } from "./EditExecutor";
import type { EditStep } from "./EditPlan";
import { EditorHistory } from "../history/EditorHistory";
import { MutationCapture } from "../mutations/MutationCapture";
import { MidiNote } from "../elements/MidiNote";
import { GridContainer } from "../grids/GridContainer";
import { MidiGrid } from "../grids/MidiGrid";

describe("Shared atomic edit executor", () => {
  it("records a compound edit as one reversible mutation", () => {
    const owner = {};
    const state = { left: 0, right: 0 };
    const events = vi.fn();
    const history = new EditorHistory();

    function step(property: "left" | "right", value: number): EditStep {
      const before = Object.freeze({ value: state[property] });
      const after = Object.freeze({ value });
      return {
        before, after,
        targets: [owner],
        validate: (direction) => {
          expect(state[property]).toBe(
            direction === "forward" ? before.value : after.value,
          );
        },
        apply: (direction) => {
          state[property] = direction === "forward" ? after.value : before.value;
        },
        recover: (direction) => {
          state[property] = direction === "forward" ? before.value : after.value;
        },
        publish: () => events(property),
      };
    }

    history.execute("Move two", () => {
      EditExecutor.execute({
        target: owner,
        steps: [step("left", 10), step("right", 20)],
      });
    });
    expect(state).toEqual({ left: 10, right: 20 });
    expect(history.undoLabel).toBe("Move two");
    expect(events).toHaveBeenCalledTimes(2);
    history.undo();
    expect(state).toEqual({ left: 0, right: 0 });
    history.redo();
    expect(state).toEqual({ left: 10, right: 20 });
  });

  it("preflights every step before writing any state", () => {
    const owner = {};
    let touched = false;
    const publish = vi.fn();
    const history = new EditorHistory();
    expect(() => history.execute("Invalid", () => {
      EditExecutor.execute({
        target: owner,
        steps: [
          {
            before: {}, after: {},
            targets: [owner],
            validate: () => {},
            apply: () => { touched = true; },
            recover: () => { touched = false; },
            publish,
          },
          {
            before: {}, after: {},
            targets: [owner],
            validate: () => { throw new Error("Invalid destination"); },
            apply: () => { throw new Error("Should never apply"); },
            recover: () => {},
            publish,
          },
        ],
      });
    })).toThrow("Invalid destination");
    expect(touched).toBe(false);
    expect(publish).not.toHaveBeenCalled();
    expect(history.canUndo).toBe(false);
  });

  it("recovers the failing partially applied step and earlier completed steps", () => {
    const owner = {};
    const state = { first: 0, second: 0 };
    const publish = vi.fn();
    const history = new EditorHistory();
    expect(() => history.execute("Failed", () => {
      EditExecutor.execute({
        target: owner,
        steps: [
          {
            before: { first: 0 }, after: { first: 1 },
            targets: [owner],
            validate: () => {},
            apply: (direction) => {
              state.first = direction === "forward" ? 1 : 0;
            },
            recover: (direction) => {
              state.first = direction === "forward" ? 0 : 1;
            },
            publish,
          },
          {
            before: { second: 0 }, after: { second: 1 },
            targets: [owner],
            validate: () => {},
            apply: (direction) => {
              state.second = direction === "forward" ? 1 : 0;
              if (direction === "forward") throw new Error("Partial write");
            },
            recover: (direction) => {
              state.second = direction === "forward" ? 0 : 1;
            },
            publish,
          },
        ],
      });
    })).toThrow("Partial write");

    expect(state).toEqual({ first: 0, second: 0 });
    expect(publish).not.toHaveBeenCalled();
    expect(history.canUndo).toBe(false);
  });

  it("reports an incomplete recovery without masking the original error", () => {
    const owner = {};
    const history = new EditorHistory();
    expect(() => history.execute("Broken", () => {
      EditExecutor.execute({
        target: owner,
        steps: [{
          before: {}, after: {},
          targets: [owner],
          validate: () => {},
          apply: () => { throw new Error("Original failure"); },
          recover: () => { throw new Error("Recovery failure"); },
          publish: () => {},
        }],
      });
    })).toThrow(/rollback was incomplete|recovery was incomplete/);
    expect(history.canUndo).toBe(false);
  });

  it("rejects two transitions to one element in a plan before mutating", () => {
    const note = new MidiNote(0, 0, 120);
    const first = note.prepareStateUpdate({ startTick: 240 });
    const second = note.prepareStateUpdate({ durationTicks: 240 });

    expect(() => EditExecutor.execute({
      target: note,
      steps: [first, second],
    })).toThrow(/consolidate into one final snapshot/);
    expect([note.startTick, note.durationTicks]).toEqual([0, 120]);
  });

  it("allows multiple changes to one element through a consolidated snapshot", () => {
    const note = new MidiNote(0, 0, 120);
    const history = new EditorHistory();
    history.execute("Retime", () => {
      EditExecutor.execute({
        target: note,
        steps: [note.prepareStateUpdate({
          startTick: 480,
          durationTicks: 240,
          row: 2,
        })],
      });
    });

    expect([note.startTick, note.durationTicks, note.row]).toEqual([480, 240, 2]);
    history.undo();
    expect([note.startTick, note.durationTicks, note.row]).toEqual([0, 120, 0]);
    history.redo();
    expect([note.startTick, note.durationTicks, note.row]).toEqual([480, 240, 2]);
  });

  it("records actual ordered-structure snapshots, never operation metadata", () => {
    const container = new GridContainer();
    const grid = new MidiGrid([{ id: "a", label: "C4", pitch: 60 }]);
    const capture = new MutationCapture();
    capture.run(() => container.addGrid(grid));

    expect(capture.mutations).toHaveLength(1);
    expect(capture.mutations[0].before).toEqual({ children: [] });
    expect(capture.mutations[0].after).toEqual({ children: [grid] });
    expect(Object.isFrozen(capture.mutations[0].before)).toBe(true);
    expect(Object.isFrozen(capture.mutations[0].after)).toBe(true);
  });

  it("rejects manually replaying a captured edit during another capture", () => {
    const note = new MidiNote(0, 0, 120);
    const capture = new MutationCapture();
    capture.run(() => note.moveToTick(240));
    const second = new MutationCapture();
    second.run(() => {
      expect(() => capture.mutations[0].undo()).toThrow(
        /Cannot replay during mutation capture/,
      );
    });
    expect(note.startTick).toBe(240);
  });
});
