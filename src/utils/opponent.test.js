import { describe, expect, it } from "vitest";
import { cleanOpponentName } from "./opponent.js";

describe("cleanOpponentName", () => {
  it("returns empty string for falsy input", () => {
    expect(cleanOpponentName("")).toBe("");
    expect(cleanOpponentName(null)).toBe("");
    expect(cleanOpponentName(undefined)).toBe("");
  });

  it("strips a trailing score (any dash variant) and anything after it", () => {
    expect(cleanOpponentName("FC Foo 3-2")).toBe("FC Foo");
    expect(cleanOpponentName("SC Test 5–1")).toBe("SC Test"); // en dash
    expect(cleanOpponentName("Bar United 10 — 0 (ff)")).toBe("Bar United");
  });

  it("strips a trailing 'Caracrew' / 'K Caracrew SK' suffix", () => {
    expect(cleanOpponentName("Foo Caracrew")).toBe("Foo");
    expect(cleanOpponentName("Foo K Caracrew SK")).toBe("Foo");
  });

  it("leaves a clean name untouched and trims whitespace", () => {
    expect(cleanOpponentName("FC Foo")).toBe("FC Foo");
    expect(cleanOpponentName("  Padded FC  ")).toBe("Padded FC");
  });
});
