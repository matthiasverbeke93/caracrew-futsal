import { describe, expect, it } from "vitest";
import { getGoalkeeperSummary, goalkeeperNames } from "./goalkeeper.js";

const p = (id, isGoalkeeper = false) => ({ id, name: `Player ${id}`, isGoalkeeper });

/** statusOf built from a plain {playerId: status} map. */
const statusFrom = (map) => (player) => map[player.id] ?? null;

describe("getGoalkeeperSummary", () => {
  it("reports no keeper known when nobody is flagged", () => {
    const s = getGoalkeeperSummary([p("a"), p("b")], statusFrom({ a: "playing" }));
    expect(s.anyKeeperKnown).toBe(false);
    expect(s.hasKeeper).toBe(false);
  });

  it("only counts a keeper who is In", () => {
    const players = [p("gk", true), p("field")];
    expect(getGoalkeeperSummary(players, statusFrom({ gk: "playing" })).hasKeeper).toBe(true);
    expect(getGoalkeeperSummary(players, statusFrom({ gk: "if_needed" })).hasKeeper).toBe(false);
    expect(getGoalkeeperSummary(players, statusFrom({ gk: "cant" })).hasKeeper).toBe(false);
    expect(getGoalkeeperSummary(players, statusFrom({})).hasKeeper).toBe(false);
  });

  it("buckets every flagged keeper by their answer", () => {
    const players = [p("in", true), p("standby", true), p("out", true), p("quiet", true), p("x")];
    const s = getGoalkeeperSummary(
      players,
      statusFrom({ in: "playing", standby: "if_needed", out: "cant" })
    );
    expect(s.anyKeeperKnown).toBe(true);
    expect(s.hasKeeper).toBe(true);
    expect(s.hasStandbyKeeper).toBe(true);
    expect(s.playing.map((k) => k.id)).toEqual(["in"]);
    expect(s.ifNeeded.map((k) => k.id)).toEqual(["standby"]);
    expect(s.out.map((k) => k.id)).toEqual(["out"]);
    expect(s.noReply.map((k) => k.id)).toEqual(["quiet"]);
  });

  it("survives missing inputs", () => {
    const s = getGoalkeeperSummary(undefined, undefined);
    expect(s.anyKeeperKnown).toBe(false);
    expect(s.hasKeeper).toBe(false);
    expect(s.playing).toEqual([]);
  });
});

describe("recorded (post-game) keeper", () => {
  it("records whoever kept goal, flagged keeper or not", () => {
    const players = [p("gk", true), p("field")];
    const s = getGoalkeeperSummary(players, statusFrom({}), (pl) => pl.id === "field");
    expect(s.hasRecordedKeeper).toBe(true);
    expect(s.recorded.map((k) => k.id)).toEqual(["field"]);
    // The roster check is unaffected: the flagged keeper still never said In.
    expect(s.hasKeeper).toBe(false);
  });

  it("is empty when nothing was recorded", () => {
    const s = getGoalkeeperSummary([p("gk", true)], statusFrom({ gk: "playing" }));
    expect(s.hasRecordedKeeper).toBe(false);
    expect(s.recorded).toEqual([]);
  });
});

describe("goalkeeperNames", () => {
  it("joins names and tolerates nothing", () => {
    expect(goalkeeperNames([p("a", true), p("b", true)])).toBe("Player a, Player b");
    expect(goalkeeperNames([])).toBe("");
    expect(goalkeeperNames(undefined)).toBe("");
  });
});
