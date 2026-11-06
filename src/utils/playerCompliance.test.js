import { describe, expect, it } from "vitest";
import { computePersonalComplianceScores, ownSaveAt } from "./playerCompliance.js";

const DAY = 24 * 60 * 60 * 1000;
const game = { id: "g", game_date: "2026-10-01", game_time: "21:00:00" };
const kick = new Date("2026-10-01T21:00:00").getTime();
const iso = (ms) => new Date(ms).toISOString();
const asOf = kick + 30 * DAY;

function score({ attSelf, attUpdated, statSelf, statUpdated, goals = 1 }) {
  const attendance = [{ game_id: "g", player_id: "p", status: "playing", updated_at: attUpdated, self_updated_at: attSelf }];
  const stats = [{ game_id: "g", player_id: "p", goals, assists: 0, played: true, updated_at: statUpdated, self_updated_at: statSelf }];
  return computePersonalComplianceScores([game], attendance, stats, "p", asOf);
}

describe("on-time scores count only the player's own saves", () => {
  it("credits a player who answered and filled stats in on time themselves", () => {
    const s = score({
      attSelf: iso(kick - 10 * DAY), attUpdated: iso(kick - 10 * DAY),
      statSelf: iso(kick + DAY), statUpdated: iso(kick + DAY),
    });
    expect(s.rsvpOnTimePct).toBe(100);
    expect(s.statsOnTimePct).toBe(100);
  });

  it("gives no credit when an admin or teammate filled the rows in", () => {
    const s = score({
      attSelf: null, attUpdated: iso(kick - 10 * DAY),
      statSelf: null, statUpdated: iso(kick + DAY),
    });
    expect(s.rsvpOnTimePct).toBe(0);
    expect(s.statsOnTimePct).toBe(0);
  });

  it("gives no empty-row grace for a 0/0 row someone else created", () => {
    const s = score({ attSelf: null, attUpdated: null, statSelf: null, statUpdated: iso(kick + DAY), goals: 0 });
    expect(s.statsOnTimePct).toBe(0);
  });

  it("keeps the player's own on-time save when someone corrects the row later", () => {
    const s = score({
      attSelf: iso(kick - 10 * DAY), attUpdated: iso(kick - DAY),
      statSelf: iso(kick + DAY), statUpdated: iso(kick + 5 * DAY),
    });
    expect(s.rsvpOnTimePct).toBe(100);
    expect(s.statsOnTimePct).toBe(100);
  });
});

describe("ownSaveAt", () => {
  it("falls back to updated_at for rows loaded before the migration", () => {
    expect(ownSaveAt({ updated_at: "x" })).toBe("x");
    expect(ownSaveAt({ updated_at: "x", self_updated_at: null })).toBe(null);
    expect(ownSaveAt(undefined)).toBe(null);
  });
});
