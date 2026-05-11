import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { isPlayed } from "../utils/game";

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
  const [gameFilter, setGameFilter] = useState("all");

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
  const fixedPlayers = players.filter((player) => player.fixed);
  const externalPlayerPool = players.filter((player) => !player.fixed);
  const gameAttendance = attendance.filter((a) => a.game_id === selectedGameId);
  const gameStats = stats.filter((s) => s.game_id === selectedGameId);
  const selectedGameGuests = guestPlayers.filter((g) => g.game_id === selectedGameId);

  const allGamePlayers = useMemo(
    () => [
      ...fixedPlayers.map((player) => ({ ...player, type: "roster" })),
      ...selectedGameGuests.map((player) => ({ ...player, type: "guest" })),
    ],
    [fixedPlayers, selectedGameGuests]
  );

  const counts = useMemo(() => {
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
      missing: Math.max(fixedPlayers.length - gameAttendance.length, 0),
      guests: selectedGameGuests.length,
    };
  }, [fixedPlayers.length, gameAttendance, selectedGameGuests]);

  const gameStatusById = useMemo(() => {
    const statusMap = {};

    for (const game of games) {
      const gameAttendanceRows = attendance.filter((row) => row.game_id === game.id);
      const gameGuestRows = guestPlayers.filter((row) => row.game_id === game.id);
      const gameStatsRows = stats.filter((row) => row.game_id === game.id);
      const playingCount =
        gameAttendanceRows.filter((row) => row.status === "playing").length +
        gameGuestRows.filter((row) => row.status === "playing").length;
      const played = isPlayed(game);
      const statsMissing = played && playingCount > 0 && gameStatsRows.length < playingCount;

      let playerReadiness = "players_right";
      if (playingCount <= 5) playerReadiness = "players_not_enough";
      else if (playingCount === 6) playerReadiness = "players_just_enough";

      statusMap[game.id] = {
        played,
        upcoming: !played,
        statsMissing,
        playerReadiness,
        playingCount,
      };
    }

    return statusMap;
  }, [attendance, games, guestPlayers, stats]);

  const filteredGames = useMemo(() => {
    if (gameFilter === "all") return games;

    return games.filter((game) => {
      const status = gameStatusById[game.id];
      if (!status) return false;
      if (gameFilter === "played") return status.played;
      if (gameFilter === "upcoming") return status.upcoming;
      if (gameFilter === "stats_missing") return status.statsMissing;
      if (gameFilter === "players_not_enough") {
        return status.playerReadiness === "players_not_enough";
      }
      if (gameFilter === "players_just_enough") {
        return status.playerReadiness === "players_just_enough";
      }
      if (gameFilter === "players_right") {
        return status.playerReadiness === "players_right";
      }
      return true;
    });
  }, [gameFilter, gameStatusById, games]);

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
    const existingExternal = externalPlayerPool.find(
      (entry) => entry.name.toLowerCase() === fullName.toLowerCase()
    );
    const externalId = existingExternal?.id || makeGuestId();

    if (!existingExternal) {
      await supabase.from("players").insert({
        id: externalId,
        name: fullName,
        fixed: false,
      });
    }

    await supabase.from("guest_players").insert({
      id: makeGuestId(),
      game_id: selectedGameId,
      name: fullName,
      source_player_id: externalId,
      status: "playing",
      goals: 0,
      assists: 0,
      updated_at: new Date().toISOString(),
    });

    setNewGuestFirstName("");
    setNewGuestLastName("");
    await loadAll();
  }

  async function addExistingExternalPlayerToGame(playerId) {
    if (!selectedGameId) return;
    const player = externalPlayerPool.find((entry) => entry.id === playerId);
    if (!player) return;

    const alreadyInGame = selectedGameGuests.some(
      (entry) => entry.source_player_id === player.id
    );
    if (alreadyInGame) return;

    await supabase.from("guest_players").insert({
      id: makeGuestId(),
      game_id: selectedGameId,
      name: player.name,
      source_player_id: player.id,
      status: "playing",
      goals: 0,
      assists: 0,
      updated_at: new Date().toISOString(),
    });

    await loadAll();
  }

  async function removeGuestPlayer(playerId) {
    await supabase.from("guest_players").delete().eq("id", playerId);
    await loadAll();
  }

  const seasonLeaders = fixedPlayers
    .map((player) => {
      const playerStats = stats.filter((s) => s.player_id === player.id);
      return {
        ...player,
        goals: playerStats.reduce((sum, s) => sum + (s.goals || 0), 0),
        assists: playerStats.reduce((sum, s) => sum + (s.assists || 0), 0),
      };
    })
    .sort((a, b) => b.goals + b.assists - (a.goals + a.assists));

  return {
    games,
    filteredGames,
    players,
    fixedPlayers,
    externalPlayerPool,
    attendance,
    selectedGameId,
    setSelectedGameId,
    selectedGame,
    tab,
    setTab,
    gameFilter,
    setGameFilter,
    gameStatusById,
    newGuestFirstName,
    setNewGuestFirstName,
    newGuestLastName,
    setNewGuestLastName,
    allGamePlayers,
    gameAttendance,
    gameStats,
    counts,
    seasonLeaders,
    guestPlayers,
    loadAll,
    saveAttendance,
    saveGuestAttendance,
    saveStat,
    saveGuestStat,
    addGuestPlayer,
    addExistingExternalPlayerToGame,
    removeGuestPlayer,
  };
}
