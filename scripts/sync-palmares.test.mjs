import { describe, expect, it } from "vitest";
import { standingsRowProblem, validateStandings } from "./sync-palmares.mjs";

/** A standings row as `parseCurrentStandings` emits it. */
function row(name, played, wins, draws, losses, points) {
  return { name, position: 1, played, wins, draws, losses, gf: 10, ga: 5, gd: 5, points, ptnPerMatch: 0 };
}

describe("standingsRowProblem", () => {
  it("accepts a row that adds up", () => {
    expect(standingsRowProblem(row("VT 09", 3, 3, 0, 0, 9))).toBeNull();
    expect(standingsRowProblem(row("04United", 3, 2, 0, 1, 6))).toBeNull();
  });

  it("accepts the all-zero table LZV serves before the opener", () => {
    expect(standingsRowProblem(row("Jan Breydel", 0, 0, 0, 0, 0))).toBeNull();
  });

  it("rejects a row whose played count does not match W+D+L", () => {
    expect(standingsRowProblem(row("X", 4, 3, 0, 0, 9))).toMatch(/played/);
  });

  it("rejects a row whose points do not match 3W+D", () => {
    expect(standingsRowProblem(row("X", 3, 3, 0, 0, 7))).toMatch(/points/);
  });

  it("catches a one-column shift", () => {
    // An extra leading number moves every field one place: played lands in position etc.
    const shifted = { name: "X", position: 3, played: 3, wins: 3, draws: 0, losses: 0, points: 20 };
    expect(standingsRowProblem(shifted)).not.toBeNull();
  });

  it("rejects non-integer counts", () => {
    expect(standingsRowProblem(row("X", 2, 1.5, 0, 0.5, 4.5))).toMatch(/integer/);
  });
});

describe("validateStandings", () => {
  it("keeps valid rows and reports the rest", () => {
    const parsed = new Map([
      ["1", row("Good", 2, 1, 1, 0, 4)],
      ["2", row("Bad", 2, 2, 0, 0, 5)],
    ]);
    const { valid, rejected } = validateStandings(parsed);
    expect([...valid.keys()]).toEqual(["1"]);
    expect(rejected).toEqual([{ teamId: "2", name: "Bad", problem: expect.stringMatching(/points/) }]);
  });
});
