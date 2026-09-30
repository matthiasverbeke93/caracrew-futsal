import { useEffect, useState } from "react";

/**
 * Phone-only bottom tab bar (hidden above the mobile breakpoint in CSS). It
 * replaces the header nav on small screens so the app reads like a native one:
 * Match / Fixtures switch the single visible column, Stats opens the season
 * page, More holds the rarely-used links in a bottom sheet.
 */
const ICONS = {
  match: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5l4 2.9-1.5 4.7h-5L8 10.4z" />
    </svg>
  ),
  fixtures: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  ),
  stats: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M5 20V11M12 20V5M19 20v-6" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="5.5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="18.5" cy="12" r="1.3" />
    </svg>
  ),
};

export default function MobileTabBar({ active, onMatch, onFixtures, onStats, onGuide, onBug }) {
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const tab = (key, label, onClick) => (
    <button
      type="button"
      className={`mobile-tab${active === key ? " active" : ""}`}
      aria-current={active === key ? "page" : undefined}
      onClick={() => {
        setMoreOpen(false);
        onClick();
      }}
    >
      {ICONS[key]}
      <span>{label}</span>
    </button>
  );

  const sheetAction = (fn) => () => {
    setMoreOpen(false);
    fn();
  };

  return (
    <>
      {moreOpen && (
        <div className="mobile-sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div
            className="mobile-sheet"
            role="dialog"
            aria-label="More"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-sheet-handle" aria-hidden />
            <button type="button" className="mobile-sheet-item" onClick={sheetAction(onGuide)}>
              How it works
            </button>
            <a
              className="mobile-sheet-item"
              href="https://www.lzvcup.be/teams/detail/742"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMoreOpen(false)}
            >
              LZV Cup ↗
            </a>
            <button type="button" className="mobile-sheet-item" onClick={sheetAction(onBug)}>
              Report a bug
            </button>
          </div>
        </div>
      )}
      <nav className="mobile-tabbar" aria-label="App sections">
        {tab("match", "Match", onMatch)}
        {tab("fixtures", "Fixtures", onFixtures)}
        {tab("stats", "Stats", onStats)}
        <button
          type="button"
          className={`mobile-tab${moreOpen ? " active" : ""}`}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
        >
          {ICONS.more}
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
