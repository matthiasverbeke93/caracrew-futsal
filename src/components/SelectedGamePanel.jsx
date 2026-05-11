import { useState } from "react";
import { MIN_PLAYERS_WARNING, TEAM_NAME } from "../constants";
import { getDifficulty } from "../utils/difficulty";
import { isPlayed } from "../utils/game";

export default function SelectedGamePanel({
  selectedGame,
  counts,
}) {
  const [shareFeedback, setShareFeedback] = useState(null);
  const difficulty = getDifficulty(selectedGame.opponent);

  async function handleShare() {
    const url = new URL(window.location.href);
    url.searchParams.set("game", selectedGame.id);
    const shareUrl = url.toString();
    const shareData = {
      title: `${TEAM_NAME} vs ${selectedGame.opponent}`,
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

  return (
    <section className="panel selected-game-panel">
      <div className="selected-game-header">
        <h2>{selectedGame.title || selectedGame.opponent}</h2>
        <button
          type="button"
          className="share-button"
          onClick={handleShare}
          aria-label="Share link to this game"
        >
          {shareFeedback || "Share"}
        </button>
      </div>
      <p>
        {selectedGame.game_date} · {selectedGame.game_time} · {selectedGame.location}
      </p>

      {difficulty && (
        <div className="selected-game-difficulty">
          <span className={`difficulty-chip ${difficulty.className}`}>
            {difficulty.label} · Position {difficulty.position} · {difficulty.ptnPerMatch} pts/match
          </span>
        </div>
      )}

      {!isPlayed(selectedGame) && counts.playing < MIN_PLAYERS_WARNING && (
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
