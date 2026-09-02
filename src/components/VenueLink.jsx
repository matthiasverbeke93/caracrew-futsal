import { venueMapsUrl } from "../utils/venue";

/** Google Maps' own "navigate" arrow, so the link reads as a map link at a glance. */
function NavigationIcon() {
  return (
    <svg
      className="venue-link-icon"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 3 3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z" />
    </svg>
  );
}

/**
 * A fixture's venue, linked to Google Maps.
 *
 * Renders plain text (no link) when there is no venue yet, and falls back to `Venue TBD` so
 * callers can drop it straight in where they used to render `game.location`.
 *
 * **Only usable outside another interactive element.** The sidebar fixture rows and calendar
 * cells are `<button>`s, and an `<a>` inside a `<button>` is invalid HTML — those keep showing
 * the venue as text; the linked copy is on the match panel the row opens.
 */
export default function VenueLink({ location, fallback = "Venue TBD", className = "" }) {
  const text = location ? String(location).trim() : "";
  const url = venueMapsUrl(text);
  if (!text || !url) return <>{fallback}</>;
  return (
    <a
      className={`venue-link ${className}`.trim()}
      href={url}
      target="_blank"
      rel="noreferrer"
      title={`Open ${text} in Google Maps`}
    >
      <span className="venue-link-text">{text}</span>
      <NavigationIcon />
    </a>
  );
}
