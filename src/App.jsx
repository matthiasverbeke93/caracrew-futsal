import { useCallback, useEffect, useMemo, useState } from "react";
import AccountChip from "./components/AccountChip";
import AdminPanel from "./components/AdminPanel";
import AttendanceTab from "./components/AttendanceTab";
import AuthModal from "./components/AuthModal";
import ClaimPlayerModal from "./components/ClaimPlayerModal";
import FormChip from "./components/FormChip";
import GameSidebar from "./components/GameSidebar";
import MyNextGameCard from "./components/MyNextGameCard";
import PlayerProfileModal from "./components/PlayerProfileModal";
import SelectedGamePanel from "./components/SelectedGamePanel";
import StatsTab from "./components/StatsTab";
import TeamStatsPage from "./components/TeamStatsPage";
import Tabs from "./components/Tabs";
import { TEAM_NAME } from "./constants";
import { useAuthSession } from "./hooks/useAuthSession";
import { useFutsalData } from "./hooks/useFutsalData";
import { isPlayed } from "./utils/game";
import {
  DEFAULT_SEASON_SLUG,
  isSeasonSlug,
  readSeasonSlugFromSearch,
  seasonLabel,
  SEASON_OPTIONS,
} from "./seasons";

export default function App() {
  const {
    user,
    currentPlayer,
    isAdmin,
    isSignedIn,
    authLoading,
    myClaim,
    signIn,
    signUp,
    signOut,
    submitClaim,
    cancelClaim,
    refreshClaim,
  } = useAuthSession();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);

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
    reloadAll,
  } = useFutsalData(seasonSlug, { currentPlayerId: currentPlayer?.id, isAdmin });

  const canEditAttendanceFor = useCallback(
    (playerId) => isSignedIn && (isAdmin || playerId === currentPlayer?.id),
    [isSignedIn, isAdmin, currentPlayer]
  );
  const canEditStatsFor = canEditAttendanceFor;
  const canManageGame = isSignedIn && isAdmin;
  const canVote = isSignedIn;

  const claimedPlayerName = useMemo(() => {
    if (!myClaim) return null;
    return players.find((p) => p.id === myClaim.player_id)?.name || myClaim.player_id;
  }, [myClaim, players]);

  const nextUpcomingGame = useMemo(() => {
    if (!games?.length) return null;
    return [...games]
      .sort((a, b) => (a.game_date || "").localeCompare(b.game_date || ""))
      .find((g) => !isPlayed(g));
  }, [games]);

  const showNextGameCard =
    !!currentPlayer &&
    !!nextUpcomingGame &&
    selectedGameId !== nextUpcomingGame.id;

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-left">
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
        <div className="hero-right">
          <div className="hero-season-row" role="navigation" aria-label="Season">
            {SEASON_OPTIONS.map((opt) => {
              const isActive = opt.slug === seasonSlug;
              return (
                <button
                  key={opt.slug}
                  type="button"
                  className={`season-pill ${isActive ? "active" : ""}`}
                  aria-pressed={isActive}
                  onClick={() => selectSeason(opt.slug)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <AccountChip
            user={user}
            currentPlayer={currentPlayer}
            isAdmin={isAdmin}
            authLoading={authLoading}
            onSignInClick={() => setAuthModalOpen(true)}
            onSignOut={signOut}
            onAdminClick={isAdmin ? () => setAdminPanelOpen(true) : null}
          />
        </div>
      </header>

      {isSignedIn && !currentPlayer && (
        <section className={`auth-banner claim-banner status-${myClaim?.status || "none"}`}>
          {!myClaim && (
            <>
              <span>You're signed in but not linked to a player yet.</span>
              <button
                type="button"
                className="auth-banner-btn"
                onClick={() => setClaimModalOpen(true)}
              >
                Claim your player
              </button>
            </>
          )}
          {myClaim?.status === "pending" && (
            <>
              <span>
                Claim for <strong>{claimedPlayerName}</strong> is awaiting admin approval.
              </span>
              <button
                type="button"
                className="auth-banner-btn ghost"
                onClick={async () => {
                  const res = await cancelClaim();
                  if (res?.error) console.error(res.error);
                }}
              >
                Cancel
              </button>
            </>
          )}
          {myClaim?.status === "rejected" && (
            <>
              <span>
                Your claim for <strong>{claimedPlayerName}</strong> was rejected.
                {myClaim.message ? ` (${myClaim.message})` : ""}
              </span>
              <button
                type="button"
                className="auth-banner-btn"
                onClick={() => setClaimModalOpen(true)}
              >
                Try another
              </button>
            </>
          )}
          {myClaim?.status === "cancelled" && (
            <>
              <span>You cancelled your previous claim.</span>
              <button
                type="button"
                className="auth-banner-btn"
                onClick={() => setClaimModalOpen(true)}
              >
                Claim again
              </button>
            </>
          )}
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

          {!loading && !teamStatsOpen && showNextGameCard && (
            <MyNextGameCard
              games={games}
              attendance={attendance}
              currentPlayer={currentPlayer}
              onJumpToGame={(id) => setSelectedGameId(id)}
              onMarkAttendance={(gameId, status) =>
                saveAttendance(currentPlayer.id, status, gameId)
              }
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
                canManageGame={canManageGame}
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
                  selectedGame={selectedGame}
                  canEditAttendanceFor={canEditAttendanceFor}
                  canManageGame={canManageGame}
                  isSignedIn={isSignedIn}
                  onRequestSignIn={() => setAuthModalOpen(true)}
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
                  canEditStatsFor={canEditStatsFor}
                  canManageGame={canManageGame}
                  canVote={canVote}
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

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        signIn={signIn}
        signUp={signUp}
      />

      <ClaimPlayerModal
        open={claimModalOpen}
        onClose={() => setClaimModalOpen(false)}
        onSubmit={submitClaim}
      />

      <AdminPanel
        open={adminPanelOpen}
        onClose={() => setAdminPanelOpen(false)}
        onChanged={() => {
          refreshClaim();
          reloadAll();
        }}
      />
    </div>
  );
}