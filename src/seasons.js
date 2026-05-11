/** DB value on `games.season_slug` and `opponent_strength.season_slug`; also URL `?season=`. */
export const SEASON_OPTIONS = [
  { slug: "2526", label: "25-26", isDefault: true },
  { slug: "2627", label: "26-27", isDefault: false },
];

export const DEFAULT_SEASON_SLUG =
  SEASON_OPTIONS.find((s) => s.isDefault)?.slug ?? "2526";

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
