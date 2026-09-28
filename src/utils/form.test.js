import { describe, expect, it } from "vitest";
import { getRecentForm } from "./form.js";

const past = (date, us, them) => ({ id: date, game_date: date, home_score: us, away_score: them });

describe("getRecentForm", () => {
  it("returns [] for no games", () => {
    expect(getRecentForm([])).toEqual([]);
    expect(getRecentForm(undefined)).toEqual([]);
  });

  it("lists played games most recent first, from our side (home_score = us)", () => {
    const games = [past("2020-01-01", 3, 1), past("2020-01-08", 1, 4), past("2020-01-15", 2, 2)];
    expect(getRecentForm(games).map((f) => f.result)).toEqual(["D", "L", "W"]);
  });

  it("marks a played game without a final score as '?' and skips future games", () => {
    const games = [past("2020-01-01", null, null), { id: "f", game_date: "2999-01-01", home_score: 5, away_score: 0 }];
    expect(getRecentForm(games)).toEqual([{ result: "?", game: games[0] }]);
  });

  it("caps at n", () => {
    const games = Array.from({ length: 7 }, (_, i) => past(`2020-01-0${i + 1}`, 1, 0));
    expect(getRecentForm(games, 3)).toHaveLength(3);
    expect(getRecentForm(games, 3)[0].game.game_date).toBe("2020-01-07");
  });
});
