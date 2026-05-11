import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";

const TEAM_NAME = "K. Caracrew SK";
const MIN_PLAYERS_WARNING = 6;

const ATTENDANCE_OPTIONS = [
  { value: "playing", label: "I'm playing" },
  { value: "cant", label: "I can't attend" },
  { value: "if_needed", label: "I'll play if needed" },
];

function isPlayed(game) {
  const today = new Date().toISOString().slice(0, 10);
  return game.game_date < today;
}

function readinessClass(count) {
  if (count <= 5) return "game-card danger";
  if (count === 6) return "game-card warning";
  return "game-card success";
}

export default function App() {
  const [games, setGames] = useState([]);
  const [players, setPlayers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [stats, setStats] = useState([]);
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [tab, setTab] = useState("attendance");
  const [guestCounts, setGuestCounts] = useState({});

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [gamesRes, playersRes, attendanceRes, statsRes] =
      await Promise.all([
        supabase
          .from("games")
          .select("*")
          .order("game_date", { ascending: true }),

        supabase
          .from("players")
          .select("*")
          .order("fixed", { ascending: false }),

        supabase
          .from("attendance")
          .select("*"),

        supabase
          .from("player_stats")
          .select("*"),
      ]);

    if (gamesRes.error) console.error(gamesRes.error);
    if (playersRes.error) console.error(playersRes.error);
    if (attendanceRes.error) console.error(attendanceRes.error);
    if (statsRes.error) console.error(statsRes.error);

    setGames(gamesRes.data || []);
    setPlayers(playersRes.data || []);
    setAttendance(attendanceRes.data || []);
    setStats(statsRes.data || []);

    const firstUpcoming =
      (gamesRes.data || []).find((g) => !isPlayed(g));

    setSelectedGameId(
      firstUpcoming?.id ||
      gamesRes.data?.[0]?.id ||
      null
    );
  }

  const selectedGame = games.find(
    (g) => g.id === selectedGameId
  );

  const gameAttendance = attendance.filter(
    (a) => a.game_id === selectedGameId
  );

  const gameStats = stats.filter(
    (s) => s.game_id === selectedGameId
  );

  const counts = useMemo(() => {
    const guestPlaying =
      guestCounts[selectedGameId] || 0;

    return {
      playing:
        gameAttendance.filter(
          (a) => a.status === "playing"
        ).length + guestPlaying,

      cant:
        gameAttendance.filter(
          (a) => a.status === "cant"
        ).length,

      if_needed:
        gameAttendance.filter(
          (a) => a.status === "if_needed"
        ).length,

      missing: Math.max(
        players.length - gameAttendance.length,
        0
      ),

      guests: guestPlaying,
    };
  }, [
    gameAttendance,
    players,
    guestCounts,
    selectedGameId,
  ]);

  async function saveAttendance(
    playerId,
    status
  ) {
    await supabase
      .from("attendance")
      .upsert({
        game_id: selectedGameId,
        player_id: playerId,
        status,
        updated_at:
          new Date().toISOString(),
      });

    await loadAll();
  }

  async function saveStat(
    playerId,
    field,
    value
  ) {
    const existing = gameStats.find(
      (s) => s.player_id === playerId
    );

    await supabase
      .from("player_stats")
      .upsert({
        game_id: selectedGameId,
        player_id: playerId,

        goals:
          field === "goals"
            ? Number(value || 0)
            : existing?.goals || 0,

        assists:
          field === "assists"
            ? Number(value || 0)
            : existing?.assists || 0,

        updated_at:
          new Date().toISOString(),
      });

    await loadAll();
  }

  function addGuestPlayer() {
    setGuestCounts((prev) => ({
      ...prev,
      [selectedGameId]:
        (prev[selectedGameId] || 0) + 1,
    }));
  }

  function removeGuestPlayer() {
    setGuestCounts((prev) => ({
      ...prev,
      [selectedGameId]: Math.max(
        (prev[selectedGameId] || 0) - 1,
        0
      ),
    }));
  }

  const seasonLeaders = players
    .map((player) => {
      const playerStats = stats.filter(
        (s) => s.player_id === player.id
      );

      return {
        ...player,

        goals: playerStats.reduce(
          (sum, s) =>
            sum + (s.goals || 0),
          0
        ),

        assists: playerStats.reduce(
          (sum, s) =>
            sum + (s.assists || 0),
          0
        ),
      };
    })
    .sort(
      (a, b) =>
        b.goals +
        b.assists -
        (a.goals + a.assists)
    );

  return (
    <div className="app">
      <header className="hero">
        <div>
          <div className="pill">
            Season 25-26
          </div>

          <h1>{TEAM_NAME}</h1>

          <p>
            Attendance, goals and assists
            tracker
          </p>
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <h2>All games</h2>

          {games.map((game) => {
            const gameRows =
              attendance.filter(
                (a) =>
                  a.game_id === game.id
              );

            const guestCount =
              guestCounts[game.id] || 0;

            const playing =
              gameRows.filter(
                (a) =>
                  a.status ===
                  "playing"
              ).length + guestCount;

            return (
              <button
                key={game.id}
                className={`${readinessClass(
                  playing
                )} ${
                  game.id ===
                  selectedGameId
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setSelectedGameId(
                    game.id
                  )
                }
              >
                <div className="game-top">
                  <strong>
                    {game.opponent}
                  </strong>

                  <span>
                    {isPlayed(game)
                      ? "Played"
                      : "To be played"}
                  </span>
                </div>

                <div>
                  {game.game_date} ·{" "}
                  {game.game_time}
                </div>

                <div>
                  {game.location}
                </div>

                <div className="mini-counts">
                  <span>
                    {playing} playing
                  </span>

                  <span>
                    {
                      gameRows.filter(
                        (a) =>
                          a.status ===
                          "if_needed"
                      ).length
                    }{" "}
                    if needed
                  </span>
                </div>
              </button>
            );
          })}
        </aside>

        <section className="content">
          {selectedGame && (
            <>
              <section className="panel selected-game-panel">
                <div className="section-label">
                  Selected game
                </div>

                <h2>
                  {selectedGame.title ||
                    selectedGame.opponent}
                </h2>

                <p>
                  {
                    selectedGame.game_date
                  }{" "}
                  ·{" "}
                  {
                    selectedGame.game_time
                  }{" "}
                  ·{" "}
                  {
                    selectedGame.location
                  }
                </p>

                {!isPlayed(
                  selectedGame
                ) &&
                  counts.playing <
                    MIN_PLAYERS_WARNING && (
                    <div className="warning-box">
                      Low player count:
                      only{" "}
                      {
                        counts.playing
                      }{" "}
                      marked as
                      playing.
                    </div>
                  )}

                <div className="count-grid">
                  <div>
                    <strong>
                      {counts.playing}
                    </strong>

                    <span>
                      Playing
                    </span>
                  </div>

                  <div>
                    <strong>
                      {
                        counts.if_needed
                      }
                    </strong>

                    <span>
                      If needed
                    </span>
                  </div>

                  <div>
                    <strong>
                      {counts.cant}
                    </strong>

                    <span>
                      Can't
                    </span>
                  </div>

                  <div>
                    <strong>
                      {
                        counts.missing
                      }
                    </strong>

                    <span>
                      Missing
                    </span>
                  </div>
                </div>

                <div className="guest-card">
                  <div>
                    <strong>
                      External players
                    </strong>

                    <p>
                      Dummy players
                      counted as
                      playing for this
                      game.
                    </p>
                  </div>

                  <div className="guest-controls">
                    <button
                      onClick={
                        removeGuestPlayer
                      }
                    >
                      −
                    </button>

                    <strong>
                      {counts.guests}
                    </strong>

                    <button
                      onClick={
                        addGuestPlayer
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
              </section>

              <nav className="tabs">
                <button
                  onClick={() =>
                    setTab(
                      "attendance"
                    )
                  }
                >
                  Game attendance
                </button>

                <button
                  onClick={() =>
                    setTab("stats")
                  }
                >
                  Game stats
                </button>

                <button
                  onClick={() =>
                    setTab(
                      "season"
                    )
                  }
                >
                  Season leaders
                </button>
              </nav>

              {tab ===
                "attendance" && (
                <section className="panel">
                  <div className="section-label">
                    Selected game
                  </div>

                  <h2>Attendance</h2>

                  <div className="player-grid">
                    {players.map(
                      (player) => {
                        const current =
                          gameAttendance.find(
                            (a) =>
                              a.player_id ===
                              player.id
                          )?.status;

                        return (
                          <div
                            className="player-card"
                            key={
                              player.id
                            }
                          >
                            <strong>
                              {
                                player.name
                              }
                            </strong>

                            <small>
                              {player.fixed
                                ? "Fixed player"
                                : "Occasional player"}
                            </small>

                            {ATTENDANCE_OPTIONS.map(
                              (
                                option
                              ) => (
                                <button
                                  key={
                                    option.value
                                  }
                                  className={
                                    current ===
                                    option.value
                                      ? "active"
                                      : ""
                                  }
                                  onClick={() =>
                                    saveAttendance(
                                      player.id,
                                      option.value
                                    )
                                  }
                                >
                                  {
                                    option.label
                                  }
                                </button>
                              )
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                </section>
              )}

              {tab === "stats" && (
                <section className="panel">
                  <div className="section-label">
                    Selected game
                  </div>

                  <h2>
                    Goals and assists
                  </h2>

                  <table>
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Goals</th>
                        <th>Assists</th>
                      </tr>
                    </thead>

                    <tbody>
                      {players.map(
                        (player) => {
                          const row =
                            gameStats.find(
                              (
                                s
                              ) =>
                                s.player_id ===
                                player.id
                            );

                          return (
                            <tr
                              key={
                                player.id
                              }
                            >
                              <td>
                                {
                                  player.name
                                }
                              </td>

                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  value={
                                    row?.goals ||
                                    0
                                  }
                                  onChange={(
                                    e
                                  ) =>
                                    saveStat(
                                      player.id,
                                      "goals",
                                      e
                                        .target
                                        .value
                                    )
                                  }
                                />
                              </td>

                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  value={
                                    row?.assists ||
                                    0
                                  }
                                  onChange={(
                                    e
                                  ) =>
                                    saveStat(
                                      player.id,
                                      "assists",
                                      e
                                        .target
                                        .value
                                    )
                                  }
                                />
                              </td>
                            </tr>
                          );
                        }
                      )}
                    </tbody>
                  </table>
                </section>
              )}

              {tab === "season" && (
                <section className="panel season-panel">
                  <div className="section-label">
                    Full season
                  </div>

                  <h2>
                    Season leaders
                  </h2>

                  <table>
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Goals</th>
                        <th>Assists</th>
                        <th>Total</th>
                      </tr>
                    </thead>

                    <tbody>
                      {seasonLeaders.map(
                        (player) => (
                          <tr
                            key={
                              player.id
                            }
                          >
                            <td>
                              {
                                player.name
                              }
                            </td>

                            <td>
                              {
                                player.goals
                              }
                            </td>

                            <td>
                              {
                                player.assists
                              }
                            </td>

                            <td>
                              <strong>
                                {player.goals +
                                  player.assists}
                              </strong>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </section>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}