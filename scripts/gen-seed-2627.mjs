// Deterministic generator for the 26-27 dummy-season seed SQL.
// Output: supabase/seed_season_2627.sql  (run in Supabase SQL editor — bypasses RLS).
// All fixtures are UPCOMING: no scores, no player_stats, no MOTM.

const SEASON = "2627";
const HOME_VENUE = "De Nekker Mechelen";
const TS = "2026-07-01T12:00:00Z"; // fixed timestamp for determinism

// ---- deterministic PRNG (mulberry32) so re-runs are byte-identical ----
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20262027);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

function slug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---- 15 opponents (16-team league). 11 real LZV names + 4 invented. ----
// strength_score ~0-100, ptn/match ~0-3, position 1..16 (Caracrew takes one slot).
const OPPONENTS = [
  { team_id: "2457", name: "Hattrick",           venue: "Sporthal Geerdegem",       pos: 1,  ptn: 2.6, str: 84.1, venueTime: "22:00:00" },
  { team_id: "2217", name: "Los Dollos",         venue: "De Nekker Mechelen",       pos: 2,  ptn: 2.4, str: 71.3 },
  { team_id: "439",  name: "FC Tzit Ni Mee",     venue: "Sporthal Battel",          pos: 3,  ptn: 2.1, str: 58.9 },
  { team_id: "437",  name: "FC De Planeet",      venue: "Sporthal Caputsteen",      pos: 4,  ptn: 2.0, str: 54.2 },
  { team_id: "2216", name: "Futsal Opsinjoor",   venue: "De Nekker Mechelen",       pos: 5,  ptn: 1.9, str: 51.7 },
  { team_id: "884",  name: "ZVC Tigers",         venue: "Heiveld St-Katelijne-Waver", pos: 6, ptn: 1.7, str: 47.0 },
  { team_id: "997",  name: "FC Tripel",          venue: "Sporthal Tervuursesteenweg", pos: 7, ptn: 1.6, str: 43.8 },
  { team_id: "9001", name: "ZVC De Mechelaars",  venue: "Sporthal Nekkerspoel",     pos: 8,  ptn: 1.4, str: 39.5 },
  { team_id: "1319", name: "Wille ma ni kunne",  venue: "Sporthal Auwegem",         pos: 9,  ptn: 1.2, str: 33.1 },
  { team_id: "9002", name: "FC Den Dorst",       venue: "Sporthal Rijmenam",        pos: 10, ptn: 1.1, str: 29.7 },
  { team_id: "1784", name: "VV Schemerboyz",     venue: "Sporthal Bonheiden",       pos: 11, ptn: 0.9, str: 24.6 },
  { team_id: "9003", name: "Futsal Katelijne",   venue: "Heiveld St-Katelijne-Waver", pos: 12, ptn: 0.8, str: 21.0 },
  { team_id: "1785", name: "04United",           venue: "Sporthal Willebroek",      pos: 13, ptn: 0.6, str: 15.4 },
  { team_id: "9004", name: "De Zaalduivels",     venue: "Sporthal Duffel",          pos: 14, ptn: 0.5, str: 12.2 },
  { team_id: "2226", name: "De Karpervissers",   venue: "Sporthal Putte",           pos: 15, ptn: 0.4, str: 8.3 },
];

// short plausible history per opponent (one prior season)
function historyFor(o) {
  const wins = Math.round(o.ptn * 8);
  const losses = Math.max(0, 22 - wins - 3);
  return [{
    season: "2025-2026",
    reeks: "5e Klasse Mechelen",
    position: o.pos,
    wins, draws: 3, losses,
    goals_for: 90 + Math.round(o.str),
    goals_against: 180 - Math.round(o.str),
  }];
}

// ---- schedule: double round-robin, weekly Thursdays, Sept 2026 -> May 2027 ----
function isHoliday(d) {
  const iso = d.toISOString().slice(0, 10);
  // Christmas/New Year, krokus (mid-Feb), Easter breaks
  if (iso >= "2026-12-21" && iso <= "2027-01-04") return true;
  if (iso >= "2027-02-15" && iso <= "2027-02-21") return true;
  if (iso >= "2027-03-29" && iso <= "2027-04-11") return true;
  return false;
}

