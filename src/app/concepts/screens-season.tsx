import { FIXTURES, PLAYERS, TEAMS, YOU, table, teamById, total, type Player } from "./data";
import { Crest, Disc, Icon, Move, Spark, Stepper, TeamName, fmt, playerName } from "./kit";

const R3 = table(3);
const winner = [...TEAMS].sort((a, b) => b.rounds[2] - a.rounds[2])[0];
const spoon = [...TEAMS].sort((a, b) => a.rounds[2] - b.rounds[2])[0];
const best = PLAYERS.find((p) => p.id === "p14")!;
const mine = PLAYERS.filter((p) => p.owner === "t1");
const you = R3.find((row) => row.team.you)!;

function RoundTicker() {
  return (
    <div className="cx-ticker" aria-label="Round 3 in brief">
      <span className="cx-ticker-tag">Round 3</span>
      <span className="cx-ticker-item">
        <Icon name="crown" size={14} className="cx-muted" /> <b>{winner.name}</b> won the night · {fmt(winner.rounds[2])}
      </span>
      <span className="cx-ticker-item">
        <Icon name="star" size={14} className="cx-muted" /> Best night <b>{playerName(best)}</b> {fmt(best.night!)}
      </span>
      <span className="cx-ticker-item">
        <Icon name="spoon" size={14} className="cx-muted" /> Spoon <b>{spoon.name}</b> {fmt(spoon.rounds[2])}
      </span>
    </div>
  );
}

