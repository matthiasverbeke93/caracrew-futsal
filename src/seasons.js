/** DB value on `games.season_slug` and `opponent_strength.season_slug`; also URL `?season=`. */
export const SEASON_OPTIONS = [
  { slug: "2526", label: "25-26", isDefault: false },
  { slug: "2627", label: "26-27", isDefault: true },
];

export const DEFAULT_SEASON_SLUG =
  SEASON_OPTIONS.find((s) => s.isDefault)?.slug ?? "2627";

/** Seasons that should stay read-only while they are being prepared. */
export const SEASON_SLUGS_PREVIEW_LOCKED = Object.freeze([]);

/** @deprecated Use {@link SEASON_SLUGS_PREVIEW_LOCKED} */
export const SEASON_SLUGS_WITH_VOTING_LOCKED = SEASON_SLUGS_PREVIEW_LOCKED;

export function isSeasonPreviewLocked(slug) {
  return typeof slug === "string" && SEASON_SLUGS_PREVIEW_LOCKED.includes(slug);
}

export function isSeasonVotingLocked(slug) {
  return isSeasonPreviewLocked(slug);
}

export function isSeasonAttendanceLocked(slug) {
  return isSeasonPreviewLocked(slug);
}

export function isSeasonSlug(value) {
  return typeof value === "string" && SEASON_OPTIONS.some((o) => o.slug === value);
}

export function seasonLabel(slug) {
  return SEASON_OPTIONS.find((o) => o.slug === slug)?.label ?? slug;
}

export function readSeasonSlugFromSearch(searchParams) {
  const raw = searchParams.get("season");
  return isSeasonSlug(raw) ? raw : DEFAULT_SEASON_SLUG;
}
