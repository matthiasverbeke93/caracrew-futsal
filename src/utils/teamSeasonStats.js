import { countPlayerMotmWins } from "./motm.js";

/**
 * Season totals per roster player (players table: fixed + pool guests).
 * "Games played" = games with attendance status `playing`.
 * Denominator for % = all games in `games` (scheduled season games).
 */
export function buildTeamSeasonPlayerRows(
  games,
  playersWithRole,
  attendance,
  stats,
  motmVotes = [],
  nowMs = Date.now()
) {
  const totalSeasonGames = games?.length ?? 0;

  return (playersWithRole || []).map((player) => {
    let gamesPlayed = 0;
    let goals = 0;
    let assists = 0;

    for (const game of games || []) {
      const att = attendance.find(
        (a) => a.game_id === game.id && a.player_id === player.id
      );
      if (att?.status === "playing") gamesPlayed += 1;

      const st = stats.find((s) => s.game_id === game.id && s.player_id === player.id);
      if (st) {
        goals += st.goals || 0;
        assists += st.assists || 0;
      }
    }

    const pctPlayed =
      totalSeasonGames > 0 ? Math.round((gamesPlayed / totalSeasonGames) * 100) : 0;
    const involvement = goals + assists;
    const goalsPerGame = gamesPlayed > 0 ? goals / gamesPlayed : 0;
    const assistsPerGame = gamesPlayed > 0 ? assists / gamesPlayed : 0;
    const involvementPerGame = gamesPlayed > 0 ? involvement / gamesPlayed : 0;
    const motmWins = countPlayerMotmWins(player.id, games, motmVotes, nowMs);

    return {
      id: player.id,
      name: player.name,
      fixed: player.fixed,
      isGuest: player.isGuest,
      gamesPlayed,
      totalSeasonGames,
      pctPlayed,
      fairplayRank: null,
      goals,
      assists,
      goalsPerGame,
      assistsPerGame,
      involvement,
      involvementPerGame,
      motmWins,
    };
  });
}

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Build rows from a static snapshot, resolving each name to a player id when possible. */
export function buildStaticTeamSeasonRows(staticData, playersWithRole) {
  if (!staticData || !Array.isArray(staticData.rows) || staticData.rows.length === 0) {
    return [];
  }

  const playerByName = new Map(
    (playersWithRole || []).map((p) => [normalizeName(p.name), p])
  );

  const totalGamesPlayed =
    staticData.totalGamesPlayed && staticData.totalGamesPlayed > 0
      ? staticData.totalGamesPlayed
      : Math.max(0, ...staticData.rows.map((r) => Number(r.gamesPlayed) || 0));

  return staticData.rows.map((row) => {
    const matched = playerByName.get(normalizeName(row.name));
    const gamesPlayed = Number(row.gamesPlayed) || 0;
    const fairplayRank = Number(row.fairplayRank) || null;
    const goals = Number(row.goals) || 0;
    const assists = Number(row.assists) || 0;
    const involvement = goals + assists;
    const pctPlayed =
      totalGamesPlayed > 0 ? Math.round((gamesPlayed / totalGamesPlayed) * 100) : 0;

    return {
      id: matched?.id ?? `static-${normalizeName(row.name)}`,
      name: matched?.name ?? row.name,
      fixed: matched ? matched.fixed : true,
      isGuest: matched ? matched.isGuest : false,
      hasProfile: Boolean(matched),
      gamesPlayed,
      totalSeasonGames: totalGamesPlayed,
      pctPlayed,
      fairplayRank,
      goals,
      assists,
      goalsPerGame: gamesPlayed > 0 ? goals / gamesPlayed : 0,
      assistsPerGame: gamesPlayed > 0 ? assists / gamesPlayed : 0,
      involvement,
      involvementPerGame: gamesPlayed > 0 ? involvement / gamesPlayed : 0,
      motmWins: 0,
    };
  });
}

export function sortTeamSeasonRows(rows, key = "involvement") {
  const copy = [...(rows || [])];
  copy.sort((a, b) => {
    if (key === "name") {
      return a.name.localeCompare(b.name);
    }
    if (key === "fairplayRank") {
      if (a.fairplayRank == null && b.fairplayRank == null) return a.name.localeCompare(b.name);
      if (a.fairplayRank == null) return 1;
      if (b.fairplayRank == null) return -1;
      if (a.fairplayRank !== b.fairplayRank) return a.fairplayRank - b.fairplayRank;
      return a.name.localeCompare(b.name);
    }
    const va = Number(a[key]);
    const vb = Number(b[key]);
    if (vb !== va) return vb - va;
    return a.name.localeCompare(b.name);
  });
  return copy;
}
