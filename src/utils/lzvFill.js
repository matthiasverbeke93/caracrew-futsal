/**
 * LZV result-form filler — the bookmarklet an admin clicks on
 * https://www.lzvcup.be/myteam/result/add/<team>/<result>/<step> after a match.
 *
 * The form is a three-step wizard, and the bookmarklet handles the first two:
 * - step 1 "Uitslag": `score1` / `score2`, each preceded by a `label.col-form-label` with the team name.
 *   Usually already filled and disabled (the referee's score); the bookmarklet only fills an empty one and
 *   warns when a filled one disagrees with ours.
 * - step 2 "Ploeg": one row per LZV team member (`<label>13&nbsp;Matthias Verbeke</label>`) with inputs
 *   `keeper[<lzvId>]`, `player[<lzvId>]`, `goal[<lzvId>]`, `assist[<lzvId>]`. Every row is set from our data.
 * - step 3 "Fairplay" is the referee rating — an opinion, left to the admin.
 * Both steps carry the fixture in the card header (`<h3>K Caracrew SK - VV Schemerboyz</h3>`,
 * `<h5>(Gespeeld op do 24/09/2026 …`). Stats come from Supabase with the public anon key (the same read
 * every visitor of the app does). It never submits — the admin reviews and presses "Volgende".
 *
 * `runLzvFill` and `matchLzvRows` are serialised with `Function.prototype.toString` into the bookmarklet,
 * so both must stay self-contained: no imports, no references to anything outside their own bodies.
 * Keep them ASCII-only (use `\p{M}` / `\s`, not literal accents or no-break spaces).
 */

/**
 * Pair LZV form rows with our stat rows by name.
 * @param {{id:string,name:string}[]} lzvRows  rows on the LZV form
 * @param {{name:string,goals:number,assists:number,keeper:boolean}[]} ours  who played, from our DB
 * @returns {{matches:{lzvId:string,lzvName:string,ours:object}[], unmatched:object[]}}
 *   `unmatched` = our players with no (unique) LZV row. LZV rows not in `matches` did not play.
 */
export function matchLzvRows(lzvRows, ours) {
  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const taken = new Set();
  const matches = [];
  const unmatched = [];
  // Uniqueness is judged against the WHOLE list, so a row already claimed by someone else never turns an
  // ambiguous partial name ("Drossaert", two on the list) into a confident guess at the other one.
  const pick = (p, test) => {
    const hits = lzvRows.filter((r) => test(norm(r.name), norm(p.name)));
    return hits.length === 1 && !taken.has(hits[0].id) ? hits[0] : null;
  };
  // Pass 1 takes exact names first, so a fuzzy guess in pass 2 can never steal an exact row.
  const pending = [];
  for (const p of ours) {
    const hit = pick(p, (l, o) => l === o);
    if (hit) {
      taken.add(hit.id);
      matches.push({ lzvId: hit.id, lzvName: hit.name, ours: p });
    } else pending.push(p);
  }
  // Pass 2: our name is a whole-word part of the LZV name ("Stef" / "Claes" -> "Stef Claes"), if unique.
  for (const p of pending) {
    const hit = pick(p, (l, o) => o !== "" && (" " + l + " ").includes(" " + o + " "));
    if (hit) {
      taken.add(hit.id);
      matches.push({ lzvId: hit.id, lzvName: hit.name, ours: p });
    } else unmatched.push(p);
  }
  return { matches, unmatched };
}

/**
 * Runs on lzvcup.be. `cfg` = { url, key } (Supabase project URL + anon key), `match` = matchLzvRows.
 * Self-contained on purpose — see the file header.
 */
