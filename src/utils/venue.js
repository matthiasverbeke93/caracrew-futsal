import { VENUE_ADDRESSES } from "../data/venues";

/**
 * Google Maps "search" endpoint: opens the place card, one tap from directions. Deliberately
 * not `maps/dir/` (what LZV's own Route button uses) — clicking a venue name should show you
 * where it is, not start navigating.
 */
const MAPS_SEARCH_URL = "https://www.google.com/maps/search/?api=1&query=";

/** All halls are Belgian; spelling it out keeps the geocode right for someone abroad. */
const COUNTRY = "Belgium";

/** Trim + collapse whitespace, including the non-breaking spaces LZV's data carries. */
function tidyVenueText(location) {
  return String(location ?? "")
    .replace(/[\u00a0\s]+/g, " ")
    .trim();
}

const ADDRESS_BY_KEY = new Map(
  Object.entries(VENUE_ADDRESSES).map(([name, address]) => [
    tidyVenueText(name).toLowerCase(),
    address,
  ])
);

/** The known street address for a `games.location` string, or null. */
export function findVenueAddress(location) {
  const key = tidyVenueText(location).toLowerCase();
  if (!key) return null;
  return ADDRESS_BY_KEY.get(key) ?? null;
}

/**
 * The Google Maps query for a venue: its street address when we know the hall, otherwise the
 * venue text itself, which still lands close enough to be useful for a hall we haven't listed.
 */
export function venueMapsQuery(location) {
  const raw = tidyVenueText(location);
  if (!raw) return null;
  const address = findVenueAddress(raw);
  const parts = address ? [address.street, address.city] : [raw];
  return [...parts, COUNTRY].join(", ");
}

/** Google Maps URL for a fixture's venue, or null when the fixture has no venue text. */
export function venueMapsUrl(location) {
  const query = venueMapsQuery(location);
  if (!query) return null;
  return `${MAPS_SEARCH_URL}${encodeURIComponent(query)}`;
}
