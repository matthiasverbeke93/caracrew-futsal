import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { isAttendanceEditable, isPlayed } from "../utils/game";
import { getVoterKey } from "../utils/motm";

const FORCED_GUEST_NAMES = new Set(["bart moyens"]);
const FORCED_FIXED_NAMES = new Set([
  "moises godeau",
  "yannick drossaert",
  "lennart drossaert",
  "david goossens",
]);

function makeGuestId() {
  return `guest-${crypto.randomUUID()}`;
}

export function useFutsalData(seasonSlug) {
  const [games, setGames] = useState([]);
  const [players, setPlayers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [stats, setStats] = useState([]);
  const [guestPlayers, setGuestPlayers] = useState([]);
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [tab, setTab] = useState("attendance");
  const [newGuestFirstName, setNewGuestFirstName] = useState("");
  const [newGuestLastName, setNewGuestLastName] = useState("");
  const [gameFilters, setGameFilters] = useState([]);
  const [tallyError, setTallyError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [motmVotes, setMotmVotes] = useState([]);
  const [opponentStrengths, setOpponentStrengths] = useState([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const gamesRes = await supabase
        .from("games")
        .select("*")
        .eq("season_slug", seasonSlug)
        .order("game_date", { ascending: true });

      if (gamesRes.error) console.error(gamesRes.error);

      const nextGames = gamesRes.data || [];
      const gameIds = nextGames.map((g) => g.id);

      const empty = { data: [], error: null };
      const attendancePromise =
        gameIds.length > 0
          ? supabase.from("attendance").select("*").in("game_id", gameIds)
          : Promise.resolve(empty);
      const statsPromise =
        gameIds.length > 0
          ? supabase.from("player_stats").select("*").in("game_id", gameIds)
          : Promise.resolve(empty);
      const guestsPromise =
        gameIds.length > 0
          ? supabase.from("guest_players").select("*").in("game_id", gameIds)
          : Promise.resolve(empty);
      const motmPromise =
        gameIds.length > 0
          ? supabase.from("motm_votes").select("*").in("game_id", gameIds)
          : Promise.resolve(empty);

      const [playersRes, attendanceRes, statsRes, guestsRes, motmRes, strengthsRes] =
        await Promise.all([
          supabase.from("players").select("*").order("fixed", { ascending: false }),
          attendancePromise,
          statsPromise,
          guestsPromise,
          motmPromise,
          supabase.from("opponent_strength").select("*").eq("season_slug", seasonSlug),
        ]);

      if (playersRes.error) console.error(playersRes.error);
      if (attendanceRes.error) console.error(attendanceRes.error);
      if (statsRes.error) console.error(statsRes.error);
      if (guestsRes.error) console.error(guestsRes.error);
      if (motmRes.error) console.error(motmRes.error);
      if (strengthsRes.error) console.error(strengthsRes.error);

      setGames(nextGames);
      setPlayers(playersRes.data || []);
      setAttendance(attendanceRes.data || []);
      setStats(statsRes.data || []);
      setGuestPlayers(guestsRes.data || []);
      setMotmVotes(motmRes.data || []);
      setOpponentStrengths(strengthsRes.data || []);

      const firstUpcoming = nextGames.find((g) => !isPlayed(g));
      const urlGameId = new URLSearchParams(window.location.search).get("game");
      const gameFromUrl = urlGameId && nextGames.find((g) => g.id === urlGameId);

      setSelectedGameId((prevSelected) => {
        if (gameFromUrl) return gameFromUrl.id;
        if (prevSelected && nextGames.some((game) => game.id === prevSelected)) {
          return prevSelected;
        }
        return firstUpcoming?.id || nextGames[0]?.id || null;
      });
    } finally {
      setLoading(false);
    }
  }, [seasonSlug]);

  useEffect(() => {
    // Load when `seasonSlug` changes; initialises sidebar + selected game from URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch updates many list states
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!selectedGameId) return;
    const url = new URL(window.location.href);
    const player = url.searchParams.get("player");
    const teamStats = url.searchParams.get("team_stats");
    url.searchParams.set("season", seasonSlug);
    url.searchParams.set("game", selectedGameId);
    if (player) url.searchParams.set("player", player);
    if (teamStats) url.searchParams.set("team_stats", teamStats);
    window.history.replaceState({}, "", url);
  }, [selectedGameId, seasonSlug]);

  const selectedGame = useMemo(
    () => games.find((g) => g.id === selectedGameId),
    [games, selectedGameId]
  );

  const playersWithRole = useMemo(
    () =>
      players.map((player) => {
        const forcedGuest = FORCED_GUEST_NAMES.has(player.name.toLowerCase().trim());
        const forcedFixed = FORCED_FIXED_NAMES.has(player.name.toLowerCase().trim());
        const isGuest = forcedGuest || (!player.fixed && !forcedFixed);
        return {
          ...player,
          fixed: !isGuest,
          isGuest,
        };
      }),
    [players]
  );
  const sortedPlayersWithRole = useMemo(
    () =>
      [...playersWithRole].sort((a, b) => {
        if (a.isGuest !== b.isGuest) return a.isGuest ? 1 : -1;
        return a.name.localeCompare(b.name);
      }),
    [playersWithRole]
  );
  const fixedPlayers = useMemo(
    () => playersWithRole.filter((player) => player.fixed),
    [playersWithRole]
  );
  const externalPlayerPool = useMemo(
    () => playersWithRole.filter((player) => player.isGuest),
    [playersWithRole]
  );
  const gameAttendance = useMemo(
    () => attendance.filter((a) => a.game_id === selectedGameId),
    [attendance, selectedGameId]
  );
  const gameStats = useMemo(
    () => stats.filter((s) => s.game_id === selectedGameId),
    [stats, selectedGameId]
  );
  const selectedGameGuests = useMemo(
    () => guestPlayers.filter((g) => g.game_id === selectedGameId),
    [guestPlayers, selectedGameId]
  );
  const adHocGameGuests = useMemo(
    () => selectedGameGuests.filter((g) => !g.source_player_id),
    [selectedGameGuests]
  );
  const selectedGameTotals = useMemo(
    () => ({
      goals: selectedGame?.expected_goals ?? null,
      assists: selectedGame?.expected_assists ?? null,
    }),
    [selectedGame]
  );

  const allGamePlayers = useMemo(
    () => [
      ...sortedPlayersWithRole.map((player) => ({
        ...player,
        type: player.isGuest ? "guest" : "fixed",
      })),
      ...adHocGameGuests.map((player) => ({ ...player, type: "ad_hoc_guest" })),
    ],
    [adHocGameGuests, sortedPlayersWithRole]
  );

  const counts = useMemo(() => {
    let rosterPlaying = 0;
    let rosterCant = 0;
    let rosterIfNeeded = 0;
    let fixedAttendanceCount = 0;
    const fixedIds = new Set(fixedPlayers.map((p) => p.id));
    for (const a of gameAttendance) {
      if (fixedIds.has(a.player_id)) fixedAttendanceCount += 1;
      if (a.status === "playing") rosterPlaying += 1;
      else if (a.status === "cant") rosterCant += 1;
      else if (a.status === "if_needed") rosterIfNeeded += 1;
    }

    let guestPlaying = 0;
    let guestCant = 0;
    let guestIfNeeded = 0;
    for (const g of selectedGameGuests) {
      if (g.status === "playing") guestPlaying += 1;
      else if (g.status === "cant") guestCant += 1;
      else if (g.status === "if_needed") guestIfNeeded += 1;
    }

    return {
      playing: rosterPlaying + guestPlaying,
      cant: rosterCant + guestCant,
      if_needed: rosterIfNeeded + guestIfNeeded,
      missing: Math.max(fixedPlayers.length - fixedAttendanceCount, 0),
      guests: selectedGameGuests.length,
    };
  }, [fixedPlayers, gameAttendance, selectedGameGuests]);

  const gameStatusById = useMemo(() => {
    const statusMap = {};

    for (const game of games) {
      const gameAttendanceRows = attendance.filter((row) => row.game_id === game.id);
      const gameGuestRows = guestPlayers.filter((row) => row.game_id === game.id);
      const gameStatsRows = stats.filter((row) => row.game_id === game.id);
      const actualGoals = gameStatsRows.reduce((sum, row) => sum + (row.goals || 0), 0);
      const actualAssists = gameStatsRows.reduce((sum, row) => sum + (row.assists || 0), 0);
      const playingCount =
        gameAttendanceRows.filter((row) => row.status === "playing").length +
        gameGuestRows.filter((row) => row.status === "playing").length;
      const played = isPlayed(game);
      const hasTargetTotals =
        game.expected_goals !== null &&
        game.expected_goals !== undefined &&
        game.expected_assists !== null &&
        game.expected_assists !== undefined;
      const statsMissing =
        played &&
        (gameStatsRows.length < playingCount ||
          !hasTargetTotals ||
          actualGoals < game.expected_goals ||
          actualAssists < game.expected_assists);

      let playerReadiness = "players_right";
      if (playingCount <= 5) playerReadiness = "players_not_enough";
      else if (playingCount === 6) playerReadiness = "players_just_enough";

      statusMap[game.id] = {
        played,
        upcoming: !played,
        statsMissing,
        playerReadiness,
        playingCount,
        actualGoals,
        actualAssists,
        expectedGoals: game.expected_goals,
        expectedAssists: game.expected_assists,
      };
    }

    return statusMap;
  }, [attendance, games, guestPlayers, stats]);

  const filteredGames = useMemo(() => {
    if (!gameFilters.length) return games;

    return games.filter((game) => {
      const status = gameStatusById[game.id];
      if (!status) return false;

      return gameFilters.every((filter) => {
        if (filter === "played") return status.played;
        if (filter === "upcoming") return status.upcoming;
        if (filter === "stats_missing") return status.statsMissing;
        if (filter === "players_not_enough") return status.playerReadiness === "players_not_enough";
        if (filter === "players_just_enough") return status.playerReadiness === "players_just_enough";
        if (filter === "players_right") return status.playerReadiness === "players_right";
        return true;
      });
    });
  }, [gameFilters, gameStatusById, games]);

  async function saveAttendance(playerId, status) {
    const gameId = selectedGameId;
    if (!gameId) return;
    if (!isAttendanceEditable(selectedGame)) return;
    const updated_at = new Date().toISOString();
    const snapshot = attendance;
    setAttendance((prev) => {
      const idx = prev.findIndex((a) => a.game_id === gameId && a.player_id === playerId);
      const row = { game_id: gameId, player_id: playerId, status, updated_at };
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = row;
        return next;
      }
      return [...prev, row];
    });
    const { error } = await supabase.from("attendance").upsert({
      game_id: gameId,
      player_id: playerId,
      status,
      updated_at,
    });
    if (error) {
      console.error(error);
      setAttendance(snapshot);
      loadAll();
    }
  }

  async function saveGuestAttendance(playerId, status) {
    if (!isAttendanceEditable(selectedGame)) return;
    const updated_at = new Date().toISOString();
    const snapshot = guestPlayers;
    setGuestPlayers((prev) =>
      prev.map((g) => (g.id === playerId ? { ...g, status, updated_at } : g))
    );
    const { error } = await supabase
      .from("guest_players")
      .update({ status, updated_at })
      .eq("id", playerId);
    if (error) {
      console.error(error);
      setGuestPlayers(snapshot);
      loadAll();
    }
  }

  async function saveStat(playerId, field, value) {
    const gameId = selectedGameId;
    if (!gameId) return;
    const existing = gameStats.find((s) => s.player_id === playerId);
    const goals = field === "goals" ? Number(value || 0) : existing?.goals || 0;
    const assists = field === "assists" ? Number(value || 0) : existing?.assists || 0;
    const updated_at = new Date().toISOString();
    const snapshot = stats;
    setStats((prev) => {
      const idx = prev.findIndex((s) => s.game_id === gameId && s.player_id === playerId);
      const row = { game_id: gameId, player_id: playerId, goals, assists, updated_at };
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = row;
        return next;
      }
      return [...prev, row];
    });
    const { error } = await supabase.from("player_stats").upsert({
      game_id: gameId,
      player_id: playerId,
      goals,
      assists,
      updated_at,
    });
    if (error) {
      console.error(error);
      setStats(snapshot);
      loadAll();
    }
  }

  async function saveGuestStat(playerId, field, value) {
    const existing = selectedGameGuests.find((g) => g.id === playerId);
    const goals = field === "goals" ? Number(value || 0) : existing?.goals || 0;
    const assists = field === "assists" ? Number(value || 0) : existing?.assists || 0;
    const updated_at = new Date().toISOString();
    const snapshot = guestPlayers;
    setGuestPlayers((prev) =>
      prev.map((g) => (g.id === playerId ? { ...g, goals, assists, updated_at } : g))
    );
    const { error } = await supabase
      .from("guest_players")
      .update({ goals, assists, updated_at })
      .eq("id", playerId);
    if (error) {
      console.error(error);
      setGuestPlayers(snapshot);
      loadAll();
    }
  }

  async function addGuestPlayer() {
    const firstName = newGuestFirstName.trim();
    const lastName = newGuestLastName.trim();
    if (!firstName || !lastName || !selectedGameId) return;
    if (!isAttendanceEditable(selectedGame)) return;
    const fullName = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
    const existingExternal = playersWithRole.find(
      (entry) => entry.name.toLowerCase().trim() === fullName.toLowerCase()
    );
    const externalId = existingExternal?.id || makeGuestId();

    if (!existingExternal) {
      await supabase.from("players").insert({
        id: externalId,
        name: fullName,
        fixed: false,
      });
    }

    await supabase.from("attendance").upsert({
      game_id: selectedGameId,
      player_id: externalId,
      status: "playing",
      updated_at: new Date().toISOString(),
    });

    setNewGuestFirstName("");
    setNewGuestLastName("");
    await loadAll();
  }

  async function saveGameTally(field, value) {
    if (!selectedGameId) return;

    const numericValue = value === "" ? null : Number(value);
    const payload =
      field === "goals"
        ? { expected_goals: numericValue }
        : { expected_assists: numericValue };

    const snapshot = games;
    setGames((prev) =>
      prev.map((g) =>
        g.id === selectedGameId
          ? {
              ...g,
              ...(field === "goals" ? { expected_goals: numericValue } : { expected_assists: numericValue }),
            }
          : g
      )
    );

    const { data, error } = await supabase
      .from("games")
      .update(payload)
      .eq("id", selectedGameId)
      .select();

    if (error) {
      console.error("saveGameTally failed:", error);
      setGames(snapshot);
      setTallyError(
        error.message?.includes("expected_goals") || error.message?.includes("expected_assists")
          ? "Tally columns are missing in the database. Run the games_expected_totals.sql migration."
          : `Could not save tally: ${error.message}`
      );
      return;
    }

    if (!data || data.length === 0) {
      setGames(snapshot);
      setTallyError("Tally update affected no rows. Check Supabase RLS policies for the games table.");
      return;
    }

    setTallyError(null);
  }

  async function saveFinalScore(homeScore, awayScore) {
    const gid = selectedGameId;
    if (!gid) return;
    const hs = homeScore === "" || homeScore === undefined ? null : Number(homeScore);
    const as = awayScore === "" || awayScore === undefined ? null : Number(awayScore);
    const snapshot = games;
    setGames((prev) =>
      prev.map((g) => (g.id === gid ? { ...g, home_score: hs, away_score: as } : g))
    );
    const { data, error } = await supabase
      .from("games")
      .update({ home_score: hs, away_score: as })
      .eq("id", gid)
      .select();
    if (error || !data?.length) {
      console.error(error);
      setGames(snapshot);
      loadAll();
    }
  }

  async function submitMotmVote(nomineeId) {
    const gid = selectedGameId;
    if (!gid) return { error: "No game selected" };
    const voterKey = getVoterKey();
    const id = `motm-${gid}-${voterKey}`;
    const created_at = new Date().toISOString();
    const snapshot = motmVotes;
    setMotmVotes((prev) => {
      const rest = prev.filter((v) => !(v.game_id === gid && v.voter_key === voterKey));
      return [...rest, { id, game_id: gid, nominee_id: nomineeId, voter_key: voterKey, created_at }];
    });
    const { error } = await supabase.from("motm_votes").upsert(
      {
        id,
        game_id: gid,
        nominee_id: nomineeId,
        voter_key: voterKey,
      },
      { onConflict: "game_id,voter_key" }
    );
    if (error) {
      console.error(error);
      setMotmVotes(snapshot);
      return { error: error.message || "Vote failed" };
    }
    return {};
  }

  async function removeGuestPlayer(playerId) {
    if (!isAttendanceEditable(selectedGame)) return;
    const snapshot = guestPlayers;
    setGuestPlayers((prev) => prev.filter((g) => g.id !== playerId));
    const { error } = await supabase.from("guest_players").delete().eq("id", playerId);
    if (error) {
      console.error(error);
      setGuestPlayers(snapshot);
      loadAll();
    }
  }

  return {
    games,
    filteredGames,
    loading,
    motmVotes,
    opponentStrengths,
    players: playersWithRole,
    fixedPlayers,
    externalPlayerPool,
    attendance,
    selectedGameId,
    setSelectedGameId,
    selectedGame,
    tab,
    setTab,
    gameFilters,
    setGameFilters,
    tallyError,
    gameStatusById,
    newGuestFirstName,
    setNewGuestFirstName,
    newGuestLastName,
    setNewGuestLastName,
    allGamePlayers,
    gameAttendance,
    gameStats,
    stats,
    selectedGameTotals,
    counts,
    guestPlayers,
    saveAttendance,
    saveGuestAttendance,
    saveStat,
    saveGuestStat,
    saveGameTally,
    saveFinalScore,
    submitMotmVote,
    addGuestPlayer,
    removeGuestPlayer,
  };
}
