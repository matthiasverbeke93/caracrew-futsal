import { describe, expect, it } from "vitest";
import { findVenueAddress, venueMapsQuery, venueMapsUrl } from "./venue";
import { VENUE_ADDRESSES } from "../data/venues";

describe("findVenueAddress", () => {
  it("resolves a hall by its exact games.location string", () => {
    expect(findVenueAddress("Winketkaai Mechelen")).toEqual({
      street: "Winketkaai 39",
      city: "Mechelen",
    });
  });

  it("is tolerant of case, padding and the non-breaking spaces LZV emits", () => {
    expect(findVenueAddress("  de nekker mechelen ")).toEqual({
      street: "Nekkerspoel-Borcht 19",
      city: "Mechelen",
    });
    expect(findVenueAddress("Winketkaai Mechelen")).toEqual({
      street: "Winketkaai 39",
      city: "Mechelen",
    });
  });

  it("returns null for an unknown hall and for no venue", () => {
    expect(findVenueAddress("Sporthal Elsewhere")).toBeNull();
    expect(findVenueAddress("")).toBeNull();
    expect(findVenueAddress(null)).toBeNull();
    expect(findVenueAddress(undefined)).toBeNull();
  });
});

describe("venueMapsQuery", () => {
  it("uses the street address when the hall is known", () => {
    expect(venueMapsQuery("Kouter Leest")).toBe("Dorpstraat 67, Leest, Belgium");
  });

  it("falls back to the venue text for a hall we have not listed", () => {
    expect(venueMapsQuery("Sporthal Elsewhere")).toBe("Sporthal Elsewhere, Belgium");
  });

  it("is null when there is no venue", () => {
    expect(venueMapsQuery("")).toBeNull();
    expect(venueMapsQuery("   ")).toBeNull();
    expect(venueMapsQuery(null)).toBeNull();
  });
});

describe("venueMapsUrl", () => {
  it("builds an encoded Google Maps search URL", () => {
    expect(venueMapsUrl("Heiveld St-Katelijne-Waver")).toBe(
      "https://www.google.com/maps/search/?api=1&query=" +
        "Dreefvelden%201%2C%20St-Katelijne-Waver%2C%20Belgium"
    );
  });

  it("is null when there is no venue, so callers can render plain text", () => {
    expect(venueMapsUrl(null)).toBeNull();
    expect(venueMapsUrl("")).toBeNull();
  });

  it("produces a usable link for every hall in the table", () => {
    for (const name of Object.keys(VENUE_ADDRESSES)) {
      const url = venueMapsUrl(name);
      expect(url, name).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=\S+$/);
      expect(decodeURIComponent(url), name).toContain("Belgium");
    }
  });
});
