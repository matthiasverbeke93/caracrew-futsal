import { useCallback, useEffect, useState } from "react";
import AttendanceTab from "./components/AttendanceTab";
import GameSidebar from "./components/GameSidebar";
import PlayerProfileModal from "./components/PlayerProfileModal";
import SelectedGamePanel from "./components/SelectedGamePanel";
import StatsTab from "./components/StatsTab";
import Tabs from "./components/Tabs";
import { TEAM_NAME } from "./constants";
import { useFutsalData } from "./hooks/useFutsalData";
import { supabase } from "./lib/supabase";

export default function App() {
  const [user, setUser] = useState(null);
  const requireAuthForWrites =
    import.meta.env.VITE_REQUIRE_AUTH_FOR_WRITES === "true";

  const [profilePlayerId, setProfilePlayerId] = useState(() =>
    new URLSearchParams(window.location.search).get("player")
  );

  const openPlayer = useCallback((id) => {
    if (!id) return;
    const url = new URL(window.location.href);
    url.searchParams.set("player", id);
    window.history.pushState({}, "", url);
    setProfilePlayerId(id);
  }, []);

  const closePlayer = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("player");
    window.history.pushState({}, "", url);
    setProfilePlayerId(null);
  }, []);

  useEffect(() => {
    const onPop = () => {
      setProfilePlayerId(new URLSearchParams(window.location.search).get("player"));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const {
    games,
    filteredGames,
    loading,
    motmVotes,
    players,
    attendance,
    guestPlayers,
    externalPlayerPool,
    selectedGameId,
    setSelectedGameId,
    selectedGame,
    tab,
    setTab,
    gameFilters,
    setGameFilters,
    gameStatusById,
    tallyError,
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
    saveAttendance,
    saveGuestAttendance,
    saveStat,
    saveGuestStat,
    saveGameTally,
    saveFinalScore,
    submitMotmVote,
    addGuestPlayer,
    removeGuestPlayer,
  } = useFutsalData();

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUser(data.session?.user || null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const canWrite = !requireAuthForWrites || !!user;

  return (
    <div className="app">
      <header className="hero">
        <div>
          <div className="pill">Season 25-26</div>
          <h1>{TEAM_NAME}</h1>
          <p>Attendance, goals and assists tracker</p>
          <a
            className="hero-link"
            href="https://www.lzvcup.be/teams/detail/742"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on LZV Cup ↗
          </a>
        </div>
      </header>

      {!canWrite && (
        <section className="auth-banner">
          Log in required for write actions. Reading remains public.
        </section>
      )}

      {tallyError && <section className="auth-banner">{tallyError}</section>}

      <main className="layout">
        <GameSidebar
          games={filteredGames}
          attendance={attendance}
          guestPlayers={guestPlayers}
          gameStatusById={gameStatusById}
          gameFilters={gameFilters}
          onFiltersChange={setGameFilters}
          selectedGameId={selectedGameId}
          onSelectGame={setSelectedGameId}
          loading={loading}
        />

        <section className="content">
          {loading && (
            <div className="content-skeleton panel" aria-busy="true">
              <div className="skeleton-line lg" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-grid">
                <div className="skeleton-block" />
                <div className="skeleton-block" />
                <div className="skeleton-block" />
              </div>
            </div>
          )}

          {!loading && selectedGame && (
            <>
              <SelectedGamePanel
                selectedGame={selectedGame}
                counts={counts}
                allGames={games}
                saveFinalScore={saveFinalScore}
                canWrite={canWrite}
              />

              <Tabs activeTab={tab} onTabChange={setTab} />

              {tab === "attendance" && (
                <AttendanceTab
                  allGamePlayers={allGamePlayers}
                  externalPlayerPool={externalPlayerPool}
                  newGuestFirstName={newGuestFirstName}
                  setNewGuestFirstName={setNewGuestFirstName}
                  newGuestLastName={newGuestLastName}
                  setNewGuestLastName={setNewGuestLastName}
                  addGuestPlayer={addGuestPlayer}
                  gameAttendance={gameAttendance}
                  saveGuestAttendance={saveGuestAttendance}
                  saveAttendance={saveAttendance}
                  removeGuestPlayer={removeGuestPlayer}
                  onOpenPlayer={openPlayer}
                  canWrite={canWrite}
                />
              )}

              {tab === "stats" && (
                <StatsTab
                  key={selectedGame.id}
                  allGamePlayers={allGamePlayers}
                  selectedGame={selectedGame}
                  gameStats={gameStats}
                  selectedGameTotals={selectedGameTotals}
                  saveGuestStat={saveGuestStat}
                  saveStat={saveStat}
                  saveGameTally={saveGameTally}
                  motmVotes={motmVotes}
                  submitMotmVote={submitMotmVote}
                  onOpenPlayer={openPlayer}
                  canWrite={canWrite}
                />
              )}
            </>
          )}

          {!loading && !selectedGame && (
            <div className="panel content-empty">
              <p>No game selected yet. Choose a match in the sidebar when games load.</p>
            </div>
          )}
        </section>
      </main>

      {profilePlayerId && (
        <PlayerProfileModal
          playerId={profilePlayerId}
          onClose={closePlayer}
          games={games}
          attendance={attendance}
          stats={stats}
          guestPlayers={guestPlayers}
          players={players}
          motmVotes={motmVotes}
        />
      )}
    </div>
  );
}