import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { isSeasonVotingLocked } from "../seasons.js";
import { isAttendanceEditable, isPlayed } from "../utils/game";
import { useToast } from "./useToast.jsx";

/** Shown when an optimistic write fails and we roll the UI back. */
const SAVE_FAILED_HINT = "check your connection and try again.";

const FORCED_GUEST_NAMES = new Set(["bart moyens"]);
const FORCED_FIXED_NAMES = new Set([
  "moises godeau",
  "yannick drossaert",
  "lennart drossaert",
  "david goossens",
]);

/** Hide junk roster rows from UI (remove from DB in Supabase when ready). */
const HIDDEN_ROSTER_NAMES = new Set(["test test"]);

function isHiddenRosterName(name) {
  return HIDDEN_ROSTER_NAMES.has(String(name || "").toLowerCase().trim());
}

function makeGuestId() {
  return `guest-${crypto.randomUUID()}`;
}

export function useFutsalData(seasonSlug, { currentPlayerId, isAdmin } = {}) {
  const { notify } = useToast();
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
        const fallbackId = firstUpcoming?.id || nextGames[0]?.id || null;

        if (gameFromUrl) {
          const urlGame = nextGames.find((g) => g.id === gameFromUrl.id);
          if (urlGame && isPlayed(urlGame)) return fallbackId;
          return gameFromUrl.id;
        }

        if (prevSelected && nextGames.some((game) => game.id === prevSelected)) {
          const prevGame = nextGames.find((g) => g.id === prevSelected);
          if (prevGame && !isPlayed(prevGame)) return prevSelected;
          return fallbackId;
        }

        return fallbackId;
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
    const insights = url.searchParams.get("insights");
    url.searchParams.set("season", seasonSlug);
    if (teamStats || insights === "1") {
      url.searchParams.delete("game");
      if (player) url.searchParams.set("player", player);
      if (teamStats) url.searchParams.set("team_stats", teamStats);
      if (insights === "1") url.searchParams.set("team_stats", "current");
      url.searchParams.delete("insights");
      window.history.replaceState({}, "", url);
      return;
    }
    url.searchParams.set("game", selectedGameId);
    if (player) url.searchParams.set("player", player);
    window.history.replaceState({}, "", url);
  }, [selectedGameId, seasonSlug]);

  const visiblePlayers = useMemo(
    () => players.filter((p) => !isHiddenRosterName(p.name)),
    [players]
  );

  const guestPlayersVisible = useMemo(
    () => guestPlayers.filter((g) => !isHiddenRosterName(g.name)),
    [guestPlayers]
  );

  const selectedGame = useMemo(
    () => games.find((g) => g.id === selectedGameId),
    [games, selectedGameId]
  );

  const playersWithRole = useMemo(
    () =>
      visiblePlayers.map((player) => {
        const forcedGuest = FORCED_GUEST_NAMES.has(player.name.toLowerCase().trim());
        const forcedFixed = FORCED_FIXED_NAMES.has(player.name.toLowerCase().trim());
        const isGuest = forcedGuest || (!player.fixed && !forcedFixed);
        return {
          ...player,
          fixed: !isGuest,
          isGuest,
          archived: !!player.archived_at,
        };
      }),
    [visiblePlayers]
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
    () => playersWithRole.filter((player) => player.fixed && !player.archived),
    [playersWithRole]
  );
  const externalPlayerPool = useMemo(
    () => playersWithRole.filter((player) => player.isGuest && !player.archived),
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
    () => guestPlayersVisible.filter((g) => g.game_id === selectedGameId),
    [guestPlayersVisible, selectedGameId]
  );
  const adHocGameGuests = useMemo(
    () => selectedGameGuests.filter((g) => !g.source_player_id),
    [selectedGameGuests]
  );
  const selectedGameTotals = useMemo(
    () => ({
      goals: selectedGame?.home_score ?? null,
      assists: null,
    }),
    [selectedGame]
  );

  const allGamePlayers = useMemo(() => {
    // Show every active player, plus archived players who still have a row
    // for the currently-selected game (so past games keep showing them).
    const playerIdsWithData = new Set();
    for (const a of gameAttendance) playerIdsWithData.add(a.player_id);
    for (const s of gameStats) playerIdsWithData.add(s.player_id);
    return [
      ...sortedPlayersWithRole
        .filter((p) => !p.archived || playerIdsWithData.has(p.id))
        .map((player) => ({
          ...player,
          type: player.isGuest ? "guest" : "fixed",
        })),
      ...adHocGameGuests.map((player) => ({ ...player, type: "ad_hoc_guest" })),
    ];
  }, [adHocGameGuests, gameAttendance, gameStats, sortedPlayersWithRole]);

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
      const gameGuestRows = guestPlayersVisible.filter((row) => row.game_id === game.id);
      const gameStatsRows = stats.filter((row) => row.game_id === game.id);
      const actualGoals = gameStatsRows.reduce((sum, row) => sum + (row.goals || 0), 0);
      const actualAssists = gameStatsRows.reduce((sum, row) => sum + (row.assists || 0), 0);
      const playingCount =
        gameAttendanceRows.filter((row) => row.status === "playing").length +
        gameGuestRows.filter((row) => row.status === "playing").length;
      const played = isPlayed(game);
      const scoreTarget = game.home_score;
      const hasScoreTarget = scoreTarget !== null && scoreTarget !== undefined;
      const statsMissing =
        played &&
        (gameStatsRows.length < playingCount ||
          !hasScoreTarget ||
          actualGoals < scoreTarget);

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
        expectedGoals: scoreTarget,
        expectedAssists: null,
      };
    }

    return statusMap;
  }, [attendance, games, guestPlayersVisible, stats]);

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

  /** Upcoming soonest first, then played (most recent first) — for sidebar and prev/next nav */
  const sortedFilteredGames = useMemo(() => {
    const byKick = (a, b) => {
      const da = a.game_date || "";
      const db = b.game_date || "";
      if (da !== db) return da.localeCompare(db);
      return String(a.game_time || "").localeCompare(String(b.game_time || ""));
    };
    return [...filteredGames].sort((a, b) => {
      const sa = gameStatusById[a.id];
      const sb = gameStatusById[b.id];
      const aUp = sa && !sa.played;
      const bUp = sb && !sb.played;
      if (aUp !== bUp) return aUp ? -1 : 1;
      if (aUp && bUp) return byKick(a, b);
      return byKick(b, a);
    });
  }, [filteredGames, gameStatusById]);

  /** Keep sidebar selection valid when filters/season load or list shrinks. */
  useEffect(() => {
    if (loading) return;
    if (!sortedFilteredGames.length) return;
    if (selectedGameId && sortedFilteredGames.some((g) => g.id === selectedGameId)) return;
    const next =
      sortedFilteredGames.find((g) => !isPlayed(g)) ?? sortedFilteredGames[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional sync when derived lists change
    setSelectedGameId(next?.id ?? null);
  }, [loading, sortedFilteredGames, selectedGameId]);

  function canEditAttendanceFor(playerId) {
    return isAdmin || (currentPlayerId && playerId === currentPlayerId);
  }

  async function saveAttendance(playerId, status, gameIdArg) {
    const gameId = gameIdArg || selectedGameId;
    if (!gameId) return;
    const game = gameIdArg ? games.find((g) => g.id === gameIdArg) : selectedGame;
    if (!isAttendanceEditable(game, games)) return;
    if (!canEditAttendanceFor(playerId)) return;

    if (status === null || status === undefined) {
      const snapshot = attendance;
      setAttendance((prev) =>
        prev.filter((a) => !(a.game_id === gameId && a.player_id === playerId))
      );
      const { error } = await supabase
        .from("attendance")
        .delete()
        .eq("game_id", gameId)
        .eq("player_id", playerId);
      if (error) {
        console.error(error);
        setAttendance(snapshot);
        notify(`Couldn't clear attendance — ${SAVE_FAILED_HINT}`, "error");
        loadAll();
      }
      return;
    }

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
      notify(`Couldn't save attendance — ${SAVE_FAILED_HINT}`, "error");
      loadAll();
    }
  }

  async function saveGuestAttendance(playerId, status) {
    if (!isAttendanceEditable(selectedGame, games)) return;
    if (!isAdmin) return;
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
      notify(`Couldn't save guest attendance — ${SAVE_FAILED_HINT}`, "error");
      loadAll();
    }
  }

  async function saveStat(playerId, field, value) {
    const gameId = selectedGameId;
    if (!gameId) return;
    if (!canEditAttendanceFor(playerId)) return;
    const existing = gameStats.find((s) => s.player_id === playerId);
    const goals = field === "goals" ? Number(value || 0) : existing?.goals ?? 0;
    const assists = field === "assists" ? Number(value || 0) : existing?.assists ?? 0;
    const played =
      field === "played"
        ? Boolean(value)
        : existing
          ? existing.played !== false
          : true;
    const updated_at = new Date().toISOString();
    const snapshot = stats;
    setStats((prev) => {
      const idx = prev.findIndex((s) => s.game_id === gameId && s.player_id === playerId);
      const row = { game_id: gameId, player_id: playerId, goals, assists, played, updated_at };
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
      played,
      updated_at,
    });
    if (error) {
      console.error(error);
      setStats(snapshot);
      notify(`Couldn't save stats — ${SAVE_FAILED_HINT}`, "error");
      loadAll();
    }
  }

  async function saveGuestStat(playerId, field, value) {
    if (!isAdmin) return;
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
      notify(`Couldn't save guest stats — ${SAVE_FAILED_HINT}`, "error");
      loadAll();
    }
  }

  async function addGuestPlayer() {
    const firstName = newGuestFirstName.trim();
    const lastName = newGuestLastName.trim();
    if (!firstName || !lastName || !selectedGameId) return;
    if (!isAttendanceEditable(selectedGame, games)) return;
    if (!isAdmin) return;
    const fullName = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
    const existingExternal = playersWithRole.find(
      (entry) => entry.name.toLowerCase().trim() === fullName.toLowerCase()
    );
    const externalId = existingExternal?.id || makeGuestId();

    if (!existingExternal) {
      const { error: insertErr } = await supabase.from("players").insert({
        id: externalId,
        name: fullName,
        fixed: false,
      });
      if (insertErr) {
        console.error(insertErr);
        notify(`Couldn't add guest — ${SAVE_FAILED_HINT}`, "error");
        return;
      }
    }

    const { error: upsertErr } = await supabase.from("attendance").upsert({
      game_id: selectedGameId,
      player_id: externalId,
      status: "playing",
      updated_at: new Date().toISOString(),
    });
    if (upsertErr) {
      console.error(upsertErr);
      notify(`Couldn't add guest — ${SAVE_FAILED_HINT}`, "error");
      await loadAll();
      return;
    }

    setNewGuestFirstName("");
    setNewGuestLastName("");
    await loadAll();
  }

  async function saveFinalScore(homeScore, awayScore) {
    const gid = selectedGameId;
    if (!gid) return;
    if (!isAdmin) return;
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
      notify(`Couldn't save the final score — ${SAVE_FAILED_HINT}`, "error");
      loadAll();
    }
  }

  async function submitMotmVote(nomineeId) {
    const gid = selectedGameId;
    if (!gid) return { error: "No game selected" };
    const gameRow = games.find((g) => g.id === gid);
    if (isSeasonVotingLocked(gameRow?.season_slug)) {
      return { error: "Man of the match voting is disabled for this season." };
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const authedUserId = sessionData?.session?.user?.id;
    if (!authedUserId) return { error: "Sign in to vote" };
    const voterKey = authedUserId;
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
    if (!isAttendanceEditable(selectedGame, games)) return;
    if (!isAdmin) return;
    const snapshot = guestPlayers;
    setGuestPlayers((prev) => prev.filter((g) => g.id !== playerId));
    const { error } = await supabase.from("guest_players").delete().eq("id", playerId);
    if (error) {
      console.error(error);
      setGuestPlayers(snapshot);
      notify(`Couldn't remove guest — ${SAVE_FAILED_HINT}`, "error");
      loadAll();
    }
  }

  return {
    games,
    filteredGames,
    sortedFilteredGames,
    loading,
    motmVotes,
    opponentStrengths,
    reloadAll: loadAll,
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
    guestPlayers: guestPlayersVisible,
    saveAttendance,
    saveGuestAttendance,
    saveStat,
    saveGuestStat,
    saveFinalScore,
    submitMotmVote,
    addGuestPlayer,
    removeGuestPlayer,
  };
}
