import { useEffect, useId, useRef, useState } from "react";
import {
  CURRENT_SEASON_OPTION,
  CURRENT_SEASON_SLUG,
  HISTORICAL_SEASON_OPTIONS,
  seasonLabel,
} from "../seasons";

/**
 * Season switcher: the current campaign sits up front as a prominent pill, while
 * older seasons live behind a "Historical seasons" dropdown so the header stays
 * focused on the season in play. Falls back to a single pill when no past seasons exist.
 */
export default function SeasonSwitcher({ seasonSlug, onSelect }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);
  const menuId = useId();

  const hasHistory = HISTORICAL_SEASON_OPTIONS.length > 0;
  const currentActive = seasonSlug === CURRENT_SEASON_SLUG;
  const historyActive = hasHistory && !currentActive;

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onPointerDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function choose(slug) {
    setMenuOpen(false);
    if (slug !== seasonSlug) onSelect(slug);
  }

  return (
    <div className="dashboard-season" role="navigation" aria-label="Season">
      <span className="dashboard-season-label">Season</span>
      <div className="dashboard-season-track">
        <button
          type="button"
          className={`season-pill ${currentActive ? "active" : ""}`}
          aria-pressed={currentActive}
          onClick={() => choose(CURRENT_SEASON_SLUG)}
        >
          {CURRENT_SEASON_OPTION.label}
        </button>

        {hasHistory && (
          <div className="season-history" ref={wrapRef}>
            <button
              type="button"
              className={`season-pill season-history-toggle ${historyActive ? "active" : ""}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {historyActive ? `Historical · ${seasonLabel(seasonSlug)}` : "Historical seasons"}
              <span className="season-history-caret" aria-hidden="true">
                ▾
              </span>
            </button>

            {menuOpen && (
              <div className="season-history-menu" id={menuId} role="menu">
                {HISTORICAL_SEASON_OPTIONS.map((opt) => {
                  const isActive = opt.slug === seasonSlug;
                  return (
                    <button
                      key={opt.slug}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActive}
                      className={`season-history-item ${isActive ? "active" : ""}`}
                      onClick={() => choose(opt.slug)}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
