// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildLzvBookmarklet, matchLzvRows, runLzvFill } from "./lzvFill";

// Saved copies of the three LZV wizard steps (24/09/2026 vs VV Schemerboyz), scripts/nav/token stripped.
const fixture = (n) => readFileSync(join(cwd(), "src/utils/__fixtures__", `lzv-step${n}.html`), "utf8");
const CFG = { url: "https://example.supabase.co", key: "anon" };

function loadPage(n) {
  document.documentElement.innerHTML = new DOMParser()
    .parseFromString(fixture(n), "text/html")
    .documentElement.innerHTML;
}

/** Fake Supabase REST: route by table name. */
function mockDb({ game, stats = [], guests = [], players = [] }) {
  globalThis.fetch = vi.fn(async (url) => {
    const table = /\/rest\/v1\/(\w+)/.exec(url)[1];
    const body = { games: game ? [game] : [], player_stats: stats, guest_players: guests, players }[table];
    return { ok: true, json: async () => body, text: async () => "" };
  });
}

const GAME = { id: "g1", opponent: "VV Schemerboyz", game_date: "2026-09-24", home_score: 3, away_score: 8 };
const input = (name) => document.querySelector(`input[name="${name}"]`);
const panel = () => document.getElementById("caracrew-lzv-fill")?.textContent || "";

describe("matchLzvRows", () => {
  const lzv = [
    { id: "1", name: "Stef Claes" },
    { id: "2", name: "Lennart Drossaert" },
    { id: "3", name: "Yannick Drossaert" },
    { id: "4", name: "Cédric Vaessen" },
  ];
  it("matches exact names, ignoring accents and case", () => {
    const { matches, unmatched } = matchLzvRows(lzv, [{ name: "cedric vaessen" }]);
    expect(matches.map((m) => m.lzvId)).toEqual(["4"]);
    expect(unmatched).toEqual([]);
  });
  it("falls back to a unique first or last name", () => {
    const { matches } = matchLzvRows(lzv, [{ name: "Stef" }, { name: "Vaessen" }]);
    expect(matches.map((m) => m.lzvId)).toEqual(["1", "4"]);
  });
  it("refuses an ambiguous partial name", () => {
    const { matches, unmatched } = matchLzvRows(lzv, [{ name: "Drossaert" }]);
    expect(matches).toEqual([]);
    expect(unmatched).toHaveLength(1);
  });
  it("lets an exact name win over an earlier partial one", () => {
    const { matches, unmatched } = matchLzvRows(lzv, [{ name: "Drossaert" }, { name: "Yannick Drossaert" }]);
    expect(matches).toEqual([{ lzvId: "3", lzvName: "Yannick Drossaert", ours: { name: "Yannick Drossaert" } }]);
    // And the partial one is NOT pushed onto the only Drossaert left over.
    expect(unmatched).toEqual([{ name: "Drossaert" }]);
  });
});

