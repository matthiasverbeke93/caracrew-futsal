import { useEffect, useId, useRef, useState } from "react";
import { MIN_PLAYERS_WARNING, TEAM_NAME } from "../constants";
import { getDifficulty } from "../utils/difficulty";
import { isGameFull, isPlayed } from "../utils/game";
import {
  buildCurrentPageGameShareUrl,
  buildGameWhatsAppShareUrl,
  buildWhatsAppNudgeUrl,
  formatFixtureShareText,
} from "../utils/formatMatch";
import { goalkeeperNames } from "../utils/goalkeeper";
import { getHeadToHeadSummary } from "../utils/headToHead";
import { focusInitialMenuItem, handleMenuArrowKeys } from "../utils/menuNav";
import { cleanOpponentName } from "../utils/opponent";
import VenueLink from "./VenueLink";

/**
 * The per-fixture goalkeeper check.
 *
 * Two different questions, so two different lines: *before* the match it is "is a
 * keeper In?" (roster flag × RSVP), and *after* it is "who actually kept goal?"
 * (the per-game flag, which is often somebody who is not a keeper at all).
 */
function renderKeeperLine({ keeperSummary, played, anyResponses, canManageGame }) {
  if (!keeperSummary) return null;
  const { anyKeeperKnown, hasKeeper, hasRecordedKeeper, recorded, playing, ifNeeded } =
    keeperSummary;

  if (played) {
    if (hasRecordedKeeper) {
      return (
        <div className="keeper-line keeper-line--info">
          🧤 In goal: {goalkeeperNames(recorded)}
        </div>
      );
    }
    // Only the person who can fix it gets nagged about it.
    return canManageGame ? (
      <div className="keeper-line keeper-line--info">
        🧤 No keeper recorded for this match.
        <span className="keeper-line-detail">Tick “Keeper” on the Stats tab.</span>
      </div>
    ) : null;
  }

  // Nothing to check against until somebody is flagged as a keeper in the admin panel.
  if (!anyKeeperKnown) return null;
  // …and before the first RSVP "no keeper In" is not news, it is just an empty match.
  if (!anyResponses) return null;

  if (hasKeeper) {
    return (
      <div className="keeper-line keeper-line--ok">
        🧤 Keeper In: {goalkeeperNames(playing)}
      </div>
    );
  }

  return (
    <div className="keeper-line keeper-line--warn">
      🧤 No goalkeeper In.
      {ifNeeded.length > 0 && (
        <span className="keeper-line-detail">
          On standby: {goalkeeperNames(ifNeeded)}
        </span>
      )}
    </div>
  );
}

function FinalScoreFields({ game, canManageGame, saveFinalScore }) {
  const [homeScoreInput, setHomeScoreInput] = useState(() =>
    game.home_score == null || game.home_score === undefined ? "" : String(game.home_score)
  );
  const [awayScoreInput, setAwayScoreInput] = useState(() =>
    game.away_score == null || game.away_score === undefined ? "" : String(game.away_score)
  );

  function persistScore() {
    if (!canManageGame) return;
    saveFinalScore(homeScoreInput, awayScoreInput);
  }

  return (
    <div className="final-score-box">
      <div className="section-label">Final score (Caracrew – opponent)</div>
      <div className="final-score-inputs">
        <input
          type="number"
          min="0"
          inputMode="numeric"
          aria-label="Caracrew goals"
          value={homeScoreInput}
          disabled={!canManageGame}
          title={!canManageGame ? "Admin only" : undefined}
          onChange={(e) => setHomeScoreInput(e.target.value)}
          onBlur={persistScore}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <span className="final-score-sep">–</span>
        <input
          type="number"
          min="0"
          inputMode="numeric"
          aria-label="Opponent goals"
          value={awayScoreInput}
          disabled={!canManageGame}
          title={!canManageGame ? "Admin only" : undefined}
          onChange={(e) => setAwayScoreInput(e.target.value)}
          onBlur={persistScore}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </div>
    </div>
  );
}

