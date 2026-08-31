import { useEffect, useState } from "react";
import {
  ATTENDANCE_OPTIONS,
  GAME_FULL_PLAYERS,
  JUST_RIGHT_PLAYERS,
  MIN_PLAYERS_WARNING,
  attendanceLabel,
} from "../constants";
import { STATS_FREEZE_DAYS } from "../utils/game";
import { MOTM_VOTING_DAYS } from "../utils/motm";

/**
 * "How it works" — the squad-facing guide, in the app rather than in a document
 * somebody has to be sent.
 *
 * Every number in here is read from the constant that enforces it
 * (`STATS_FREEZE_DAYS`, `MOTM_VOTING_DAYS`, the roster thresholds, the RSVP
 * labels), so the guide cannot drift away from the rules it describes. If you
 * change a window, this page follows on its own — don't hardcode a number here.
 */
export default function GuideModal({ onClose }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const feedUrl = `${window.location.origin}/fixtures.ics`;
  // Deliberately rebuilt from origin+pathname rather than href: the live URL carries
  // ?season=/?game=/?player= state that has no business in a link to the guide.
  const shareUrl = `${window.location.origin}${window.location.pathname}?guide=1`;
  const optionHelp = {
    playing: "Count on me.",
    cant: "Can't make it.",
    if_needed: "Only if we're short. Say this instead of nothing — a blank is invisible, this is a plan.",
  };

  async function copyLink() {
    // navigator.clipboard needs a secure context and can still be refused; the URL is
    // shown as text either way, so a failure costs the user nothing but the shortcut.
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="auth-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="auth-modal guide-modal"
        role="dialog"
        aria-labelledby="guide-modal-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="auth-modal-header">
          <h2 id="guide-modal-title">How it works</h2>
          <button type="button" className="auth-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="guide-body">
          <div className="guide-share">
            <div className="guide-share-text">
              <strong>Share this guide</strong>
              <code>{shareUrl}</code>
            </div>
            <button type="button" className="guide-share-btn" onClick={copyLink}>
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>

          <p className="guide-lede">
            Anyone can look around without signing in. You need an account to say whether you're
            playing.
          </p>

          <section className="guide-section">
            <h3>Say if you're playing</h3>
            <p>
              Pick a match on the left, then answer on the <strong>Attendance</strong> tab. Only the
              next 3 fixtures are open, so the list stays short — you can change your answer up to and
              including match day.
            </p>
            <p>
              <strong>First come, first served:</strong> as soon as{" "}
              <strong>{GAME_FULL_PLAYERS}</strong> people are In, that match is full and RSVP closes —
              we have enough players, so nobody else can sign up. If you are In and can no longer make
              it, switch yourself to <strong>{attendanceLabel("cant")}</strong>: that frees your spot
              and reopens the match for the rest.
            </p>
            <dl className="guide-opts">
              {ATTENDANCE_OPTIONS.map((o) => (
                <div key={o.value} className="guide-opt">
                  <dt>
                    <span className={`guide-chip opt-${o.value}`}>{o.label}</span>
                  </dt>
                  <dd>{optionHelp[o.value]}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="guide-section">
            <h3>Read the headcount</h3>
            <p>Every upcoming fixture shows how many are In, so you can tell if your answer matters.</p>
            <div className="guide-scale guide-scale--four">
              <div className="s-low">
                <b>≤ {MIN_PLAYERS_WARNING - 1}</b>
                Not enough — we need you
              </div>
              <div className="s-mid">
                <b>{MIN_PLAYERS_WARNING}</b>
                Just enough, no cover
              </div>
              <div className="s-ok">
                <b>
                  {JUST_RIGHT_PLAYERS}
                  {GAME_FULL_PLAYERS - JUST_RIGHT_PLAYERS > 1
                    ? `–${GAME_FULL_PLAYERS - 1}`
                    : ""}
                </b>
                Sorted
              </div>
              <div className="s-full">
                <b>{GAME_FULL_PLAYERS}</b>
                Full — RSVP closed
              </div>
            </div>
            <p>
              A <strong>+2 if needed</strong> beside the count means two more are on standby.
            </p>
            <p>
              <strong>Goalkeeper check.</strong> Eight outfield players and no goalie is still a
              problem, so every upcoming fixture is checked separately: if none of our keepers has
              said <strong>{attendanceLabel("playing")}</strong>, the match shows{" "}
              <strong>No GK</strong> in the fixtures list and a red <em>No goalkeeper In</em> line on
              the match itself. Keepers carry a <strong>GK</strong> badge in the attendance list —
              Matthias sets who those are.
            </p>
          </section>

          <section className="guide-section">
            <h3>Goals, assists and Man of the Match</h3>
            <p>
              After the match, open it and fill in your own goals and assists on the{" "}
              <strong>Stats</strong> tab. That closes{" "}
              <strong>
                {STATS_FREEZE_DAYS} day{STATS_FREEZE_DAYS === 1 ? "" : "s"}
              </strong>{" "}
              after the match, so do it while you remember. After that the tab is read-only for
              players — ask Matthias, who can add or correct stats at any time and also enters the
              final score.
            </p>
            <p>
              The <strong>Keeper</strong> tick on that same tab records who actually went in goal
              that night — which is often somebody who never keeps goal, so it is a separate thing
              from the GK badge.
            </p>
            <p>
              <strong>MotM voting</strong> opens about 2 hours after kickoff — roughly the final
              whistle — and runs for{" "}
              <strong>
                {MOTM_VOTING_DAYS} day{MOTM_VOTING_DAYS === 1 ? "" : "s"}
              </strong>
              . One vote each, and the winner appears in the season stats once voting closes.
            </p>
          </section>

          <section className="guide-section">
            <h3>Deadlines</h3>
            <div className="guide-table-scroll">
              <table className="guide-table">
                <thead>
                  <tr>
                    <th scope="col">What</th>
                    <th scope="col">Opens</th>
                    <th scope="col">Closes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">
                      {ATTENDANCE_OPTIONS.map((o) => attendanceLabel(o.value)).join(" / ")}
                    </th>
                    <td>When it becomes one of the next 3 fixtures</td>
                    <td>
                      End of match day — or as soon as {GAME_FULL_PLAYERS} are In, whichever comes
                      first
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Goals &amp; assists</th>
                    <td>Match day</td>
                    <td>
                      {STATS_FREEZE_DAYS} day{STATS_FREEZE_DAYS === 1 ? "" : "s"} after the match
                      (admins: never)
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Man of the Match</th>
                    <td>2 hours after kickoff</td>
                    <td>{MOTM_VOTING_DAYS} days later</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="guide-section">
            <h3>Worth knowing</h3>
            <ul className="guide-list">
              <li>
                <strong>Put the fixtures in your phone.</strong> Subscribe once and every match shows
                up in your own calendar, updating itself when LZV moves something. Add this as a
                subscribed calendar, not a one-off import: <code>{feedUrl}</code>
              </li>
              <li>
                <strong>Stats</strong> in the header opens the season overview — table position, form,
                top scorers, appearances. Tap any name for that player's page. The dropdown beside the
                team name switches season.
              </li>
              <li>
                <strong>Friday email.</strong> One reminder a week: who still hasn't answered for the
                next match, and which MotM votes are open. It goes to the address you signed up with.
              </li>
              <li>
                <strong>Something looks wrong?</strong> Use <strong>Report a bug</strong> in the
                header — a wrong score, a count that won't update, or just an idea. It records which
                page you were on, so you don't have to explain that part.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
