import { useCallback, useEffect, useMemo, useState } from "react";
import AccountChip from "./components/AccountChip";
import AdminPanel from "./components/AdminPanel";
import AttendanceTab from "./components/AttendanceTab";
import AuthModal from "./components/AuthModal";
import ClaimPlayerModal from "./components/ClaimPlayerModal";
import FormChip from "./components/FormChip";
import GameSidebar from "./components/GameSidebar";
import MyNextGamesTiles from "./components/MyNextGamesTiles";
import PlayerProfileModal from "./components/PlayerProfileModal";
import SeasonOverviewPage from "./components/SeasonOverviewPage";
import SelectedGamePanel from "./components/SelectedGamePanel";
import StatsTab from "./components/StatsTab";
import Tabs from "./components/Tabs";
import { TEAM_NAME } from "./constants";
import { useAuthSession } from "./hooks/useAuthSession";
import { useFutsalData } from "./hooks/useFutsalData";
import { usePendingClaimsCount } from "./hooks/usePendingClaimsCount";
import { nextUpcomingGamesByCalendar } from "./utils/game";
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
  const [pendingClaimsCount, refreshPendingClaimsCount] = usePendingClaimsCount(isAdmin);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);

  const [profilePlayerId, setProfilePlayerId] = useState(() =>
    new URLSearchParams(window.location.search).get("player")
  );

  const [seasonOverviewOpen, setSeasonOverviewOpen] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("team_stats") === "1" || sp.get("insights") === "1";
  });

  const [seasonSlug, setSeasonSlug] = useState(() =>
    readSeasonSlugFromSearch(new URLSearchParams(window.location.search))
  );

  const openSeasonOverview = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("team_stats", "1");
    url.searchParams.delete("insights");
    window.history.pushState({}, "", url);
    setSeasonOverviewOpen(true);
  }, []);

  const closeSeasonOverview = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("team_stats");
    url.searchParams.delete("insights");
    window.history.pushState({}, "", url);
    setSeasonOverviewOpen(false);
  }, []);

  const openPlayer = useCallback((id) => {
    if (!id) return;
    const url = new URL(window.location.href);
    const hadOverview =
      url.searchParams.get("team_stats") === "1" || url.searchParams.get("insights") === "1";
    url.searchParams.set("player", id);
    if (hadOverview) {
      url.searchParams.set("team_stats", "1");
      url.searchParams.delete("insights");
    }
    window.history.pushState({}, "", url);
    setProfilePlayerId(id);
  }, []);

  const closePlayer = useCallback(() => {
    const url = new URL(window.location.href);
    const hadOverview =
      url.searchParams.get("team_stats") === "1" || url.searchParams.get("insights") === "1";
    url.searchParams.delete("player");
    if (hadOverview) {
      url.searchParams.set("team_stats", "1");
      url.searchParams.delete("insights");
    }
    window.history.pushState({}, "", url);
    setProfilePlayerId(null);
  }, []);

  useEffect(() => {
    const onPop = () => {
      const sp = new URLSearchParams(window.location.search);
      setProfilePlayerId(sp.get("player"));
      setSeasonOverviewOpen(
        sp.get("team_stats") === "1" || sp.get("insights") === "1"
      );
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

  /** Legacy `?insights=1` opens the same page as team stats — normalize URL once. */
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("insights") === "1" && url.searchParams.get("team_stats") !== "1") {
      url.searchParams.set("team_stats", "1");
      url.searchParams.delete("insights");
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
    sortedFilteredGames,
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

  const nextAttendanceGames = useMemo(
    () => nextUpcomingGamesByCalendar(games, 3),
    [games]
  );

  const promotedNextGameIds = useMemo(() => {
    if (!currentPlayer) return new Set();
    return new Set(nextAttendanceGames.map((g) => g.id));
  }, [currentPlayer, nextAttendanceGames]);

  const sidebarNextAttendanceGames = useMemo(() => {
    if (promotedNextGameIds.size === 0) return nextAttendanceGames;
    return nextAttendanceGames.filter((g) => !promotedNextGameIds.has(g.id));
  }, [nextAttendanceGames, promotedNextGameIds]);

  const attendanceHighlightIds = useMemo(() => {
    const upcoming = nextUpcomingGamesByCalendar(games, 3);
    if (promotedNextGameIds.size === 0) return new Set(upcoming.map((g) => g.id));
    return new Set(upcoming.filter((g) => !promotedNextGameIds.has(g.id)).map((g) => g.id));
  }, [games, promotedNextGameIds]);

  const showNextGamesTiles = !!currentPlayer && nextAttendanceGames.length > 0;

  useEffect(() => {
    if (adminPanelOpen && isAdmin) refreshPendingClaimsCount();
  }, [adminPanelOpen, isAdmin, refreshPendingClaimsCount]);

  return (
    <div className="app dashboard">
      <a href="#match-details" className="skip-link">
        Skip to match details
      </a>
      <header className="dashboard-header">
        <div className="dashboard-header-main">
          <div className="dashboard-brand">
            <p className="dashboard-eyebrow">Team dashboard</p>
            <div className="dashboard-title-row">
              <h1>{TEAM_NAME}</h1>
              <FormChip games={games} />
            </div>
          </div>
          <nav className="dashboard-nav" aria-label="Team links">
            <button type="button" className="dashboard-nav-btn" onClick={openSeasonOverview}>
              Season overview
            </button>
            <a
              className="dashboard-nav-link"
              href="https://www.lzvcup.be/teams/detail/742"
              target="_blank"
              rel="noopener noreferrer"
            >
              LZV Cup ↗
            </a>
          </nav>
          <div className="dashboard-account">
            <AccountChip
              user={user}
              currentPlayer={currentPlayer}
              isAdmin={isAdmin}
              authLoading={authLoading}
              onSignInClick={() => setAuthModalOpen(true)}
              onSignOut={signOut}
              onAdminClick={isAdmin ? () => setAdminPanelOpen(true) : null}
              pendingClaimsCount={pendingClaimsCount}
            />
          </div>
        </div>
        <div className="dashboard-season" role="navigation" aria-label="Season">
          <span className="dashboard-season-label">Season</span>
          <div className="dashboard-season-track">
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

      <main
        className={`layout dashboard-layout${seasonOverviewOpen ? " layout--full" : ""}`}
      >
        {!seasonOverviewOpen && (
        <GameSidebar
          games={sortedFilteredGames}
          attendanceHighlightIds={attendanceHighlightIds}
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
          currentPlayerId={currentPlayer?.id ?? null}
          nextAttendanceGames={sidebarNextAttendanceGames}
          activeMainTab={tab}
        />
        )}

        <section className="content" id="match-details">
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

          {!loading && seasonOverviewOpen && (
            <SeasonOverviewPage
              games={games}
              players={players}
              attendance={attendance}
              stats={stats}
              seasonSlug={seasonSlug}
              seasonLabel={seasonLabel(seasonSlug)}
              onBack={closeSeasonOverview}
              onOpenPlayer={openPlayer}
            />
          )}

          {!loading && !seasonOverviewOpen && showNextGamesTiles && (
            <MyNextGamesTiles
              games={games}
              attendance={attendance}
              currentPlayer={currentPlayer}
              selectedGameId={selectedGameId}
              onJumpToGame={(id) => setSelectedGameId(id)}
              onMarkAttendance={(gameId, status) =>
                saveAttendance(currentPlayer.id, status, gameId)
              }
            />
          )}

          {!loading && !seasonOverviewOpen && selectedGame && (
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
                showAttendanceSummary={tab === "attendance"}
              />

              <section className="panel match-detail-panel" aria-label="Match workspace">
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
              </section>
            </>
          )}

          {!loading && !seasonOverviewOpen && !selectedGame && (
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
          refreshPendingClaimsCount();
        }}
      />
    </div>
  );
}