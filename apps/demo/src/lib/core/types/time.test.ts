import { describe, expect, it } from "vitest";
import { TICKS_PER_QUARTER_NOTE } from "./time";

describe("core time types", () => {
  it("defines the ticks-per-quarter-note resolution used by conversions", () => {
    expect(TICKS_PER_QUARTER_NOTE).toBe(480);
  });
});