function MiniTable({ limit = 8, withGap = true }: { limit?: number; withGap?: boolean }) {
  return (
    <table className="cx-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Team</th>
          <th className="cx-num">Pts</th>
          {withGap ? <th className="cx-num cx-wide-only">Gap</th> : null}
        </tr>
      </thead>
      <tbody>
        {R3.slice(0, limit).map((row) => (
          <tr key={row.team.id} data-you={row.team.you ? "" : undefined}>
            <td className="cx-rankcell">
              {row.rank} <Move value={row.moved} />
            </td>
            <td>
              <TeamName team={row.team} size={24} />
            </td>
            <td className="cx-num" style={{ fontWeight: 700 }}>
              {fmt(row.sum)}
              {withGap && row.gap > 0 ? <span className="cx-small cx-muted cx-narrow-only" style={{ display: "block", fontWeight: 400 }}>−{fmt(row.gap)}</span> : null}
            </td>
            {withGap ? <td className="cx-num cx-muted cx-wide-only">{row.gap === 0 ? "—" : `−${fmt(row.gap)}`}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StoryCards() {
  return (
    <div className="cx-stack">
      <div className="cx-panel cx-m-sweep" style={{ display: "grid", gap: "0.6rem" }}>
        <span className="cx-eyebrow" style={{ color: "var(--gold)" }}>
          <Icon name="crown" size={14} /> Round winner
        </span>
        <div className="cx-between">
          <TeamName team={winner} size={40} sub={winner.manager} />
          <span className="cx-figure" style={{ fontSize: "2.25rem" }}>
            {fmt(winner.rounds[2])}
          </span>
        </div>
      </div>
      <div className="cx-panel cx-between">
        <span className="cx-row">
          <Disc player={best} size={44} />
          <span>
            <span className="cx-eyebrow">Best night</span>
            <span style={{ display: "block", fontWeight: 700 }}>{playerName(best)}</span>
            <span className="cx-small cx-muted">for {teamById(best.owner)!.name}</span>
          </span>
        </span>
        <span className="cx-figure" style={{ fontSize: "2rem" }}>
          {fmt(best.night!)}
        </span>
      </div>
      <div className="cx-panel cx-between">
        <span className="cx-row">
          <span className="cx-m-swing" style={{ color: "var(--wood)" }}>
            <Icon name="spoon" size={30} />
          </span>
          <span>
            <span className="cx-eyebrow">Wooden spoon</span>
            <span style={{ display: "block", fontWeight: 700 }}>{spoon.name}</span>
          </span>
        </span>
        <span className="cx-mono cx-soft">{fmt(spoon.rounds[2])}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Home */

export function HomeScorebug() {
  return (
    <div className="cx-page">
      <section className="cx-teamfield cx-lattice" data-color={YOU.color} style={{ borderRadius: "1rem", padding: "1.1rem", border: "1px solid var(--line)" }}>
        <div className="cx-between" style={{ alignItems: "flex-start" }}>
          <span className="cx-row">
            <Crest team={YOU} size={52} />
            <span>
              <span className="cx-eyebrow">Your team</span>
              <span className="cx-display" style={{ display: "block", fontSize: "calc(1.6rem * var(--cx-display-scale))" }}>
                {YOU.name}
              </span>
            </span>
          </span>
        </div>
        <div className="cx-row" style={{ marginTop: "1rem", alignItems: "flex-end", gap: "1.25rem" }}>
          <span>
            <span className="cx-eyebrow">Rank</span>
            <span className="cx-figure cx-m-count" style={{ display: "block", fontSize: "calc(4.5rem * var(--cx-display-scale))" }}>
              #{you.rank}
            </span>
          </span>
          <span style={{ paddingBottom: "0.3rem" }}>
            <span className="cx-figure" style={{ display: "block", fontSize: "calc(2rem * var(--cx-display-scale))" }}>
              {fmt(you.sum)}
            </span>
            <span className="cx-small">
              <Move value={you.moved} /> <span className="cx-soft">passed Šeštadienio Tritaškiai</span>
            </span>
          </span>
        </div>
        <div className="cx-between" style={{ marginTop: "1rem", flexWrap: "wrap" }}>
          <span className="cx-chip">
            <Icon name="lock" size={13} /> Round 4 locks Thu 19:00
          </span>
          <span className="cx-btn cx-btn-primary">Set lineup</span>
        </div>
      </section>

      <RoundTicker />

      <div className="cx-grid-2">
        <section>
          <div className="cx-section-head">
            <h2 className="cx-h2">Standings</h2>
            <span className="cx-link">Full table →</span>
          </div>
          <MiniTable />
        </section>
        <section>
          <div className="cx-section-head">
            <h2 className="cx-h2">Round 3 story</h2>
            <span className="cx-link">Recap →</span>
          </div>
          <StoryCards />
        </section>
      </div>
    </div>
  );
}

export function HomeFrontPage() {
  return (
    <div className="cx-page">
      <section style={{ display: "grid", gap: "0.6rem" }}>
        <span className="cx-eyebrow" style={{ color: "var(--accent)" }}>
          Round 3 · final
        </span>
        <h1 className="cx-display" style={{ fontSize: "calc(2.6rem * var(--cx-display-scale))" }}>
          {winner.name} take the night. You take the lead.
        </h1>
      </section>

      <div className="cx-bug">
        <div className="cx-bug-rank">
          <span className="cx-figure" style={{ fontSize: "calc(2.4rem * var(--cx-display-scale))" }}>
            {you.rank}
          </span>
        </div>
        <div className="cx-bug-body cx-teamfield" data-color={YOU.color}>
          <TeamName team={YOU} size={30} sub={<Move value={you.moved} />} />
        </div>
        <div className="cx-bug-score">
          <span className="cx-figure" style={{ fontSize: "calc(1.9rem * var(--cx-display-scale))" }}>
            {fmt(you.sum)}
          </span>
          <span className="cx-small cx-muted">R3 {fmt(YOU.rounds[2])}</span>
        </div>
      </div>

      <div className="cx-grid-2">
        <StoryCards />
        <section className="cx-panel">
          <div className="cx-section-head">
            <h2 className="cx-h2">The table</h2>
            <span className="cx-link">Open →</span>
          </div>
          <MiniTable limit={5} withGap={false} />
        </section>
      </div>
      <span className="cx-btn cx-btn-primary cx-btn-block">Set Round 4 lineup · locks Thu 19:00</span>
    </div>
  );
}

/* ------------------------------------------------------------ Matchday */

const tonight = mine.filter((p) => p.night !== undefined).slice(0, 7);

function GameStrip() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(9.5rem, 1fr))", gap: "0.5rem" }}>
      {FIXTURES.map((game) => (
        <div key={game.home} className="cx-panel" style={{ padding: "0.6rem 0.7rem", display: "grid", gap: "0.35rem" }}>
          <div className="cx-between cx-small">
            {game.state === "live" ? (
              <span className="cx-badge cx-badge-live">Live</span>
            ) : game.state === "final" ? (
              <span className="cx-badge cx-badge-final">Final</span>
            ) : (
              <span className="cx-muted">{game.time}</span>
            )}
            {game.state === "live" ? <span className="cx-mono cx-muted">{game.time}</span> : null}
          </div>
          {[
            [game.home, game.hs],
            [game.away, game.as],
          ].map(([club, score]) => (
            <div key={club} className="cx-between">
              <span style={{ fontWeight: 700 }}>{club}</span>
              <span className="cx-mono" style={{ fontWeight: 700 }}>
                {game.state === "scheduled" ? "" : score}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function LivePlayer({ player, captain }: { player: Player; captain?: boolean }) {
  const points = (player.night ?? 0) * (captain ? 2 : 1);
  const vsAvg = Math.min(1, (player.night ?? 0) / (player.avg * 1.6));
  return (
    <div className="cx-row" style={{ padding: "0.55rem 0", borderBottom: "1px solid var(--line)" }}>
      <Disc player={player} size={38} captain={captain} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="cx-between">
          <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{playerName(player)}</span>
          <span className="cx-figure" style={{ fontSize: "calc(1.45rem * var(--cx-display-scale))" }}>
            {fmt(points)}
          </span>
        </div>
        <div className="cx-between cx-small cx-muted" style={{ marginTop: "0.2rem" }}>
          <span>
            {player.club} · {captain ? "Captain ×2" : "Starter"}
          </span>
          <span className="cx-bar" style={{ width: "5rem" }}>
            <i style={{ width: `${vsAvg * 100}%` }} />
          </span>
        </div>
      </div>
    </div>
  );
}

export function MatchdayScoreboard() {
  return (
    <div className="cx-page">
      <section className="cx-panel cx-lattice" style={{ padding: "1.1rem", display: "grid", gap: "0.9rem" }}>
        <div className="cx-between">
          <span className="cx-badge cx-badge-live">Live · Round 4</span>
          <span className="cx-small cx-muted">Updated 21:14</span>
        </div>
        <div className="cx-row" style={{ alignItems: "flex-end", gap: "1.1rem" }}>
          <span className="cx-figure" style={{ fontSize: "calc(5rem * var(--cx-display-scale))" }}>
            96.4
          </span>
          <span style={{ paddingBottom: "0.5rem" }}>
            <span className="cx-display" style={{ display: "block", fontSize: "calc(1.4rem * var(--cx-display-scale))" }}>
              2nd tonight
            </span>
            <span className="cx-small">
              <Move value={3} /> <span className="cx-soft">since tip-off</span>
            </span>
          </span>
        </div>
        <div className="cx-row cx-small" style={{ flexWrap: "wrap", gap: "0.4rem" }}>
          <span className="cx-chip">4 finished</span>
          <span className="cx-chip cx-chip-accent">2 playing now</span>
          <span className="cx-chip">1 still to play</span>
          <span className="cx-badge cx-badge-prov">Provisional</span>
        </div>
      </section>
      <div className="cx-grid-2">
        <section>
          <div className="cx-section-head">
            <h2 className="cx-h2">Your five</h2>
            <span className="cx-link">Lineup →</span>
          </div>
          {tonight.slice(0, 5).map((player, index) => (
            <LivePlayer key={player.id} player={player} captain={index === 0} />
          ))}
        </section>
        <section>
          <div className="cx-section-head">
            <h2 className="cx-h2">Games</h2>
            <span className="cx-small cx-muted">Vilnius time</span>
          </div>
          <GameStrip />
        </section>
      </div>
    </div>
  );
}

export function MatchdayCourt() {
  return (
    <div className="cx-page">
      <div className="cx-between">
        <span>
          <span className="cx-eyebrow">Round 4 · live</span>
          <span className="cx-figure" style={{ display: "block", fontSize: "calc(3.4rem * var(--cx-display-scale))" }}>
            96.4
          </span>
        </span>
        <span style={{ textAlign: "right" }}>
          <span className="cx-display" style={{ display: "block", fontSize: "calc(1.6rem * var(--cx-display-scale))" }}>
            2nd
          </span>
          <Move value={3} />
        </span>
      </div>
      <Court surface="night" live />
      <section>
        <div className="cx-section-head">
          <h2 className="cx-h2">Around the league</h2>
          <span className="cx-badge cx-badge-prov">Provisional</span>
        </div>
        <table className="cx-table">
          <tbody>
            {R3.slice(0, 4).map((row, index) => (
              <tr key={row.team.id} data-you={row.team.you ? "" : undefined}>
                <td className="cx-mono">{index + 1}</td>
                <td>
                  <TeamName team={row.team} size={22} />
                </td>
                <td className="cx-num" style={{ fontWeight: 700 }}>
                  {fmt(row.team.rounds[2] * 0.72)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <GameStrip />
    </div>
  );
}

/* -------------------------------------------------------------- Lineup */

export function Court({ surface, live = false }: { surface: "wood" | "night"; live?: boolean }) {
  const [c] = mine.filter((p) => p.pos === "C");
  const forwards = mine.filter((p) => p.pos === "F").slice(0, 2);
  const guards = mine.filter((p) => p.pos === "G").slice(0, 2);
  const row = (players: Player[], top: string) => (
    <div className="cx-court-row" style={{ top }}>
      {players.map((player) => (
        <span key={player.id} className="cx-court-player">
          <Disc player={player} size={52} captain={player.id === "p1"} />
          <span className="cx-court-name">{player.last}</span>
          <span className="cx-court-proj">
            {live ? fmt((player.night ?? 0) * (player.id === "p1" ? 2 : 1)) : `~${fmt(player.avg)}`}
          </span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="cx-court" data-surface={surface}>
      <svg className="cx-court-lines" viewBox="0 0 400 448" preserveAspectRatio="none" aria-hidden="true">
        <rect x="8" y="8" width="384" height="432" rx="4" />
        <rect x="140" y="8" width="120" height="150" />
        <path d="M140 158 a60 60 0 0 0 120 0" />
        <path d="M40 8 V90 a160 160 0 0 0 320 0 V8" />
        <path d="M150 440 a50 50 0 0 1 100 0" />
        <circle cx="200" cy="36" r="9" />
      </svg>
      {row([c], "5%")}
      {row(forwards, "36%")}
      {row(guards, "67%")}
    </div>
  );
}

function Tray() {
  const bench = mine.filter((p) => !["p1", "p2", "p3", "p4", "p5"].includes(p.id)).slice(0, 7);
  return (
    <section>
      <div className="cx-section-head">
        <h2 className="cx-h2">Bench</h2>
        <span className="cx-small cx-muted">Tap two players to swap</span>
      </div>
      <div className="cx-tray">
        {bench.map((player) => (
          <span key={player.id} className="cx-tray-item">
            <Disc player={player} size={44} />
            <span style={{ fontWeight: 600, color: "var(--ink)" }}>{player.last}</span>
            {player.status === "out" ? (
              <span className="cx-badge cx-badge-out">Out</span>
            ) : player.status === "doubtful" ? (
              <span className="cx-badge cx-badge-doubt">Doubt</span>
            ) : (
              <span className="cx-mono">~{fmt(player.avg)}</span>
            )}
          </span>
        ))}
      </div>
    </section>
  );
}

function LineupHead() {
  return (
    <div className="cx-between" style={{ flexWrap: "wrap" }}>
      <Stepper label="Round 4" />
      <span className="cx-chip cx-chip-gold">
        <Icon name="lock" size={13} /> Locks Thu 19:00 · 2d 4h
      </span>
    </div>
  );
}

function Formations() {
  return (
    <div className="cx-row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
      {["1-2-2", "1-3-1", "2-1-2", "2-2-1", "3-1-1"].map((name) => (
        <span key={name} className="cx-seg" aria-pressed={name === "1-2-2"} style={{ display: "inline-grid", placeItems: "center" }}>
          {name}
        </span>
      ))}
    </div>
  );
}

export function LineupNight() {
  return (
    <div className="cx-page">
      <LineupHead />
      <Court surface="night" />
      <div className="cx-between">
        <Formations />
      </div>
      <Tray />
      <div className="cx-row">
        <span className="cx-btn cx-btn-secondary">Auto-pick · +6.4</span>
        <span className="cx-btn cx-btn-primary" style={{ flex: 1 }}>
          Save lineup
        </span>
      </div>
    </div>
  );
}

export function LineupHardwood() {
  return (
    <div className="cx-page">
      <LineupHead />
      <Court surface="wood" />
      <Formations />
      <Tray />
      <div className="cx-panel cx-between">
        <span>
          <span className="cx-eyebrow">Projected</span>
          <span className="cx-figure" style={{ display: "block", fontSize: "calc(2rem * var(--cx-display-scale))" }}>
            118.6
          </span>
        </span>
        <span className="cx-btn cx-btn-primary">Save lineup</span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- Standings */

function RoundTable() {
  const winners = [0, 1, 2].map((round) => [...TEAMS].sort((a, b) => b.rounds[round] - a.rounds[round])[0].id);
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="cx-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th className="cx-num">Total</th>
            <th className="cx-num">Gap</th>
            <th className="cx-num">R1</th>
            <th className="cx-num">R2</th>
            <th className="cx-num">R3</th>
            <th>Form</th>
          </tr>
        </thead>
        <tbody>
          {R3.map((row) => (
            <tr key={row.team.id} data-you={row.team.you ? "" : undefined}>
              <td className="cx-mono" style={{ whiteSpace: "nowrap" }}>
                {row.rank} <Move value={row.moved} />
              </td>
              <td style={{ minWidth: "11rem" }}>
                <TeamName team={row.team} size={26} />
              </td>
              <td className="cx-num" style={{ fontWeight: 800 }}>
                {fmt(row.sum)}
              </td>
              <td className="cx-num cx-muted">{row.gap === 0 ? "—" : `−${fmt(row.gap)}`}</td>
              {row.team.rounds.map((value, index) => (
                <td key={index} className={`cx-num ${winners[index] === row.team.id ? "cx-cell-win" : ""}`}>
                  {fmt(value)}
                </td>
              ))}
              <td>
                <Spark values={row.team.rounds} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StandingsPodium() {
  const [first, second, third] = R3;
  const step = (row: (typeof R3)[number], height: string, label: string) => (
    <div className="cx-step">
      <Crest team={row.team} size={label === "1" ? 56 : 44} />
      <span style={{ fontWeight: 700, fontSize: "0.8125rem", lineHeight: 1.2 }}>{row.team.name}</span>
      <div className="cx-step-block" style={{ height }}>
        <span>
          <span className="cx-figure" style={{ display: "block", fontSize: "calc(1.9rem * var(--cx-display-scale))" }}>
            {label}
          </span>
          <span className="cx-mono cx-small">{fmt(row.sum)}</span>
        </span>
      </div>
    </div>
  );
  return (
    <div className="cx-page">
      <div className="cx-between">
        <h1 className="cx-display cx-h1">Standings</h1>
        <span className="cx-chip">After round 3</span>
      </div>
      <div className="cx-podium">
        {step(second, "5.5rem", "2")}
        {step(first, "7.5rem", "1")}
        {step(third, "4.25rem", "3")}
      </div>
      <div className="cx-row cx-small" style={{ flexWrap: "wrap", gap: "0.4rem" }}>
        <span className="cx-chip cx-chip-gold">
          <Icon name="crown" size={12} /> Round winner
        </span>
        <span className="cx-chip">
          <Icon name="flame" size={12} /> 3 top-3 rounds in a row: Vaflių Fabrikas
        </span>
      </div>
      <RoundTable />
    </div>
  );
}

export function StandingsRace() {
  const ranks = [1, 2, 3].map((upTo) => table(upTo));
  const w = 320;
  const h = 200;
  const x = (i: number) => 30 + (i * (w - 60)) / 2;
  const y = (rank: number) => 14 + ((rank - 1) * (h - 28)) / 7;
  return (
    <div className="cx-page">
      <div className="cx-between">
        <h1 className="cx-display cx-h1">The race</h1>
        <span className="cx-chip">3 rounds</span>
      </div>
      <section className="cx-panel">
        <svg className="cx-bump" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Rank by round for every team">
          {[0, 1, 2].map((i) => (
            <text key={i} x={x(i)} y={h - 1} textAnchor="middle" fontSize="9" fill="var(--ink-3)">
              R{i + 1}
            </text>
          ))}
          {TEAMS.map((team) => {
            const pts = ranks.map((t, i) => [x(i), y(t.find((r) => r.team.id === team.id)!.rank)] as const);
            const stroke = `var(--t-${team.color})`;
            return (
              <g key={team.id} opacity={team.you ? 1 : 0.55}>
                <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={stroke} strokeWidth={team.you ? 4 : 2.25} strokeLinecap="round" strokeLinejoin="round" />
                {pts.map(([px, py], i) => (
                  <circle key={i} cx={px} cy={py} r={team.you ? 5 : 3.5} fill={stroke} />
                ))}
              </g>
            );
          })}
        </svg>
      </section>
      <section>
        <table className="cx-table">
          <tbody>
            {R3.map((row) => (
              <tr key={row.team.id} data-you={row.team.you ? "" : undefined}>
                <td className="cx-mono" style={{ width: "3rem" }}>
                  {row.rank} <Move value={row.moved} />
                </td>
                <td>
                  <TeamName team={row.team} size={24} sub={`${row.team.manager} · last round ${fmt(row.last)}`} />
                </td>
                <td className="cx-num" style={{ fontWeight: 800 }}>
                  {fmt(total(row.team))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}