import { useEffect, useId, useRef, useState } from "react";
import { focusInitialMenuItem, handleMenuArrowKeys } from "../utils/menuNav";

/**
 * Desktop header "More ▾" dropdown for the rarely-used links (How it works,
 * Report a bug), so the header keeps Stats and LZV Cup as the only buttons.
 * Same menu idiom and styling as AccountChip. Phones and tablets get these from
 * the More tab in MobileTabBar instead (the header nav is hidden there).
 */
export default function HeaderMoreMenu({ onGuide, onBug }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) focusInitialMenuItem(menuRef.current);
  }, [open]);

  const item = (label, fn, title) => (
    <button
      type="button"
      role="menuitem"
      className="account-menu-item"
      title={title}
      onClick={() => {
        setOpen(false);
        fn();
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="account-chip-wrap header-more" ref={wrapRef}>
      <button
        type="button"
        className="dashboard-nav-btn dashboard-nav-btn-quiet"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        More <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div
          className="account-menu"
          id={menuId}
          role="menu"
          ref={menuRef}
          onKeyDown={handleMenuArrowKeys}
        >
          {item("How it works", onGuide, "How the app works: RSVP, stats, Man of the Match")}
          {item("Report a bug", onBug, "Report a bug or suggest something")}
        </div>
      )}
    </div>
  );
}
