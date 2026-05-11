import { useState } from "react";
import { MIN_PLAYERS_WARNING, TEAM_NAME } from "../constants";
import { getDifficulty } from "../utils/difficulty";
import { isPlayed } from "../utils/game";
import { buildWhatsAppShareUrl } from "../utils/formatMatch";
import { getHeadToHeadSummary } from "../utils/headToHead";
import { cleanOpponentName } from "../utils/opponent";

function FinalScoreFields({ game, canWrite, saveFinalScore }) {
  const [homeScoreInput, setHomeScoreInput] = useState(() =>
    game.home_score == null || game.home_score === undefined ? "" : String(game.home_score)
  );
  const [awayScoreInput, setAwayScoreInput] = useState(() =>
    game.away_score == null || game.away_score === undefined ? "" : String(game.away_score)
  );

  function persistScore() {
    if (!canWrite) return;
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
          disabled={!canWrite}
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
          disabled={!canWrite}
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
  saveFinalScore,
  canWrite,
}) {
  const [shareFeedback, setShareFeedback] = useState(null);
  const opponentName = cleanOpponentName(selectedGame.opponent);
  const difficulty = getDifficulty(selectedGame.opponent);
  const h2h = getHeadToHeadSummary(allGames, selectedGame.opponent);
  const played = isPlayed(selectedGame);

  async function handleShare() {
    const url = new URL(window.location.href);
    url.searchParams.set("game", selectedGame.id);
    const shareUrl = url.toString();
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

  function handleWhatsApp() {
    const wa = buildWhatsAppShareUrl(selectedGame);
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
        <h2>{selectedGame.title || opponentName}</h2>
        <div className="share-actions">
          <button
            type="button"
            className="share-button"
            onClick={handleShare}
            aria-label="Share link to this game"
          >
            {shareFeedback || "Share"}
          </button>
          <button type="button" className="whatsapp-button" onClick={handleWhatsApp}>
            Send to WhatsApp
          </button>
        </div>
      </div>
      <p>
        {selectedGame.game_date} · {selectedGame.game_time} · {selectedGame.location}
      </p>

      {resultChip && <div className="selected-game-meta-row">{resultChip}</div>}

      {difficulty && (
        <div className="selected-game-difficulty">
          <span className={`difficulty-chip ${difficulty.className}`}>
            {difficulty.label} · Position {difficulty.position} · {difficulty.ptnPerMatch} pts/match
          </span>
          {h2h && (
            <div className="head-to-head-inline">
              {h2h.lastLine && <span>{h2h.lastLine}</span>}
              {h2h.seasonLine && <span>{h2h.seasonLine}</span>}
            </div>
          )}
        </div>
      )}

      {!difficulty && h2h && (
        <div className="head-to-head-block standalone">
          {h2h.lastLine && <span>{h2h.lastLine}</span>}
          {h2h.seasonLine && <span>{h2h.seasonLine}</span>}
        </div>
      )}

      {played && (
        <FinalScoreFields
          key={selectedGame.id}
          game={selectedGame}
          canWrite={canWrite}
          saveFinalScore={saveFinalScore}
        />
      )}

      {!played && counts.playing < MIN_PLAYERS_WARNING && (
        <div className="warning-box">Low player count: only {counts.playing} marked as playing.</div>
      )}

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
    </section>
  );
}
