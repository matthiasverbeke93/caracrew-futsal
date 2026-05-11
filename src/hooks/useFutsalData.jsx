import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { isPlayed } from "../utils/game";

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

export function useFutsalData() {
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

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [gamesRes, playersRes, attendanceRes, statsRes, guestsRes] =
      await Promise.all([
        supabase.from("games").select("*").order("game_date", { ascending: true }),
        supabase.from("players").select("*").order("fixed", { ascending: false }),
        supabase.from("attendance").select("*"),
        supabase.from("player_stats").select("*"),
        supabase.from("guest_players").select("*"),
      ]);

    if (gamesRes.error) console.error(gamesRes.error);
    if (playersRes.error) console.error(playersRes.error);
    if (attendanceRes.error) console.error(attendanceRes.error);
    if (statsRes.error) console.error(statsRes.error);
    if (guestsRes.error) console.error(guestsRes.error);

    setGames(gamesRes.data || []);
    setPlayers(playersRes.data || []);
    setAttendance(attendanceRes.data || []);
    setStats(statsRes.data || []);
    setGuestPlayers(guestsRes.data || []);

    const nextGames = gamesRes.data || [];
    const firstUpcoming = nextGames.find((g) => !isPlayed(g));
    setSelectedGameId((prevSelected) => {
      if (prevSelected && nextGames.some((game) => game.id === prevSelected)) {
        return prevSelected;
      }
      return firstUpcoming?.id || nextGames[0]?.id || null;
    });
  }

  const selectedGame = games.find((g) => g.id === selectedGameId);
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
  const fixedPlayers = playersWithRole.filter((player) => player.fixed);
  const externalPlayerPool = playersWithRole.filter((player) => player.isGuest);
  const gameAttendance = attendance.filter((a) => a.game_id === selectedGameId);
  const gameStats = stats.filter((s) => s.game_id === selectedGameId);
  const selectedGameGuests = guestPlayers.filter((g) => g.game_id === selectedGameId);
  const adHocGameGuests = selectedGameGuests.filter((g) => !g.source_player_id);
  const selectedGameTotals = {
    goals: selectedGame?.expected_goals ?? null,
    assists: selectedGame?.expected_assists ?? null,
  };

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
    const fixedAttendanceCount = gameAttendance.filter((a) =>
      fixedPlayers.some((player) => player.id === a.player_id)
    ).length;
    const rosterPlaying = gameAttendance.filter((a) => a.status === "playing").length;
    const rosterCant = gameAttendance.filter((a) => a.status === "cant").length;
    const rosterIfNeeded = gameAttendance.filter((a) => a.status === "if_needed").length;
    const guestPlaying = selectedGameGuests.filter((p) => p.status === "playing").length;
    const guestCant = selectedGameGuests.filter((p) => p.status === "cant").length;
    const guestIfNeeded = selectedGameGuests.filter((p) => p.status === "if_needed").length;

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
    await supabase.from("attendance").upsert({
      game_id: selectedGameId,
      player_id: playerId,
      status,
      updated_at: new Date().toISOString(),
    });
    await loadAll();
  }

  async function saveGuestAttendance(playerId, status) {
    await supabase
      .from("guest_players")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", playerId);
    await loadAll();
  }

  async function saveStat(playerId, field, value) {
    const existing = gameStats.find((s) => s.player_id === playerId);
    await supabase.from("player_stats").upsert({
      game_id: selectedGameId,
      player_id: playerId,
      goals: field === "goals" ? Number(value || 0) : existing?.goals || 0,
      assists: field === "assists" ? Number(value || 0) : existing?.assists || 0,
      updated_at: new Date().toISOString(),
    });
    await loadAll();
  }

  async function saveGuestStat(playerId, field, value) {
    const existing = selectedGameGuests.find((g) => g.id === playerId);
    await supabase
      .from("guest_players")
      .update({
        goals: field === "goals" ? Number(value || 0) : existing?.goals || 0,
        assists: field === "assists" ? Number(value || 0) : existing?.assists || 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", playerId);
    await loadAll();
  }

  async function addGuestPlayer() {
    const firstName = newGuestFirstName.trim();
    const lastName = newGuestLastName.trim();
    if (!firstName || !lastName || !selectedGameId) return;
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

    const { data, error } = await supabase
      .from("games")
      .update(payload)
      .eq("id", selectedGameId)
      .select();

    if (error) {
      console.error("saveGameTally failed:", error);
      setTallyError(
        error.message?.includes("expected_goals") || error.message?.includes("expected_assists")
          ? "Tally columns are missing in the database. Run the games_expected_totals.sql migration."
          : `Could not save tally: ${error.message}`
      );
      return;
    }

    if (!data || data.length === 0) {
      setTallyError("Tally update affected no rows. Check Supabase RLS policies for the games table.");
      return;
    }

    setTallyError(null);
    await loadAll();
  }

  async function removeGuestPlayer(playerId) {
    await supabase.from("guest_players").delete().eq("id", playerId);
    await loadAll();
  }

  return {
    games,
    filteredGames,
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
    selectedGameTotals,
    counts,
    guestPlayers,
    loadAll,
    saveAttendance,
    saveGuestAttendance,
    saveStat,
    saveGuestStat,
    saveGameTally,
    addGuestPlayer,
    removeGuestPlayer,
  };
}
