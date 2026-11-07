import { describe, expect, it } from "vitest";

import { splitCentsDeterministic, toCents } from "@/lib/split";

describe("splitCentsDeterministic", () => {
  it("splits evenly when divisible", () => {
    const result = splitCentsDeterministic(6000, ["sam", "sarah", "mom"]);
    expect(result).toEqual({ sam: 2000, sarah: 2000, mom: 2000 });
  });

  it("distributes remainder cents deterministically", () => {
    const result = splitCentsDeterministic(100, ["sam", "sarah", "mom"]);
    expect(result).toEqual({ sam: 34, sarah: 33, mom: 33 });
  });

  it("converts decimal dollars to cents", () => {
    expect(toCents(19.99)).toBe(1999);
  });
});