export default function SelectedGamePanel({
  selectedGame,
  counts,
  keeperSummary,
  allGames,
  fixedPlayers,
  gameAttendance,
  opponentStrengths,
  seasonSlug,
  saveFinalScore,
  canManageGame,
  /** When false (e.g. Game stats tab), hide the In / If needed / Out / Missing bar */
  showAttendanceSummary = true,
}) {
  const [shareFeedback, setShareFeedback] = useState(null);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const shareWrapRef = useRef(null);
  const shareMenuRef = useRef(null);
  const shareMenuId = useId();
  const opponentName = cleanOpponentName(selectedGame.opponent);
  const difficulty = getDifficulty(selectedGame.opponent, opponentStrengths, seasonSlug);
  const h2h = getHeadToHeadSummary(allGames, selectedGame.opponent);
  const played = isPlayed(selectedGame);

  const missingFixed = (fixedPlayers || []).filter(
    (p) => !(gameAttendance || []).some((a) => a.player_id === p.id)
  );
  // Nothing to chase once the match is full — RSVP is closed for the people who
  // have not answered, so a nudge would ask them to press a disabled button.
  const canNudge =
    !played && missingFixed.length > 0 && canManageGame && !isGameFull(counts.playing);

  useEffect(() => {
    if (!shareMenuOpen) return undefined;
    function onPointerDown(e) {
      if (shareWrapRef.current && !shareWrapRef.current.contains(e.target)) {
        setShareMenuOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === "Escape") setShareMenuOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [shareMenuOpen]);

  useEffect(() => {
    if (shareMenuOpen) focusInitialMenuItem(shareMenuRef.current);
  }, [shareMenuOpen]);

  async function handleShare() {
    const shareUrl = buildCurrentPageGameShareUrl(selectedGame.id, selectedGame.season_slug);
    const shareData = {
      title: `${TEAM_NAME} vs ${opponentName}`,
      // Same body as the WhatsApp share, so a fixture reads identically wherever it lands.
      text: formatFixtureShareText(selectedGame),
      url: shareUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareFeedback("Link copied");
      setTimeout(() => setShareFeedback(null), 2000);
    } catch (err) {
      console.error("Share failed:", err);
      setShareFeedback("Copy failed");
      setTimeout(() => setShareFeedback(null), 2000);
    }
  }

  function handleWhatsAppShare() {
    const wa = buildGameWhatsAppShareUrl(selectedGame);
    window.open(wa, "_blank", "noopener,noreferrer");
  }

  function handleNudge() {
    const firstNames = missingFixed.map((p) => p.name.split(" ")[0]);
    // Roster-only figures: the nudge prints them next to the roster size, so the
    // guest-inclusive totals in `counts.playing` & co. would not add up (see `counts`).
    const wa = buildWhatsAppNudgeUrl(selectedGame, firstNames, {
      fixedRoster: counts.roster?.size ?? fixedPlayers.length,
      playing: counts.roster?.playing ?? counts.playing,
      if_needed: counts.roster?.if_needed ?? counts.if_needed,
      cant: counts.roster?.cant ?? counts.cant,
      guests: counts.guests,
      guestPlaying: counts.guestBreakdown?.playing ?? 0,
      guestIfNeeded: counts.guestBreakdown?.if_needed ?? 0,
      guestCant: counts.guestBreakdown?.cant ?? 0,
    });
    window.open(wa, "_blank", "noopener,noreferrer");
  }

  const keeperLine = renderKeeperLine({
    keeperSummary,
    played,
    anyResponses: counts.playing + counts.if_needed + counts.cant > 0,
    canManageGame,
  });

  const resultChip =
    played &&
    selectedGame.home_score != null &&
    selectedGame.away_score != null && (
      <span className="result-chip" title="Caracrew – opponent">
        {selectedGame.home_score} – {selectedGame.away_score}
      </span>
    );

  return (
    <section className="panel selected-game-panel">
      <div className="selected-game-header">
        <h2>
          <span className="vs-prefix">vs</span> {opponentName}
        </h2>
        <div className="share-actions" ref={shareWrapRef}>
          <button
            type="button"
            className="share-button share-toggle"
            aria-haspopup="menu"
            aria-expanded={shareMenuOpen}
            aria-controls={shareMenuId}
            onClick={() => setShareMenuOpen((v) => !v)}
          >
            {shareFeedback || "Share"}
            <span className="share-toggle-caret" aria-hidden="true">
              ▾
            </span>
          </button>
          {shareMenuOpen && (
            <div
              className="share-menu"
              id={shareMenuId}
              role="menu"
              ref={shareMenuRef}
              onKeyDown={handleMenuArrowKeys}
            >
              <button
                type="button"
                role="menuitem"
                className="share-menu-item"
                onClick={() => {
                  setShareMenuOpen(false);
                  handleShare();
                }}
              >
                Copy / share link
              </button>
              <button
                type="button"
                role="menuitem"
                className="share-menu-item"
                onClick={() => {
                  setShareMenuOpen(false);
                  handleWhatsAppShare();
                }}
              >
                Share in WhatsApp
              </button>
              {canNudge && (
                <button
                  type="button"
                  role="menuitem"
                  className="share-menu-item"
                  title={`Nudge ${missingFixed.map((p) => p.name).join(", ")}`}
                  onClick={() => {
                    setShareMenuOpen(false);
                    handleNudge();
                  }}
                >
                  Nudge missing ({missingFixed.length})
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <p>
        {selectedGame.game_date} · {selectedGame.game_time} ·{" "}
        <VenueLink location={selectedGame.location} />
      </p>

      <div className="selected-game-context">
        {resultChip}
        {difficulty && (
          <span
            className={`difficulty-chip ${difficulty.className}`}
            title={
              difficulty.strengthScore != null
                ? `Strength ${difficulty.strengthScore}/100`
                : undefined
            }
          >
            {difficulty.label} · Pos {difficulty.position}
            {difficulty.ptnPerMatch != null ? ` · ${difficulty.ptnPerMatch} pts/m` : ""}
          </span>
        )}
      </div>

      {(difficulty?.lastSeason || h2h) && (
        <details className="match-context">
          <summary className="match-context-summary">Match context</summary>
          <dl className="meta-list">
            {difficulty?.lastSeason && (
              <div>
                <dt>Last year's league standing</dt>
                <dd>
                  Pos {difficulty.lastSeason.position}
                  {difficulty.lastSeason.reeks ? ` · ${difficulty.lastSeason.reeks}` : ""}
                </dd>
              </div>
            )}
            {h2h?.lastLine && (
              <div>
                <dt>Last meeting</dt>
                <dd>{h2h.lastLine.replace(/^Last meeting:\s*/, "")}</dd>
              </div>
            )}
            {h2h?.seasonLine && (
              <div>
                <dt>Season vs them</dt>
                <dd>{h2h.seasonLine.replace(/^Season vs them:\s*/, "")}</dd>
              </div>
            )}
          </dl>
        </details>
      )}

      {played && (
        <FinalScoreFields
          key={selectedGame.id}
          game={selectedGame}
          canManageGame={canManageGame}
          saveFinalScore={saveFinalScore}
        />
      )}

      {/* Only warn once somebody has actually answered — before that "only 0 marked In"
          fires on every fixture of a fresh season and means nothing. */}
      {!played &&
        counts.playing + counts.if_needed + counts.cant > 0 &&
        counts.playing < MIN_PLAYERS_WARNING && (
          <div className="warning-box">Low player count: only {counts.playing} marked In.</div>
        )}

      {keeperLine}

      {!played && isGameFull(counts.playing) && (
        <div className="full-box">
          Match full — {counts.playing} players In. RSVP is closed; if somebody drops out the spot
          reopens.
        </div>
      )}

      {showAttendanceSummary && (
        <div className="count-grid">
          <div>
            <strong>{counts.playing}</strong>
            <span>In</span>
          </div>
          <div>
            <strong>{counts.if_needed}</strong>
            <span>If needed</span>
          </div>
          <div>
            <strong>{counts.cant}</strong>
            <span>Out</span>
          </div>
          <div>
            <strong>{counts.missing}</strong>
            <span>Missing</span>
          </div>
        </div>
      )}
    </section>
  );
}