// first Thursday on/after 2026-09-08
function firstThursday() {
  const d = new Date(Date.UTC(2026, 8, 8)); // Sep 8 2026
  while (d.getUTCDay() !== 4) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

// Round 1: home vs each opponent (De Nekker). Round 2: away at opponent venue.
// Order round 2 differently so it isn't a mirror.
const round1 = OPPONENTS.map((o) => ({ o, home: true }));
const round2 = [...OPPONENTS].reverse().map((o) => ({ o, home: false }));
const fixtures = [...round1, ...round2]; // 30

const dates = [];
{
  const d = firstThursday();
  while (dates.length < fixtures.length) {
    if (!isHoliday(d)) dates.push(new Date(d));
    d.setUTCDate(d.getUTCDate() + 7);
  }
}

const games = fixtures.map((f, i) => {
  const date = dates[i].toISOString().slice(0, 10);
  const time = f.home ? "21:00:00" : (f.o.venueTime || "22:00:00");
  const hhmm = time.slice(0, 5).replace(":", "");
  const id = `${SEASON}-${date}-${hhmm}-${slug(f.o.name)}`;
  const location = f.home ? HOME_VENUE : f.o.venue;
  const title = f.home
    ? `K Caracrew SK vs ${f.o.name}`
    : `${f.o.name} vs K Caracrew SK`;
  return { id, opponent: f.o.name, game_date: date, game_time: time, location, title, home: f.home };
});

// ---- roster (fixed players) ----
const ROSTER = [
  { id: "9", name: "Koen Heeren" },
  { id: "13", name: "Matthias Verbeke" },
  { id: "3", name: "Stef Claes" },
  { id: "20", name: "Steven Vits" },
  { id: "116", name: "Evert Van Trappen" },
  { id: "10", name: "David Goossens" },
  { id: "15", name: "Sander Bortier" },
  { id: "7", name: "Lennart Drossaert" },
  { id: "301", name: "Yannick Drossaert" },
  { id: "62", name: "Moises Godeau" },
  { id: "5", name: "Laurens Van Steenbergen" },
  { id: "6", name: "Cédric Vaessen" },
];

// Seed RSVPs for the earliest 6 upcoming games (attendance viewing/editing surface).
const RSVP_GAMES = 6;
const attendance = [];
for (let gi = 0; gi < RSVP_GAMES; gi++) {
  const g = games[gi];
  for (const p of ROSTER) {
    const r = rand();
    // ~15% no RSVP, ~65% playing, ~12% if_needed, ~8% cant
    if (r < 0.15) continue;
    let status = "playing";
    if (r >= 0.85 && r < 0.97) status = "if_needed";
    else if (r >= 0.97) status = "cant";
    attendance.push({ game_id: g.id, player_id: p.id, status });
  }
}

// A couple of ad-hoc guests on the first two games.
const GUEST_NAMES = ["Tom De Gast", "Wout Pauwels", "Nils Verhaegen"];
const guests = [
  { id: `guest-${SEASON}-1`, game_id: games[0].id, name: GUEST_NAMES[0], status: "playing" },
  { id: `guest-${SEASON}-2`, game_id: games[0].id, name: GUEST_NAMES[1], status: "if_needed" },
  { id: `guest-${SEASON}-3`, game_id: games[1].id, name: GUEST_NAMES[2], status: "playing" },
];

// ---- emit SQL ----
const L = [];
L.push("-- Seed the 26-27 season with dummy data (16-team league, all fixtures UPCOMING).");
L.push("-- Generated by scripts/gen-seed-2627 — run in the Supabase SQL editor (bypasses RLS).");
L.push("-- Idempotent: clears any existing 2627 rows first, then re-inserts. Safe to re-run.");
L.push("-- NOTE: today is pre-season, so every fixture is in the future => shows as 'upcoming'.");
L.push("--       No scores/player_stats/MOTM are seeded (those belong to played games).");
L.push("");
L.push("begin;");
L.push("");
L.push("-- 1) Clear existing 2627 rows (dependents first).");
L.push("delete from motm_votes   where game_id in (select id from games where season_slug = '2627');");
L.push("delete from player_stats where game_id in (select id from games where season_slug = '2627');");
L.push("delete from attendance   where game_id in (select id from games where season_slug = '2627');");
L.push("delete from guest_players where game_id in (select id from games where season_slug = '2627');");
L.push("delete from games          where season_slug = '2627';");
L.push("delete from opponent_strength where season_slug = '2627';");
L.push("");

L.push("-- 2) League table (15 opponents; 16 teams incl. Caracrew).");
L.push("insert into opponent_strength (season_slug, team_id, name, current_position, current_ptn_per_match, history, strength_score) values");
L.push(OPPONENTS.map((o) =>
  `  (${q(SEASON)}, ${q(o.team_id)}, ${q(o.name)}, ${o.pos}, ${o.ptn.toFixed(2)}, ${q(JSON.stringify(historyFor(o)))}::jsonb, ${o.str.toFixed(2)})`
).join(",\n") + ";");
L.push("");

L.push(`-- 3) Fixtures: ${games.length}-game double round-robin, ${games[0].game_date} .. ${games[games.length-1].game_date}.`);
L.push("insert into games (id, season_slug, opponent, game_date, game_time, location, title) values");
L.push(games.map((g) =>
  `  (${q(g.id)}, ${q(SEASON)}, ${q(g.opponent)}, ${q(g.game_date)}, ${q(g.game_time)}, ${q(g.location)}, ${q(g.title)})`
).join(",\n") + ";");
L.push("");

L.push(`-- 4) RSVPs for the first ${RSVP_GAMES} fixtures (attendance surface for upcoming games).`);
L.push("insert into attendance (game_id, player_id, status, updated_at) values");
L.push(attendance.map((a) =>
  `  (${q(a.game_id)}, ${q(a.player_id)}, ${q(a.status)}, ${q(TS)})`
).join(",\n") + ";");
L.push("");

L.push("-- 5) A few ad-hoc guests on the opening fixtures.");
L.push("insert into guest_players (id, game_id, source_player_id, name, status, goals, assists) values");
L.push(guests.map((g) =>
  `  (${q(g.id)}, ${q(g.game_id)}, null, ${q(g.name)}, ${q(g.status)}, 0, 0)`
).join(",\n") + ";");
L.push("");
L.push("commit;");
L.push("");

process.stdout.write(L.join("\n"));

// summary to stderr
console.error(`games: ${games.length}, opponents: ${OPPONENTS.length}, attendance: ${attendance.length}, guests: ${guests.length}`);
console.error(`first: ${games[0].game_date} ${games[0].game_time} vs ${games[0].opponent} @ ${games[0].location}`);
console.error(`last:  ${games[games.length-1].game_date} ${games[games.length-1].game_time} vs ${games[games.length-1].opponent} @ ${games[games.length-1].location}`);
