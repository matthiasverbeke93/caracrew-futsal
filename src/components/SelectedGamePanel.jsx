import { useState } from "react";
import { MIN_PLAYERS_WARNING, TEAM_NAME } from "../constants";
import { getDifficulty } from "../utils/difficulty";
import { isPlayed } from "../utils/game";
import { buildCurrentPageGameShareUrl, buildGameWhatsAppShareUrl, buildWhatsAppNudgeUrl } from "../utils/formatMatch";
import { getHeadToHeadSummary } from "../utils/headToHead";
import { cleanOpponentName } from "../utils/opponent";

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
  allGames,
  fixedPlayers,
  gameAttendance,
  opponentStrengths,
  seasonSlug,
  saveFinalScore,
  canManageGame,
  /** When false (e.g. Game stats tab), hide the Playing / If needed / Can't / Missing bar */
  showAttendanceSummary = true,
}) {
  const [shareFeedback, setShareFeedback] = useState(null);
  const opponentName = cleanOpponentName(selectedGame.opponent);
  const difficulty = getDifficulty(selectedGame.opponent, opponentStrengths, seasonSlug);
  const h2h = getHeadToHeadSummary(allGames, selectedGame.opponent);
  const played = isPlayed(selectedGame);

  const missingFixed = (fixedPlayers || []).filter(
    (p) => !(gameAttendance || []).some((a) => a.player_id === p.id)
  );

  async function handleShare() {
    const shareUrl = buildCurrentPageGameShareUrl(selectedGame.id, selectedGame.season_slug);
    const shareData = {
      title: `${TEAM_NAME} vs ${opponentName}`,
      text: `${selectedGame.game_date} · ${selectedGame.game_time || ""} · ${selectedGame.location || ""}`.trim(),
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
    const wa = buildWhatsAppNudgeUrl(selectedGame, firstNames, {
      fixedRoster: fixedPlayers.length,
      playing: counts.playing,
      if_needed: counts.if_needed,
      cant: counts.cant,
      missing: counts.missing,
      guests: counts.guests,
    });
    window.open(wa, "_blank", "noopener,noreferrer");
  }

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
        <div className="share-actions">
          <button
            type="button"
            className="share-button"
            onClick={handleShare}
            aria-label="Share link to this game"
          >
            {shareFeedback || "Share"}
          </button>
          <button
            type="button"
            className="whatsapp-button"
            onClick={handleWhatsAppShare}
            title="Opens WhatsApp Web or the app with this match link"
            aria-label="Share match link in WhatsApp"
          >
            WhatsApp
          </button>
          {!played && missingFixed.length > 0 && canManageGame && (
            <button
              type="button"
              className="whatsapp-button nudge"
              onClick={handleNudge}
              title={`Nudge ${missingFixed.map((p) => p.name).join(", ")}`}
            >
              Nudge missing ({missingFixed.length})
            </button>
          )}
        </div>
      </div>
      <p>
        {selectedGame.game_date} · {selectedGame.game_time} · {selectedGame.location}
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
      )}

      {played && (
        <FinalScoreFields
          key={selectedGame.id}
          game={selectedGame}
          canManageGame={canManageGame}
          saveFinalScore={saveFinalScore}
        />
      )}

      {!played && counts.playing < MIN_PLAYERS_WARNING && (
        <div className="warning-box">Low player count: only {counts.playing} marked as playing.</div>
      )}

      {showAttendanceSummary && (
        <div className="count-grid">
          <div>
            <strong>{counts.playing}</strong>
            <span>Playing</span>
          </div>
          <div>
            <strong>{counts.if_needed}</strong>
            <span>If needed</span>
          </div>
          <div>
            <strong>{counts.cant}</strong>
            <span>Can't</span>
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
