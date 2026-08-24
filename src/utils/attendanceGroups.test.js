import { describe, expect, it } from "vitest";
import {
  attendanceGroupLabel,
  groupPlayersByAttendance,
  hasAnyAttendanceVote,
} from "./attendanceGroups.js";

const players = [
  { id: "a", status: "playing" },
  { id: "b", status: "cant" },
  { id: "c", status: null },
  { id: "d", status: "if_needed" },
  { id: "e", status: "playing" },
];
const statusOf = (p) => p.status;

describe("groupPlayersByAttendance", () => {
  it("buckets players into In / If needed / Out / No response, in that order", () => {
    const groups = groupPlayersByAttendance(players, statusOf);
    expect(groups.map((g) => g.status)).toEqual(["playing", "if_needed", "cant", null]);
    expect(groups.map((g) => g.label)).toEqual(["In", "If needed", "Out", "No response"]);
    expect(groups.map((g) => g.players.map((p) => p.id))).toEqual([
      ["a", "e"],
      ["d"],
      ["b"],
      ["c"],
    ]);
  });

  it("drops empty groups", () => {
    const groups = groupPlayersByAttendance([{ id: "a", status: "playing" }], statusOf);
    expect(groups).toHaveLength(1);
    expect(groups[0].status).toBe("playing");
  });

  it("treats undefined and empty-string statuses as no response", () => {
    const groups = groupPlayersByAttendance(
      [{ id: "a" }, { id: "b", status: null }],
      (p) => p.status
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].status).toBeNull();
    expect(groups[0].players.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("keeps an unknown status visible rather than dropping the player", () => {
    const groups = groupPlayersByAttendance([{ id: "a", status: "maybe_later" }], statusOf);
    expect(groups.map((g) => g.status)).toEqual(["maybe_later"]);
    expect(groups[0].players.map((p) => p.id)).toEqual(["a"]);
  });

  it("returns nothing for an empty roster", () => {
    expect(groupPlayersByAttendance([], statusOf)).toEqual([]);
  });
});

describe("hasAnyAttendanceVote", () => {
  it("is false when nobody has answered", () => {
    const groups = groupPlayersByAttendance([{ id: "a" }, { id: "b" }], statusOf);
    expect(hasAnyAttendanceVote(groups)).toBe(false);
  });

  it("is true as soon as one player has", () => {
    const groups = groupPlayersByAttendance([{ id: "a" }, { id: "b", status: "cant" }], statusOf);
    expect(hasAnyAttendanceVote(groups)).toBe(true);
  });
});

describe("attendanceGroupLabel", () => {
  it("labels a missing RSVP", () => {
    expect(attendanceGroupLabel(null)).toBe("No response");
  });

  it("reuses the RSVP button labels", () => {
    expect(attendanceGroupLabel("playing")).toBe("In");
    expect(attendanceGroupLabel("if_needed")).toBe("If needed");
    expect(attendanceGroupLabel("cant")).toBe("Out");
  });
});