describe("runLzvFill on the Ploeg step", () => {
  beforeEach(() => loadPage(2));

  it("sets every row from the app and reports who is not on the LZV list", async () => {
    mockDb({
      game: GAME,
      stats: [
        { player_id: "p1", goals: 2, assists: 0, played: true, kept_goal: false },
        { player_id: "p2", goals: 0, assists: 1, played: true, kept_goal: true },
        { player_id: "p3", goals: 5, assists: 5, played: false, kept_goal: false },
      ],
      players: [
        { id: "p1", name: "Stef" },
        { id: "p2", name: "Steven Vits" },
        { id: "p3", name: "Koen Heeren" },
      ],
      guests: [{ name: "Some Guest", goals: 1, assists: 0, kept_goal: false }],
    });
    await runLzvFill(CFG, matchLzvRows);

    // Stef Claes (208249) was unticked on LZV; the app says he played and scored 2.
    expect(input("player[208249]").checked).toBe(true);
    expect(input("goal[208249]").value).toBe("2");
    // Steven Vits kept goal.
    const vits = [...document.querySelectorAll("label.form-check-label")].find((l) =>
      l.textContent.includes("Steven Vits")
    );
    const vitsId = /\[(\d+)\]/.exec(vits.closest(".row").querySelector('input[name^="player["]').name)[1];
    expect(input(`keeper[${vitsId}]`).checked).toBe(true);
    expect(input(`assist[${vitsId}]`).value).toBe("1");
    // Sander Bortier (208248) was prefilled as played with 1 goal; not in the app → cleared.
    expect(input("player[208248]").checked).toBe(false);
    expect(input("goal[208248]").value).toBe("0");
    // The previous keeper (208252) is cleared too.
    expect(input("keeper[208252]").checked).toBe(false);
    // Koen Heeren has a stats row but played=false → not ticked.
    expect(panel()).not.toContain("Koen Heeren");

    expect(panel()).toContain("Filled 2 players");
    expect(panel()).toContain("Some Guest");
    expect(panel()).toContain("1 goal(s) not entered");
    // 2 + 1 (guest) = 3 = the final score → no goals warning.
    expect(panel()).not.toContain("add up to");
  });

  it("warns when the players' goals do not add up to the final score", async () => {
    mockDb({
      game: GAME,
      stats: [{ player_id: "p1", goals: 1, assists: 0, played: true, kept_goal: false }],
      players: [{ id: "p1", name: "Stef Claes" }],
    });
    await runLzvFill(CFG, matchLzvRows);
    expect(panel()).toContain("add up to 1, the final score says 3");
  });

  it("changes nothing when the app has no stats yet", async () => {
    mockDb({ game: GAME });
    await runLzvFill(CFG, matchLzvRows);
    expect(input("player[208248]").checked).toBe(true);
    expect(panel()).toContain("No stats entered");
  });

  it("looks the fixture up by the date on the page", async () => {
    mockDb({ game: GAME });
    await runLzvFill(CFG, matchLzvRows);
    expect(fetch.mock.calls[0][0]).toContain("games?game_date=eq.2026-09-24");
  });
});

describe("runLzvFill on the Uitslag step", () => {
  beforeEach(() => loadPage(1));

  it("leaves an already-set score alone and says so when it agrees", async () => {
    mockDb({ game: GAME });
    await runLzvFill(CFG, matchLzvRows);
    expect(input("score1").value).toBe("3");
    expect(panel()).toContain("already set");
    expect(panel()).not.toContain("differs");
  });

  it("warns when LZV's score differs from the app", async () => {
    mockDb({ game: { ...GAME, home_score: 4 } });
    await runLzvFill(CFG, matchLzvRows);
    expect(input("score1").value).toBe("3");
    expect(panel()).toContain("LZV 3, app 4");
  });

  it("fills blank scores, our goals against our team's name", async () => {
    for (const el of document.querySelectorAll("#score1, #score2, input[name^=score]")) el.value = "";
    mockDb({ game: GAME });
    await runLzvFill(CFG, matchLzvRows);
    expect(input("score1").value).toBe("3"); // K Caracrew SK row
    expect(input("score2").value).toBe("8"); // VV Schemerboyz row
    expect(document.getElementById("score2").value).toBe("8");
    expect(panel()).toContain("(filled)");
  });
});

describe("the bookmarklet", () => {
  it("is self-contained: the serialised URL runs on its own", async () => {
    loadPage(1);
    mockDb({ game: GAME });
    const href = buildLzvBookmarklet(CFG);
    expect(href.startsWith("javascript:")).toBe(true);
    const code = decodeURIComponent(href.slice("javascript:".length)).replace(/^void /, "return ");
    await new Function(code)();
    expect(panel()).toContain("already set");
  });

  it("points the user at the form on the Fairplay step", async () => {
    loadPage(3);
    mockDb({ game: GAME });
    await runLzvFill(CFG, matchLzvRows);
    expect(panel()).toContain("Open the LZV result form");
    expect(fetch).not.toHaveBeenCalled();
  });
});
