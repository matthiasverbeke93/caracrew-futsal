import { cleanOpponentName } from "../utils/opponent";

export default function MatchFixtureNav({ games, selectedGameId, onSelectGame }) {
  if (!games?.length || !selectedGameId) return null;
  const idx = games.findIndex((g) => g.id === selectedGameId);
  if (idx < 0) return null;

  const prev = idx > 0 ? games[idx - 1] : null;
  const next = idx < games.length - 1 ? games[idx + 1] : null;
  if (!prev && !next) return null;

  const label = (g) => (g ? cleanOpponentName(g.opponent) : "");

  return (
    <nav className="match-fixture-nav" aria-label="Browse fixtures">
      <button
        type="button"
        className="match-fixture-nav-btn"
        disabled={!prev}
        onClick={() => prev && onSelectGame(prev.id)}
        title={prev ? `${prev.game_date} · ${label(prev)}` : undefined}
      >
        ← Previous
      </button>
      <span className="match-fixture-nav-meta">
        {idx + 1} / {games.length}
        <span className="match-fixture-nav-current" title={label(games[idx])}>
          {label(games[idx])}
        </span>
      </span>
      <button
        type="button"
        className="match-fixture-nav-btn"
        disabled={!next}
        onClick={() => next && onSelectGame(next.id)}
        title={next ? `${next.game_date} · ${label(next)}` : undefined}
      >
        Next →
      </button>
    </nav>
  );
}
