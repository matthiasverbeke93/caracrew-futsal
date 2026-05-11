/**
 * Season totals per roster player (players table: fixed + pool guests).
 * "Games played" = games with attendance status `playing`.
 * Denominator for % = all games in `games` (scheduled season games).
 */
export function buildTeamSeasonPlayerRows(games, playersWithRole, attendance, stats) {
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

    return {
      id: player.id,
      name: player.name,
      fixed: player.fixed,
      isGuest: player.isGuest,
      gamesPlayed,
      totalSeasonGames,
      pctPlayed,
      goals,
      assists,
      goalsPerGame,
      assistsPerGame,
      involvement,
      involvementPerGame,
    };
  });
}

export function sortTeamSeasonRows(rows, key = "involvement") {
  const copy = [...(rows || [])];
  copy.sort((a, b) => {
    if (key === "name") {
      return a.name.localeCompare(b.name);
    }
    const va = Number(a[key]);
    const vb = Number(b[key]);
    if (vb !== va) return vb - va;
    return a.name.localeCompare(b.name);
  });
  return copy;
}
