import { describe, expect, it } from "vitest";
import { buildTeamSeasonPlayerRows } from "./teamSeasonStats.js";

/** `isPlayed` compares against today's local day, so fixtures are dated relative to now. */
function dayOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const PLAYERS = [{ id: "p1", name: "Ann", fixed: true, isGuest: false }];

describe("buildTeamSeasonPlayerRows · games played", () => {
  it("ignores an RSVP for a fixture that has not been played yet", () => {
    const games = [
      { id: "g-future-1", game_date: dayOffset(3) },
      { id: "g-future-2", game_date: dayOffset(10) },
      { id: "g-future-3", game_date: dayOffset(17) },
    ];
    const attendance = games.map((g) => ({ game_id: g.id, player_id: "p1", status: "playing" }));

    const [row] = buildTeamSeasonPlayerRows(games, PLAYERS, attendance, []);

    expect(row.gamesPlayed).toBe(0);
    expect(row.playedSeasonGames).toBe(0);
    expect(row.totalSeasonGames).toBe(3);
    expect(row.pctPlayed).toBeNull();
  });

  it("counts only the fixtures that have taken place", () => {
    const games = [
      { id: "g-past-1", game_date: dayOffset(-14) },
      { id: "g-past-2", game_date: dayOffset(-7) },
      { id: "g-future-1", game_date: dayOffset(7) },
    ];
    const attendance = games.map((g) => ({ game_id: g.id, player_id: "p1", status: "playing" }));

    const [row] = buildTeamSeasonPlayerRows(games, PLAYERS, attendance, []);

    expect(row.gamesPlayed).toBe(2);
    expect(row.playedSeasonGames).toBe(2);
    expect(row.totalSeasonGames).toBe(3);
    // Divided by games played so far, not the 3-fixture schedule.
    expect(row.pctPlayed).toBe(100);
  });

  it("does not count a played fixture the player was Out for", () => {
    const games = [
      { id: "g-past-1", game_date: dayOffset(-14) },
      { id: "g-past-2", game_date: dayOffset(-7) },
    ];
    const attendance = [
      { game_id: "g-past-1", player_id: "p1", status: "playing" },
      { game_id: "g-past-2", player_id: "p1", status: "cant" },
    ];

    const [row] = buildTeamSeasonPlayerRows(games, PLAYERS, attendance, []);

    expect(row.gamesPlayed).toBe(1);
    expect(row.pctPlayed).toBe(50);
  });

  it("keeps goals and assists from every stats row, played or not", () => {
    const games = [
      { id: "g-past-1", game_date: dayOffset(-7) },
      { id: "g-future-1", game_date: dayOffset(7) },
    ];
    const attendance = [{ game_id: "g-past-1", player_id: "p1", status: "playing" }];
    const stats = [{ game_id: "g-past-1", player_id: "p1", goals: 2, assists: 1 }];

    const [row] = buildTeamSeasonPlayerRows(games, PLAYERS, attendance, stats);

    expect(row.goals).toBe(2);
    expect(row.assists).toBe(1);
    expect(row.goalsPerGame).toBe(2);
    expect(row.involvementPerGame).toBe(3);
  });
});
