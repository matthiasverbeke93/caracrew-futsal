import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  STATS_FREEZE_DAYS,
  getStatsLockDaysLeft,
  isStatsEditable,
  isStatsFrozen,
} from "../utils/game";
import { hasKickedOff, useNow } from "../hooks/useMatchClock";
import { isSeasonVotingLocked } from "../seasons";
import {
  MOTM_VOTING_DAYS,
  getMotmCandidates,
  getMotmLeaderIds,
  getMotmVotingEnd,
  getMotmVotingStart,
  isMotmVotingOpen,
} from "../utils/motm";

/** Pause after the last keystroke before a goals/assists edit is saved. */
const STAT_COMMIT_DELAY_MS = 700;

function toStatCount(raw) {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Goals/assists field that edits a local draft and saves once — on blur, Enter, or a
 * short pause — instead of writing to Supabase on every keystroke (typing "12" used
 * to send 1 then 12, and the two could land out of order). The value is clamped to a
 * whole number >= 0 before it is saved.
 */
function StatCountInput({ value, disabled, title, onCommit, label }) {
  const [draft, setDraft] = useState(null);
  const draftRef = useRef(null);
  const timerRef = useRef(null);
  const committed = value || 0;
  const committedRef = useRef(committed);
  const onCommitRef = useRef(onCommit);
  useEffect(() => {
    onCommitRef.current = onCommit;
    committedRef.current = committed;
  });

  // Reads only refs, so one stable function serves the timer, blur and unmount.
  const commit = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    const raw = draftRef.current;
    if (raw === null) return;
    draftRef.current = null;
    setDraft(null);
    const next = toStatCount(raw);
    if (next !== committedRef.current) onCommitRef.current(next);
  }, []);

  // Leaving the game (StatsTab is keyed by game id) must not drop a pending edit.
  useEffect(() => () => commit(), [commit]);

  return (
    <input
      type="number"
      min="0"
      step="1"
      inputMode="numeric"
      aria-label={label}
      value={draft ?? String(committed)}
      disabled={disabled}
      title={title}
      onChange={(e) => {
        draftRef.current = e.target.value;
        setDraft(e.target.value);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(commit, STAT_COMMIT_DELAY_MS);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}

export default function StatsTab({
  allGamePlayers,
  selectedGame,
  gameStats,
  gameGuests = [],
  gameAttendance,
  selectedGameTotals,
  saveGuestStat,
  saveStat,
  motmVotes,
  submitMotmVote,
  onOpenPlayer,
  canEditStatsFor,
  canManageGame,
  canVote,
  voterUserId = null,
}) {
  // The freeze binds players only — an admin can always correct a scoreline.
  const statsWindowOpen = isStatsEditable(selectedGame, { isAdmin: canManageGame });
  const frozen = isStatsFrozen(selectedGame);
  const lockedForFutureGame = !statsWindowOpen && !frozen;
  const daysUntilLock = getStatsLockDaysLeft(selectedGame);
  const [motmMessage, setMotmMessage] = useState(null);
  const now = useNow();

  // Guest rows carry their own goals/assists — they count toward the scoreline too.
  const sumOf = (field) =>
    gameStats.reduce((sum, row) => sum + (row[field] || 0), 0) +
    gameGuests.reduce((sum, row) => sum + (row[field] || 0), 0);
  const currentGoals = sumOf("goals");
  const currentAssists = sumOf("assists");
  const goalsTarget = selectedGameTotals.goals;
  // There is no assists target (the final score only says how many goals we scored),
  // so assists always show against "?".
  const assistsTarget = selectedGameTotals.assists;
  const goalsOverTarget = goalsTarget != null && currentGoals > goalsTarget;
  const goalsMissing = !goalsOverTarget && (goalsTarget == null || currentGoals < goalsTarget);
  const goalsBadgeClass = goalsOverTarget
    ? "badge-error"
    : goalsMissing
      ? "badge-warning"
      : "badge-ok";
  const assistsBadgeClass = assistsTarget == null ? "badge-warning" : "badge-ok";

  const motmEnd = getMotmVotingEnd(selectedGame);
  const motmStart = getMotmVotingStart(selectedGame);
  const motmSeasonLocked = isSeasonVotingLocked(selectedGame?.season_slug);
  const votingOpen = isMotmVotingOpen(selectedGame, now);
  // Clock-based, not `isPlayed()` (day-granular — false until midnight, so the panel
  // stayed hidden for the hours after an evening kickoff, when people actually vote).
  const kickedOff = hasKickedOff(selectedGame, now);
  const votingFinished = !!motmEnd && now > motmEnd.getTime();
  const votingPending = kickedOff && !!motmStart && now < motmStart.getTime();

  const motmVotesForGame = useMemo(
    () => motmVotes.filter((v) => v.game_id === selectedGame.id),
    [motmVotes, selectedGame.id]
  );

  const myNomineeId = voterUserId
    ? motmVotesForGame.find((v) => v.voter_key === voterUserId)?.nominee_id
    : null;

  const motmCounts = useMemo(() => {
    const m = {};
    for (const v of motmVotesForGame) {
      m[v.nominee_id] = (m[v.nominee_id] || 0) + 1;
    }
    return m;
  }, [motmVotesForGame]);

  const motmLeaders = useMemo(
    () => getMotmLeaderIds(selectedGame.id, motmVotes),
    [motmVotes, selectedGame.id]
  );

  // Ballot = roster players who RSVP'd In for this fixture; guests are never eligible.
  const motmCandidates = useMemo(
    () => getMotmCandidates(allGamePlayers, gameAttendance),
    [allGamePlayers, gameAttendance]
  );

  const showMotmBlock = kickedOff && !!motmEnd;

  async function handleMotmVote(nomineeId) {
    setMotmMessage(null);
    const res = await submitMotmVote(nomineeId);
    if (res.error) setMotmMessage(res.error);
  }

  return (
    <div className="match-tab-content">
      <h2>Goals and assists</h2>
      {lockedForFutureGame && (
        <div className="warning-box">Stats can only be entered for games played today or earlier.</div>
      )}
      {frozen && !canManageGame && (
        <div className="warning-box">
          Stats are locked. This game was played more than {STATS_FREEZE_DAYS} day
          {STATS_FREEZE_DAYS === 1 ? "" : "s"} ago — ask an admin to add or correct them.
        </div>
      )}
      {frozen && canManageGame && (
        <div className="info-banner">
          Locked for players ({STATS_FREEZE_DAYS} day{STATS_FREEZE_DAYS === 1 ? "" : "s"} after the
          match), but you are an admin — you can still enter or correct these stats.
        </div>
      )}
      {!frozen && daysUntilLock !== null && (
        <div className="info-banner">
          Stats lock in {daysUntilLock} day{daysUntilLock === 1 ? "" : "s"}
          {canManageGame ? " for players — admins keep editing after that." : "."}
        </div>
      )}
      {goalsOverTarget && (
        <div className="error-box">
          <div>
            Per-player goals ({currentGoals}) exceed the Caracrew final score ({goalsTarget}).
          </div>
        </div>
      )}
      <div className="tally-box">
        <div className="tally-row">
          <label>Goals from final score</label>
          <span className={goalsBadgeClass}>
            {currentGoals} / {goalsTarget ?? "?"}
          </span>
        </div>
        <div className="tally-row">
          <label>Assists from final score</label>
          <span className={assistsBadgeClass}>
            {currentAssists} / {assistsTarget ?? "?"}
          </span>
        </div>
        {goalsTarget == null && (
          <p className="tally-hint">Set the final score in the top card to unlock these targets.</p>
        )}
      </div>

      {showMotmBlock && (
        <div className="motm-panel">
          <h3>Player of the match</h3>
          {motmSeasonLocked && (
            <p className="motm-hint">
              MOTM voting is turned off for this season while fixtures are being prepared.
            </p>
          )}
          {votingPending && !motmSeasonLocked && (
            <p className="motm-hint">
              MOTM voting opens about 2 hours after kickoff, then stays open for
              {MOTM_VOTING_DAYS} days.
            </p>
          )}
          {votingOpen && (
            <p className="motm-hint">One vote per account — tap again to change your pick.</p>
          )}
          {votingFinished && motmLeaders.length > 0 && (
            <p className="motm-result">
              Winner{motmLeaders.length > 1 ? "s (tie)" : ""}:{" "}
              {motmLeaders
                .map((id) => {
                  const p = allGamePlayers.find((x) => x.id === id);
                  return p?.name || "Unknown";
                })
                .join(" · ")}
            </p>
          )}
          {votingFinished && motmLeaders.length === 0 && (
            <p className="motm-hint">No votes recorded for this game.</p>
          )}
          {motmMessage && <p className="error-inline">{motmMessage}</p>}
          {votingOpen && canVote && motmCandidates.length === 0 && (
            <p className="motm-hint">
              Nobody is marked In for this match, so there is nobody to vote for.
            </p>
          )}
          {votingOpen && canVote && motmCandidates.length > 0 && (
            <div className="motm-vote-grid">
              {motmCandidates.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  className={myNomineeId === player.id ? "motm-vote active" : "motm-vote"}
                  onClick={() => handleMotmVote(player.id)}
                >
                  <span>{player.name}</span>
                  <span className="motm-count">{motmCounts[player.id] || 0}</span>
                </button>
              ))}
            </div>
          )}
          {votingOpen && !canVote && (
            <p className="motm-hint">Sign in to vote for player of the match.</p>
          )}
          {!votingOpen && votingFinished && motmVotesForGame.length > 0 && (
            <ul className="motm-tally">
              {Object.entries(motmCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([id, n]) => {
                  const p = allGamePlayers.find((x) => x.id === id);
                  return (
                    <li key={id}>
                      {p?.name || id}: {n}
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      )}

      <div className="stats-table-scroll">
        <table className="stats-player-table">
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th
                scope="col"
                className="stats-played-cell"
                title="Used for season compliance: only checked games count toward RSVP and stats-on-time %"
              >
                Played
              </th>
              <th scope="col" title="Who actually kept goal in this match">Keeper</th>
              <th scope="col">Goals</th>
              <th scope="col">Assists</th>
            </tr>
          </thead>
          <tbody>
            {allGamePlayers.map((player) => {
              const isAdHoc = player.type === "ad_hoc_guest";
              const row = isAdHoc
                ? player
                : gameStats.find((s) => s.player_id === player.id);
              const rowEditable =
                statsWindowOpen && (isAdHoc ? canManageGame : canEditStatsFor(player.id));
              const disabledTitle = !statsWindowOpen
                ? undefined
                : isAdHoc
                  ? "Admin only"
                  : `Only ${player.name} or an admin can edit this`;

              return (
                <tr key={player.id}>
                  <td>
                    <button type="button" className="player-link" onClick={() => onOpenPlayer(player.id)}>
                      {player.name}
                    </button>
                    {player.type !== "fixed" && <span className="guest-badge">Guest</span>}
                    {player.isGoalkeeper && (
                      <span className="keeper-badge" title="Goalkeeper on the roster">
                        GK
                      </span>
                    )}
                  </td>
                  <td className="stats-played-cell">
                    {isAdHoc ? (
                      <span className="stats-played-na" title="Guests use guest row only">
                        —
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={!!row && row.played !== false}
                        disabled={!rowEditable}
                        title={
                          !rowEditable
                            ? disabledTitle
                            : "Counts this game toward your RSVP / stats compliance scores"
                        }
                        onChange={(e) => saveStat(player.id, "played", e.target.checked)}
                      />
                    )}
                  </td>
                  <td className="stats-played-cell">
                    {/* Deliberately not tied to `player.isGoalkeeper`: whoever went in
                        goal on the night gets marked here, keeper or not. */}
                    <input
                      type="checkbox"
                      checked={!!row?.kept_goal}
                      disabled={!rowEditable}
                      title={
                        !rowEditable
                          ? disabledTitle
                          : "This player kept goal in this match"
                      }
                      onChange={(e) =>
                        isAdHoc
                          ? saveGuestStat(player.id, "kept_goal", e.target.checked)
                          : saveStat(player.id, "kept_goal", e.target.checked)
                      }
                    />
                  </td>
                  <td>
                    <StatCountInput
                      label={"Goals for " + player.name}
                      value={row?.goals}
                      disabled={!rowEditable}
                      title={!rowEditable ? disabledTitle : undefined}
                      onCommit={(n) =>
                        isAdHoc
                          ? saveGuestStat(player.id, "goals", n)
                          : saveStat(player.id, "goals", n)
                      }
                    />
                  </td>
                  <td>
                    <StatCountInput
                      label={"Assists for " + player.name}
                      value={row?.assists}
                      disabled={!rowEditable}
                      title={!rowEditable ? disabledTitle : undefined}
                      onCommit={(n) =>
                        isAdHoc
                          ? saveGuestStat(player.id, "assists", n)
                          : saveStat(player.id, "assists", n)
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