export async function runLzvFill(cfg, match) {
  const PANEL_ID = "caracrew-lzv-fill";
  document.getElementById(PANEL_ID)?.remove();
  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.style.cssText =
    "position:fixed;top:12px;right:12px;z-index:99999;max-width:360px;max-height:80vh;overflow:auto;" +
    "background:#fff;color:#111;border:2px solid #146c43;border-radius:8px;padding:12px 14px;" +
    "font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)";
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const show = (html) => {
    panel.innerHTML =
      '<button type="button" style="float:right;border:0;background:none;font-size:18px;cursor:pointer" ' +
      'onclick="this.parentNode.remove()">&times;</button><strong>Caracrew &rarr; LZV</strong><br>' +
      html;
    if (!panel.isConnected) document.body.appendChild(panel);
  };
  const ul = (items) => `<ul style="margin:6px 0;padding-left:18px">${items}</ul>`;
  const warn = (html) => `<div style="color:#8a4b00;margin:6px 0">${html}</div>`;

  const form = document.querySelector("form.lzvtable");
  const playerInputs = form ? form.querySelectorAll('input[name^="player["]') : [];
  const scoreInputs = form ? form.querySelectorAll('input[name="score1"], input[name="score2"]') : [];
  if (!playerInputs.length && !scoreInputs.length) {
    show("Open the LZV result form (the <b>Uitslag</b> or <b>Ploeg</b> step), then click again.");
    return;
  }

  // --- which fixture is this? ---
  const header = document.querySelector(".card-header");
  const title = header?.querySelector("h3")?.textContent || "";
  const d = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(header?.querySelector("h5")?.textContent || "");
  if (!d) {
    show("Couldn't read the match date on this page.");
    return;
  }
  const gameDate = `${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}`;
  const opponent =
    title
      .split(/\s+-\s+/)
      .map((s) => s.trim())
      .find((s) => !/caracrew/i.test(s)) || "";

  show("Loading&hellip;");
  const api = async (path) => {
    const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json();
  };
  const simple = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  let game;
  try {
    const games = await api(
      `games?game_date=eq.${gameDate}&select=id,opponent,game_date,home_score,away_score`
    );
    const opp = simple(opponent);
    game =
      games.length === 1
        ? games[0]
        : games.find((g) => opp && (simple(g.opponent).includes(opp) || opp.includes(simple(g.opponent))));
  } catch (e) {
    show(`Couldn't load the fixture: ${esc(e.message || e)}`);
    return;
  }
  if (!game) {
    show(`No Caracrew game found on ${esc(gameDate)} vs ${esc(opponent)}.`);
    return;
  }
  const head = `${esc(game.game_date)} vs ${esc(game.opponent)}<br>`;
  const fire = (el) => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  // --- step 1: final score ---
  if (!playerInputs.length) {
    // `home_score` is always OUR goals, whichever side we played on.
    const ourGoals = game.home_score;
    const theirGoals = game.away_score;
    if (ourGoals == null || theirGoals == null) {
      show(head + "No final score stored in the app yet. Nothing changed.");
      return;
    }
    const lines = [];
    const mismatches = [];
    let filled = 0;
    for (const key of ["score1", "score2"]) {
      const label = [...form.querySelectorAll("label.col-form-label")].find((l) =>
        l.closest(".row")?.querySelector(`input[name="${key}"], #${key}`)
      );
      const team = label?.textContent.trim() || key;
      const want = /caracrew/i.test(team) ? ourGoals : theirGoals;
      // Visible box (#score1) plus, when it is disabled, the hidden input that is actually submitted.
      const els = [...form.querySelectorAll(`#${key}, input[name="${key}"]`)];
      const current = els.map((el) => el.value).find((v) => v !== "") ?? "";
      if (current === "") {
        for (const el of els) {
          el.value = String(want);
          fire(el);
        }
        filled += 1;
        lines.push(`<li>${esc(team)}: <b>${want}</b> (filled)</li>`);
      } else {
        lines.push(`<li>${esc(team)}: ${esc(current)} (already set)</li>`);
        if (String(current) !== String(want)) mismatches.push(`${esc(team)}: LZV ${esc(current)}, app ${want}`);
      }
    }
    show(
      head +
        ul(lines.join("")) +
        (mismatches.length
          ? warn(`<b>LZV's score differs from the app:</b><br>${mismatches.join("<br>")}`)
          : "") +
        (filled
          ? "Check it, then press <b>Volgende</b>."
          : "Nothing to fill. Press <b>Volgende</b>, then click again on the Ploeg step.") +
        " Nothing was submitted."
    );
    return;
  }

  // --- step 2: who played, keeper, goals, assists ---
  const rows = [];
  for (const input of playerInputs) {
    const id = /\[(\d+)\]/.exec(input.name)?.[1];
    const row = input.closest(".row");
    const label = row?.querySelector("label.form-check-label");
    if (!id || !label) continue;
    // Label is "<shirt number>&nbsp;<name>"; \s covers the no-break space.
    const name = label.textContent.replace(/\s+/g, " ").replace(/^\s*\d+\s+/, "").trim();
    rows.push({ id, name, row });
  }

  let ours;
  try {
    const gid = encodeURIComponent(game.id);
    const [stats, guests] = await Promise.all([
      api(`player_stats?game_id=eq.${gid}&select=player_id,goals,assists,played,kept_goal`),
      api(`guest_players?game_id=eq.${gid}&select=name,goals,assists,kept_goal`),
    ]);
    const played = stats.filter((s) => s.played !== false);
    const ids = played.map((s) => `"${String(s.player_id).replace(/"/g, "")}"`).join(",");
    const players = ids ? await api(`players?id=in.(${encodeURIComponent(ids)})&select=id,name`) : [];
    const nameOf = Object.fromEntries(players.map((p) => [p.id, p.name]));
    ours = [
      ...played.map((s) => ({
        name: nameOf[s.player_id] || String(s.player_id),
        goals: s.goals || 0,
        assists: s.assists || 0,
        keeper: !!s.kept_goal,
      })),
      ...guests.map((g) => ({
        name: g.name,
        goals: g.goals || 0,
        assists: g.assists || 0,
        keeper: !!g.kept_goal,
        guest: true,
      })),
    ];
  } catch (e) {
    show(`Couldn't load stats: ${esc(e.message || e)}`);
    return;
  }
  if (!ours.length) {
    show(head + "No stats entered in the app yet. Nothing changed.");
    return;
  }

  // Every row is set, so values LZV prefilled earlier cannot linger.
  const { matches, unmatched } = match(rows, ours);
  const byId = Object.fromEntries(matches.map((m) => [m.lzvId, m.ours]));
  const set = (name, apply) => {
    const el = form.querySelector(`input[name="${name}"]`);
    if (!el) return;
    apply(el);
    fire(el);
  };
  let goals = 0;
  for (const r of rows) {
    const p = byId[r.id];
    set(`player[${r.id}]`, (el) => (el.checked = !!p));
    set(`keeper[${r.id}]`, (el) => (el.checked = !!(p && p.keeper)));
    set(`goal[${r.id}]`, (el) => (el.value = String(p ? p.goals : 0)));
    set(`assist[${r.id}]`, (el) => (el.value = String(p ? p.assists : 0)));
    r.row.style.background = p ? "#e8f5ee" : "";
    if (p) goals += p.goals;
  }

  const list = matches
    .map(
      (m) =>
        `<li>${esc(m.lzvName)}${m.ours.keeper ? " (keeper)" : ""} &mdash; ${m.ours.goals}G ${m.ours.assists}A` +
        (simple(m.ours.name) !== simple(m.lzvName) ? ` <i>(app: ${esc(m.ours.name)})</i>` : "") +
        "</li>"
    )
    .join("");
  const miss = unmatched
    .map((p) => `<li>${esc(p.name)}${p.guest ? " (guest)" : ""} &mdash; ${p.goals}G ${p.assists}A</li>`)
    .join("");
  const missGoals = unmatched.reduce((n, p) => n + (p.goals || 0), 0);
  const scoreNote =
    game.home_score != null && goals + missGoals !== game.home_score
      ? warn(`Players' goals add up to ${goals + missGoals}, the final score says ${game.home_score}.`)
      : "";
  show(
    head +
      `Filled <b>${matches.length}</b> players, ${goals} goals.` +
      ul(list) +
      (miss
        ? warn(
            "<b>Not on the LZV team list &mdash; fill by hand or skip:</b>" +
              ul(miss) +
              (missGoals ? `${missGoals} goal(s) not entered.` : "")
          )
        : "") +
      scoreNote +
      "Check the green rows, then press <b>Volgende</b>. Nothing was submitted."
  );
}

/** The `javascript:` URL for the bookmark. */
export function buildLzvBookmarklet({ url, key }) {
  const cfg = JSON.stringify({ url: String(url || "").replace(/\/+$/, ""), key });
  const src = `(${runLzvFill.toString()})(${cfg},${matchLzvRows.toString()})`;
  return `javascript:${encodeURIComponent(`void ${src}`)}`;
}
