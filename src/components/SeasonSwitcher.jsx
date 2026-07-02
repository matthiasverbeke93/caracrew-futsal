import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SEASON_OPTIONS, seasonLabel } from "../seasons";
import { focusInitialMenuItem, handleMenuArrowKeys } from "../utils/menuNav";

/**
 * A single season dropdown. Shows the selected season (defaults to the current one)
 * and lets any season — current or past — be picked from the same list.
 */
export default function SeasonSwitcher({ seasonSlug, onSelect }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  // Newest season first.
  const options = useMemo(
    () => [...SEASON_OPTIONS].sort((a, b) => String(b.slug).localeCompare(String(a.slug))),
    []
  );

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

  useEffect(() => {
    if (menuOpen) focusInitialMenuItem(menuRef.current);
  }, [menuOpen]);

  function choose(slug) {
    setMenuOpen(false);
    if (slug !== seasonSlug) onSelect(slug);
  }

  return (
    <div className="season-select" ref={wrapRef}>
      <span className="season-select-label">Season</span>
      <button
        type="button"
        className="season-select-toggle"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        onClick={() => setMenuOpen((v) => !v)}
      >
        {seasonLabel(seasonSlug)}
        <span className="season-select-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {menuOpen && (
        <div
          className="season-select-menu"
          id={menuId}
          role="menu"
          ref={menuRef}
          onKeyDown={handleMenuArrowKeys}
        >
          {options.map((opt) => {
            const isActive = opt.slug === seasonSlug;
            return (
              <button
                key={opt.slug}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                className={`season-select-item ${isActive ? "active" : ""}`}
                onClick={() => choose(opt.slug)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
