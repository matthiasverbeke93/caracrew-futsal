export const TEAM_NAME = "K. Caracrew SK";
export const MIN_PLAYERS_WARNING = 6;
export const JUST_RIGHT_PLAYERS = 7;

export const ATTENDANCE_OPTIONS = [
  { value: "playing", label: "In" },
  { value: "cant", label: "Out" },
  { value: "if_needed", label: "If needed" },
];

/** User-facing label for a stored `attendance.status` value */
export function attendanceLabel(status) {
  if (status == null || status === "") return "—";
  const row = ATTENDANCE_OPTIONS.find((o) => o.value === status);
  return row?.label ?? String(status);
}

export const GAME_FILTERS = [
  { id: "all", label: "All" },
  { id: "upcoming", label: "Upcoming" },
  { id: "played", label: "Played" },
  { id: "stats_missing", label: "Stats missing" },
  { id: "players_not_enough", label: "Not enough players" },
  { id: "players_just_enough", label: "Just enough players" },
  { id: "players_right", label: "Right amount players" },
];

export const FILTER_CONFLICTS = {
  upcoming: ["played", "stats_missing"],
  played: ["upcoming"],
  stats_missing: ["upcoming"],
  players_not_enough: ["players_just_enough", "players_right"],
  players_just_enough: ["players_not_enough", "players_right"],
  players_right: ["players_not_enough", "players_just_enough"],
};

/** Shown under “More filters” in the fixtures sidebar */
export const GAME_EXTRA_FILTERS = [
  { id: "stats_missing", label: "Stats missing" },
  { id: "players_not_enough", label: "Not enough players" },
  { id: "players_just_enough", label: "Just enough players" },
  { id: "players_right", label: "Right amount" },
];
