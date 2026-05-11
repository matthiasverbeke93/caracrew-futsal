import { useEffect, useState } from "react";
import AttendanceTab from "./components/AttendanceTab";
import GameSidebar from "./components/GameSidebar";
import SeasonTab from "./components/SeasonTab";
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

  const {
    filteredGames,
    attendance,
    guestPlayers,
    externalPlayerPool,
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
    saveAttendance,
    saveGuestAttendance,
    saveStat,
    saveGuestStat,
    addGuestPlayer,
    addExistingExternalPlayerToGame,
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
          <p>Attendance, goals and assists tracker 🙂</p>
        </div>
      </header>

      {!canWrite && (
        <section className="auth-banner">
          Log in required for write actions. Reading remains public.
        </section>
      )}

      <main className="layout">
        <GameSidebar
          games={filteredGames}
          attendance={attendance}
          guestPlayers={guestPlayers}
          gameStatusById={gameStatusById}
          gameFilter={gameFilter}
          onFilterChange={setGameFilter}
          selectedGameId={selectedGameId}
          onSelectGame={setSelectedGameId}
        />

        <section className="content">
          {selectedGame && (
            <>
              <SelectedGamePanel
                selectedGame={selectedGame}
                counts={counts}
                newGuestFirstName={newGuestFirstName}
                setNewGuestFirstName={setNewGuestFirstName}
                newGuestLastName={newGuestLastName}
                setNewGuestLastName={setNewGuestLastName}
                externalPlayerPool={externalPlayerPool}
                addExistingExternalPlayerToGame={addExistingExternalPlayerToGame}
                addGuestPlayer={addGuestPlayer}
                canWrite={canWrite}
              />

              <Tabs activeTab={tab} onTabChange={setTab} />

              {tab === "attendance" && (
                <AttendanceTab
                  allGamePlayers={allGamePlayers}
                  gameAttendance={gameAttendance}
                  saveGuestAttendance={saveGuestAttendance}
                  saveAttendance={saveAttendance}
                  removeGuestPlayer={removeGuestPlayer}
                  canWrite={canWrite}
                />
              )}

              {tab === "stats" && (
                <StatsTab
                  allGamePlayers={allGamePlayers}
                  gameStats={gameStats}
                  saveGuestStat={saveGuestStat}
                  saveStat={saveStat}
                  canWrite={canWrite}
                />
              )}

              {tab === "season" && <SeasonTab seasonLeaders={seasonLeaders} />}
            </>
          )}
        </section>
      </main>
    </div>
  );
}