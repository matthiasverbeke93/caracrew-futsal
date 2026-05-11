import { useCallback, useEffect, useState } from "react";
import AttendanceTab from "./components/AttendanceTab";
import FormChip from "./components/FormChip";
import GameSidebar from "./components/GameSidebar";
import PlayerProfileModal from "./components/PlayerProfileModal";
import SelectedGamePanel from "./components/SelectedGamePanel";
import StatsTab from "./components/StatsTab";
import TeamStatsPage from "./components/TeamStatsPage";
import Tabs from "./components/Tabs";
import { TEAM_NAME } from "./constants";
import { useFutsalData } from "./hooks/useFutsalData";
import { supabase } from "./lib/supabase";
import {
  DEFAULT_SEASON_SLUG,
  isSeasonSlug,
  readSeasonSlugFromSearch,
  seasonLabel,
  SEASON_OPTIONS,
} from "./seasons";

export default function App() {
  const [user, setUser] = useState(null);
  const requireAuthForWrites =
    import.meta.env.VITE_REQUIRE_AUTH_FOR_WRITES === "true";

  const [profilePlayerId, setProfilePlayerId] = useState(() =>
    new URLSearchParams(window.location.search).get("player")
  );

  const [teamStatsOpen, setTeamStatsOpen] = useState(() =>
    new URLSearchParams(window.location.search).get("team_stats") === "1"
  );

  const [seasonSlug, setSeasonSlug] = useState(() =>
    readSeasonSlugFromSearch(new URLSearchParams(window.location.search))
  );

  const openTeamStats = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("team_stats", "1");
    window.history.pushState({}, "", url);
    setTeamStatsOpen(true);
  }, []);

  const closeTeamStats = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("team_stats");
    window.history.pushState({}, "", url);
    setTeamStatsOpen(false);
  }, []);

  const openPlayer = useCallback((id) => {
    if (!id) return;
    const url = new URL(window.location.href);
    const ts = url.searchParams.get("team_stats");
    url.searchParams.set("player", id);
    if (ts) url.searchParams.set("team_stats", ts);
    window.history.pushState({}, "", url);
    setProfilePlayerId(id);
  }, []);

  const closePlayer = useCallback(() => {
    const url = new URL(window.location.href);
    const ts = url.searchParams.get("team_stats");
    url.searchParams.delete("player");
    if (ts) url.searchParams.set("team_stats", ts);
    window.history.pushState({}, "", url);
    setProfilePlayerId(null);
  }, []);

  useEffect(() => {
    const onPop = () => {
      const sp = new URLSearchParams(window.location.search);
      setProfilePlayerId(sp.get("player"));
      setTeamStatsOpen(sp.get("team_stats") === "1");
      setSeasonSlug(readSeasonSlugFromSearch(sp));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.get("season")) {
      url.searchParams.set("season", DEFAULT_SEASON_SLUG);
      window.history.replaceState({}, "", url);
    }
  }, []);

  const selectSeason = useCallback((slug) => {
    if (!isSeasonSlug(slug)) return;
    const url = new URL(window.location.href);
    url.searchParams.set("season", slug);
    url.searchParams.delete("game");
    window.history.pushState({}, "", url);
    setSeasonSlug(slug);
  }, []);

  const {
    games,
    filteredGames,
    loading,
    motmVotes,
    opponentStrengths,
    players,
    fixedPlayers,
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
  } = useFutsalData(seasonSlug);

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
          <div className="hero-season-row" role="navigation" aria-label="Season">
            {SEASON_OPTIONS.map((opt) => (
              <button
                key={opt.slug}
                type="button"
                className={`season-pill ${opt.slug === seasonSlug ? "active" : ""}`}
                onClick={() => selectSeason(opt.slug)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="hero-title-row">
            <h1>{TEAM_NAME}</h1>
            <FormChip games={games} />
          </div>
          <p>Attendance, goals and assists tracker</p>
          <nav className="hero-nav" aria-label="External and team links">
            <button type="button" className="hero-link hero-link-button" onClick={openTeamStats}>
              Team stats
            </button>
            <a
              className="hero-link"
              href="https://www.lzvcup.be/teams/detail/742"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on LZV Cup ↗
            </a>
          </nav>
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
          opponentStrengths={opponentStrengths}
          seasonSlug={seasonSlug}
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

          {!loading && teamStatsOpen && (
            <TeamStatsPage
              games={games}
              players={players}
              attendance={attendance}
              stats={stats}
              seasonSlug={seasonSlug}
              seasonLabel={seasonLabel(seasonSlug)}
              onBack={closeTeamStats}
              onOpenPlayer={openPlayer}
            />
          )}

          {!loading && !teamStatsOpen && selectedGame && (
            <>
              <SelectedGamePanel
                selectedGame={selectedGame}
                counts={counts}
                allGames={games}
                fixedPlayers={fixedPlayers}
                gameAttendance={gameAttendance}
                opponentStrengths={opponentStrengths}
                seasonSlug={seasonSlug}
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

          {!loading && !teamStatsOpen && !selectedGame && (
            <div className="panel content-empty">
              {games.length === 0 ? (
                <>
                  <p>
                    No fixtures loaded for <strong>{seasonLabel(seasonSlug)}</strong>. Add rows in
                    Supabase <code>games</code> with <code>season_slug = &apos;{seasonSlug}&apos;</code>
                    , or switch season above.
                  </p>
                </>
              ) : (
                <p>No game selected yet. Choose a match in the sidebar.</p>
              )}
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