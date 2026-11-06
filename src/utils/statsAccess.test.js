import { describe, expect, it } from "vitest";
import { canWriteStatField, statsEditScope } from "./statsAccess.js";

const gameAttendance = [
  { player_id: "me", status: "playing" },
  { player_id: "mate", status: "playing" },
  { player_id: "maybe", status: "if_needed" },
];

describe("statsEditScope", () => {
  it("gives admins and the player themself full access", () => {
    expect(statsEditScope("mate", { isAdmin: true })).toBe("full");
    expect(statsEditScope("me", { currentPlayerId: "me", gameAttendance })).toBe("full");
  });

  it("lets a player who was In edit another player who was In", () => {
    expect(statsEditScope("mate", { currentPlayerId: "me", gameAttendance })).toBe("teammate");
  });

  it("refuses when either side was not In", () => {
    expect(statsEditScope("maybe", { currentPlayerId: "me", gameAttendance })).toBe("none");
    expect(statsEditScope("mate", { currentPlayerId: "maybe", gameAttendance })).toBe("none");
    expect(statsEditScope("mate", { currentPlayerId: null, gameAttendance })).toBe("none");
  });
});

describe("canWriteStatField", () => {
  it("keeps Played for full access only", () => {
    expect(canWriteStatField("full", "played")).toBe(true);
    expect(canWriteStatField("teammate", "played")).toBe(false);
    expect(canWriteStatField("teammate", "goals")).toBe(true);
    expect(canWriteStatField("teammate", "kept_goal")).toBe(true);
    expect(canWriteStatField("none", "goals")).toBe(false);
  });
});
