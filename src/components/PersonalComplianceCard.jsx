import {
  formatMedianDaysBefore,
  formatMedianHoursAfter,
} from "../utils/playerCompliance";

export default function PersonalComplianceCard({ summary }) {
  if (!summary) return null;

  const {
    attendanceCount,
    attendanceMedianDaysBefore,
    attendanceLateCount,
    statsCount,
    statsMedianHoursAfter,
  } = summary;

  const hasAttendanceData = attendanceCount > 0;
  const hasStatsData = statsCount > 0;

  if (!hasAttendanceData && !hasStatsData) {
    return (
      <section className="personal-compliance-card" aria-label="Your confirmation pace">
        <div className="personal-compliance-title">Your confirmation pace</div>
        <p className="personal-compliance-empty">
          Once you RSVP and log stats, median timings for this season will show here.
        </p>
      </section>
    );
  }

  return (
    <section
      className="personal-compliance-card"
      aria-label="Your confirmation pace"
      title="Based on when your attendance and stats rows were last saved (this season)."
    >
      <div className="personal-compliance-title">Your confirmation pace</div>
      <p className="personal-compliance-intro">
        Uses timestamp when your attendance and stats were saved. RSVP median counts only saves{" "}
        <em>before</em> kickoff.
      </p>

      {hasAttendanceData ? (
        <dl className="personal-compliance-dl">
          <div>
            <dt>Attendance (before kickoff)</dt>
            <dd>
              <strong>
                {attendanceMedianDaysBefore != null
                  ? formatMedianDaysBefore(attendanceMedianDaysBefore)
                  : attendanceLateCount === attendanceCount
                    ? "All saves after kickoff"
                    : "—"}
              </strong>
              <span className="personal-compliance-n">median · {attendanceCount} saved</span>
            </dd>
          </div>
          {attendanceLateCount > 0 && (
            <p className="personal-compliance-footnote">
              {attendanceLateCount} save{attendanceLateCount === 1 ? "" : "s"} after kickoff not
              included in the median.
            </p>
          )}
        </dl>
      ) : (
        <p className="personal-compliance-muted">No attendance saves yet this season.</p>
      )}

      {hasStatsData ? (
        <dl className="personal-compliance-dl">
          <div>
            <dt>Goals / assists saved (after kickoff)</dt>
            <dd>
              <strong>{formatMedianHoursAfter(statsMedianHoursAfter)}</strong>
              <span className="personal-compliance-n">median · {statsCount} matches</span>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="personal-compliance-muted">No finished-match stats yet this season.</p>
      )}
    </section>
  );
}
