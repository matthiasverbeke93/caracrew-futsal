import { describe, expect, it } from "vitest";
import { selectRecipients } from "./send-weekly-digest.mjs";

const NOW = Date.parse("2026-08-19T12:00:00Z");

/** A confirmed, mailable auth user. */
function user(id, email, extra = {}) {
  return { id, email, email_confirmed_at: "2026-01-01T00:00:00Z", ...extra };
}

describe("selectRecipients", () => {
  it("mails an active player linked to a confirmed account", () => {
    const players = [{ id: "p1", name: "Ann", auth_user_id: "u1" }];
    const { recipients } = selectRecipients(players, [user("u1", "ann@example.com")], {
      nowMs: NOW,
    });
    expect(recipients).toEqual([{ email: "ann@example.com", name: "Ann" }]);
  });

  it("skips a player with no linked account and reports them", () => {
    const players = [{ id: "p1", name: "Ann", auth_user_id: null }];
    const { recipients, unlinked } = selectRecipients(players, [], { nowMs: NOW });
    expect(recipients).toEqual([]);
    expect(unlinked).toEqual(["Ann"]);
  });

  it("never mails an unconfirmed address", () => {
    const players = [{ id: "p1", name: "Ann", auth_user_id: "u1" }];
    const authUsers = [{ id: "u1", email: "ann@example.com", email_confirmed_at: null }];
    const { recipients, unconfirmed } = selectRecipients(players, authUsers, { nowMs: NOW });
    expect(recipients).toEqual([]);
    expect(unconfirmed).toEqual(["Ann"]);
  });

  it("treats a legacy confirmed_at as confirmed", () => {
    const players = [{ id: "p1", name: "Ann", auth_user_id: "u1" }];
    const authUsers = [
      { id: "u1", email: "ann@example.com", confirmed_at: "2026-01-01T00:00:00Z" },
    ];
    expect(selectRecipients(players, authUsers, { nowMs: NOW }).recipients).toHaveLength(1);
  });

  it("skips a currently banned account but not an expired ban", () => {
    const players = [
      { id: "p1", name: "Ann", auth_user_id: "u1" },
      { id: "p2", name: "Bo", auth_user_id: "u2" },
    ];
    const authUsers = [
      user("u1", "ann@example.com", { banned_until: "2026-09-01T00:00:00Z" }),
      user("u2", "bo@example.com", { banned_until: "2026-01-01T00:00:00Z" }),
    ];
    const { recipients } = selectRecipients(players, authUsers, { nowMs: NOW });
    expect(recipients.map((r) => r.email)).toEqual(["bo@example.com"]);
  });

  it("skips archived players — archived_at is the real column, not `archived`", () => {
    const players = [
      { id: "p1", name: "Ann", auth_user_id: "u1", archived_at: "2026-06-01T00:00:00Z" },
      { id: "p2", name: "Bo", auth_user_id: "u2", archived: true },
    ];
    const authUsers = [user("u1", "ann@example.com"), user("u2", "bo@example.com")];
    const { recipients } = selectRecipients(players, authUsers, { nowMs: NOW });
    expect(recipients.map((r) => r.email)).toEqual(["bo@example.com"]);
  });

  it("ignores an auth user that is not linked to any player", () => {
    const authUsers = [user("u1", "ann@example.com"), user("u9", "stranger@example.com")];
    const players = [{ id: "p1", name: "Ann", auth_user_id: "u1" }];
    const { recipients } = selectRecipients(players, authUsers, { nowMs: NOW });
    expect(recipients.map((r) => r.email)).toEqual(["ann@example.com"]);
  });

  it("adds extras for people with no account, without duplicating the roster", () => {
    const players = [{ id: "p1", name: "Ann", auth_user_id: "u1" }];
    const authUsers = [user("u1", "ann@example.com")];
    const { recipients } = selectRecipients(players, authUsers, {
      extraEmails: ["coach@example.com", "ANN@example.com"],
      nowMs: NOW,
    });
    expect(recipients).toEqual([
      { email: "ann@example.com", name: "Ann" },
      { email: "coach@example.com", name: null },
    ]);
  });

  it("honours the opt-out list case-insensitively", () => {
    const players = [{ id: "p1", name: "Ann", auth_user_id: "u1" }];
    const authUsers = [user("u1", "Ann@Example.com")];
    const { recipients, optedOut } = selectRecipients(players, authUsers, {
      skipEmails: ["ann@example.com"],
      nowMs: NOW,
    });
    expect(recipients).toEqual([]);
    expect(optedOut).toEqual(["Ann"]);
  });

  it("returns nothing for an empty roster rather than throwing", () => {
    expect(selectRecipients([], [], { nowMs: NOW }).recipients).toEqual([]);
    expect(selectRecipients(null, null, { nowMs: NOW }).recipients).toEqual([]);
  });
});
