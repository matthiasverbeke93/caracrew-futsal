import { getRecentForm } from "../utils/form";
import { cleanOpponentName } from "../utils/opponent";

export default function FormChip({ games, n = 5 }) {
  const form = getRecentForm(games, n);
  if (form.length === 0) return null;
  return (
    <div className="form-chip" aria-label="Recent form">
      <span className="form-chip-label">Form</span>
      <ol className="form-chip-list">
        {form
          .slice()
          .reverse()
          .map(({ result, game }) => (
            <li
              key={game.id}
              className={`form-chip-cell form-${result.toLowerCase()}`}
              title={`${game.game_date} vs ${cleanOpponentName(game.opponent)}${
                game.home_score != null && game.away_score != null
                  ? ` — ${game.home_score}–${game.away_score}`
                  : ""
              }`}
            >
              {result}
            </li>
          ))}
      </ol>
    </div>
  );
}
