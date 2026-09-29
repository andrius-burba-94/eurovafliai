import type { ReactNode } from "react";

import { DEALS, PLAYERS, TEAMS, table, teamById, type Player } from "./data";
import { Crest, Delta, Disc, Icon, PosTag, Spark, TeamName, fmt, playerName } from "./kit";

const R3 = table(3);
const byRound = [...TEAMS].sort((a, b) => b.rounds[2] - a.rounds[2]);
const winner = byRound[0];
const spoon = byRound[byRound.length - 1];
const margin = byRound[0].rounds[2] - byRound[1].rounds[2];
const best = PLAYERS.find((p) => p.id === "p14")!;
const captain = PLAYERS.find((p) => p.id === "p1")!;
const player = (id: string) => PLAYERS.find((p) => p.id === id)!;

function RoundChips() {
  return (
    <div className="cx-row" style={{ gap: "0.35rem", overflowX: "auto" }}>
      {[1, 2, 3].map((round) => (
        <span key={round} className="cx-seg" aria-pressed={round === 3} style={{ display: "inline-grid", placeItems: "center" }}>
          R{round}
        </span>
      ))}
      <span className="cx-seg" style={{ display: "inline-grid", placeItems: "center", opacity: 0.5 }}>
        R4 · live
      </span>
    </div>
  );
}

function NightLadder() {
  return (
    <ol className="cx-stack" style={{ gap: 0 }}>
      {byRound.map((team, index) => {
        const width = (team.rounds[2] / winner.rounds[2]) * 100;
        return (
          <li key={team.id} className="cx-row" style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--line)" }}>
            <span className="cx-mono cx-muted" style={{ width: "1.25rem" }}>
              {index + 1}
            </span>
            <Crest team={team} size={26} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="cx-between">
                <span style={{ fontWeight: 700, fontSize: "0.875rem" }}>
                  {team.name}
                  {index === 0 ? <span style={{ color: "var(--gold)", marginLeft: "0.3rem" }}><Icon name="crown" size={14} /></span> : null}
                </span>
                <span className="cx-mono" style={{ fontWeight: 700 }}>
                  {fmt(team.rounds[2])}
                </span>
              </span>
              <span className="cx-bar" style={{ marginTop: "0.35rem" }}>
                <i style={{ width: `${width}%`, background: `var(--t-${team.color})` }} />
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* --------------------------------------------------------------- Recap */

export function RecapFrontPage() {
  return (
    <div className="cx-page">
      <RoundChips />
      <header style={{ display: "grid", gap: "0.5rem" }}>
        <span className="cx-eyebrow" style={{ color: "var(--accent)" }}>
          Round 3 · all games final
        </span>
        <h1 className="cx-display" style={{ fontSize: "calc(2.7rem * var(--cx-display-scale))" }}>
          {winner.name} win round 3 by {fmt(margin)}
        </h1>
        <p className="cx-soft" style={{ fontSize: "0.9375rem" }}>
          Vaflių Fabrikas go top of the table. {spoon.name} take the spoon.
        </p>
      </header>
      <section className="cx-teamfield cx-lattice cx-m-sweep" data-color={winner.color} style={{ borderRadius: "1rem", padding: "1.1rem", border: "1px solid var(--line)" }}>
        <div className="cx-between">
          <span className="cx-row">
            <span style={{ position: "relative" }}>
              <Crest team={winner} size={64} />
              <span className="cx-m-crown" style={{ position: "absolute", top: "-1.4rem", left: "0.9rem", color: "var(--gold)" }}>
                <Icon name="crown" size={30} />
              </span>
            </span>
            <span>
              <span className="cx-eyebrow">Round winner</span>
              <span className="cx-display" style={{ display: "block", fontSize: "calc(1.5rem * var(--cx-display-scale))" }}>
                {winner.name}
              </span>
            </span>
          </span>
          <span className="cx-figure" style={{ fontSize: "calc(3rem * var(--cx-display-scale))" }}>
            {fmt(winner.rounds[2])}
          </span>
        </div>
      </section>
      <div className="cx-grid-2">
        <section>
          <h2 className="cx-h2" style={{ marginBottom: "0.5rem" }}>
            The night
          </h2>
          <NightLadder />
        </section>
        <div className="cx-stack">
          <AwardRow icon={<Disc player={best} size={44} />} label="Best night" who={playerName(best)} sub={`for ${teamById(best.owner)!.name}`} value={fmt(best.night!)} />
          <AwardRow icon={<Disc player={captain} size={44} captain />} label="Captain of the round" who={playerName(captain)} sub="Vaflių Fabrikas · ×2" value={fmt(captain.night! * 2)} />
          <AwardRow
            icon={
              <span className="cx-m-swing" style={{ color: "var(--wood)" }}>
                <Icon name="spoon" size={36} />
              </span>
            }
            label="Wooden spoon"
            who={spoon.name}
            sub={spoon.manager}
            value={fmt(spoon.rounds[2])}
          />
          <AwardRow icon={<Crest team={teamById("t2")!} size={40} />} label="Biggest swing" who="Šeštadienio Tritaškiai" sub="Oskar Przykład ⇄ Emre Taslak" value="+14.3" />
        </div>
      </div>
    </div>
  );
}

function AwardRow({ icon, label, who, sub, value }: { icon: ReactNode; label: string; who: string; sub: string; value: string }) {
  return (
    <div className="cx-panel cx-between">
      <span className="cx-row" style={{ minWidth: 0 }}>
        {icon}
        <span style={{ minWidth: 0 }}>
          <span className="cx-eyebrow">{label}</span>
          <span style={{ display: "block", fontWeight: 700 }}>{who}</span>
          <span className="cx-small cx-muted">{sub}</span>
        </span>
      </span>
      <span className="cx-figure" style={{ fontSize: "calc(1.9rem * var(--cx-display-scale))" }}>
        {value}
      </span>
    </div>
  );
}

export function RecapAwards() {
  const award = (title: string, body: ReactNode, tone: string, icon: ReactNode) => (
    <div className="cx-panel cx-m-flip" style={{ display: "grid", gap: "0.6rem", alignContent: "start", borderColor: tone }}>
      <span className="cx-row" style={{ color: tone, gap: "0.4rem" }}>
        {icon}
        <span className="cx-h2" style={{ fontSize: "calc(1.05rem * var(--cx-display-scale))" }}>
          {title}
        </span>
      </span>
      {body}
    </div>
  );
  return (
    <div className="cx-page">
      <div className="cx-between">
        <h1 className="cx-display cx-h1">Round 3 awards</h1>
        <RoundChips />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(10.5rem, 1fr))", gap: "0.75rem" }}>
        {award(
          "Round winner",
          <>
            <Crest team={winner} size={48} />
            <span style={{ fontWeight: 700 }}>{winner.name}</span>
            <span className="cx-figure" style={{ fontSize: "calc(2.2rem * var(--cx-display-scale))" }}>
              {fmt(winner.rounds[2])}
            </span>
          </>,
          "var(--gold)",
          <Icon name="crown" size={18} />,
        )}
        {award(
          "Best night",
          <>
            <Disc player={best} size={48} />
            <span style={{ fontWeight: 700 }}>{playerName(best)}</span>
            <span className="cx-figure" style={{ fontSize: "calc(2.2rem * var(--cx-display-scale))" }}>
              {fmt(best.night!)}
            </span>
          </>,
          "var(--accent)",
          <Icon name="star" size={18} />,
        )}
        {award(
          "Captain call",
          <>
            <Disc player={captain} size={48} captain />
            <span style={{ fontWeight: 700 }}>{playerName(captain)}</span>
            <span className="cx-figure" style={{ fontSize: "calc(2.2rem * var(--cx-display-scale))" }}>
              {fmt(captain.night! * 2)}
            </span>
          </>,
          "var(--gold)",
          <Icon name="star" size={18} />,
        )}
        {award(
          "Wooden spoon",
          <>
            <span className="cx-m-swing" style={{ color: "var(--wood)" }}>
              <Icon name="spoon" size={48} />
            </span>
            <span style={{ fontWeight: 700 }}>{spoon.name}</span>
            <span className="cx-figure" style={{ fontSize: "calc(2.2rem * var(--cx-display-scale))" }}>
              {fmt(spoon.rounds[2])}
            </span>
          </>,
          "var(--wood)",
          <Icon name="spoon" size={18} />,
        )}
      </div>
      <section>
        <h2 className="cx-h2" style={{ marginBottom: "0.5rem" }}>
          Everyone&rsquo;s night
        </h2>
        <NightLadder />
      </section>
    </div>
  );
}

/* -------------------------------------------------------------- Trades */

function Faces({ ids }: { ids: string[] }) {
  return (
    <span className="cx-stack" style={{ gap: "0.4rem" }}>
      {ids.map((id) => {
        const p: Player = player(id);
        return (
          <span key={id} className="cx-row" style={{ gap: "0.5rem" }}>
            <Disc player={p} size={34} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 700, fontSize: "0.875rem" }}>{playerName(p)}</span>
              <span className="cx-small cx-muted">
                {p.club} · {fmt(p.avg)} avg
              </span>
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function TradesCards() {
  return (
    <div className="cx-page">
      <div className="cx-between">
        <h1 className="cx-display cx-h1">Trades</h1>
        <span className="cx-btn cx-btn-secondary">Record</span>
      </div>
      <div className="cx-row" style={{ gap: "0.35rem", overflowX: "auto" }}>
        <span className="cx-seg" aria-pressed="true" style={{ display: "inline-grid", placeItems: "center" }}>
          All teams
        </span>
        {TEAMS.slice(0, 4).map((team) => (
          <span key={team.id} className="cx-seg" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
            <Crest team={team} size={18} /> {team.mono}
          </span>
        ))}
      </div>
      {DEALS.map((deal, index) => {
        const team = teamById(deal.team)!;
        const winning = deal.delta > 0;
        return (
          <article key={index} className="cx-panel" style={{ display: "grid", gap: "0.8rem", position: "relative" }}>
            <div className="cx-between">
              <TeamName team={team} size={30} sub={`${deal.kind === "trade" ? `Trade with ${teamById(deal.with!)!.name}` : "Free agent swap"} · from R${deal.round}`} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "0.6rem", alignItems: "center" }}>
              <div>
                <span className="cx-eyebrow">Out</span>
                <Faces ids={deal.out} />
              </div>
              <Icon name="swap" size={22} className="cx-muted" />
              <div>
                <span className="cx-eyebrow">In</span>
                <Faces ids={deal.in} />
              </div>
            </div>
            <div className="cx-between" style={{ borderTop: "1px solid var(--line)", paddingTop: "0.7rem" }}>
              <span className="cx-small cx-muted">Points since the deal</span>
              <span className="cx-row">
                <Delta value={deal.delta} />
                <span className={`cx-stamp cx-m-stamp`} style={{ color: winning ? "var(--gain)" : "var(--loss)" }}>
                  {winning ? "Winning" : "Losing"}
                </span>
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function TradesLedger() {
  const net = TEAMS.map((team) => ({
    team,
    net: DEALS.filter((d) => d.team === team.id).reduce((sum, d) => sum + d.delta, 0),
    count: DEALS.filter((d) => d.team === team.id).length,
  })).sort((a, b) => b.net - a.net);
  const max = Math.max(...net.map((n) => Math.abs(n.net))) || 1;
  return (
    <div className="cx-page">
      <div className="cx-between">
        <h1 className="cx-display cx-h1">Deal ledger</h1>
        <span className="cx-btn cx-btn-secondary">Record</span>
      </div>
      <section className="cx-panel">
        <h2 className="cx-h2" style={{ marginBottom: "0.6rem" }}>
          Who&rsquo;s winning the market
        </h2>
        {net.map(({ team, net: value, count }) => (
          <div key={team.id} className="cx-row" style={{ padding: "0.35rem 0" }}>
            <Crest team={team} size={22} />
            <span style={{ width: "7.5rem", fontSize: "0.8125rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{team.name}</span>
            <span style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "center" }}>
              <span style={{ display: "flex", justifyContent: "flex-end" }}>
                {value < 0 ? <i style={{ height: "0.6rem", width: `${(Math.abs(value) / max) * 100}%`, background: "var(--loss)", borderRadius: "999px 0 0 999px" }} /> : null}
              </span>
              <span>{value > 0 ? <i style={{ display: "block", height: "0.6rem", width: `${(value / max) * 100}%`, background: "var(--gain)", borderRadius: "0 999px 999px 0" }} /> : null}</span>
            </span>
            <span style={{ width: "4.5rem", textAlign: "right" }}>{count ? <Delta value={value} /> : <span className="cx-small cx-muted">no deals</span>}</span>
          </div>
        ))}
      </section>
      <section>
        <h2 className="cx-h2" style={{ marginBottom: "0.4rem" }}>
          History
        </h2>
        {DEALS.map((deal, index) => {
          const team = teamById(deal.team)!;
          return (
            <div key={index} className="cx-row" style={{ padding: "0.6rem 0", borderBottom: "1px solid var(--line)" }}>
              <span className="cx-chip">R{deal.round}</span>
              <Crest team={team} size={24} />
              <span style={{ flex: 1, fontSize: "0.875rem", minWidth: 0 }}>
                <b>{player(deal.out[0]).last}</b> <span className="cx-muted">⇄</span> <b>{player(deal.in[0]).last}</b>
              </span>
              <Delta value={deal.delta} />
            </div>
          );
        })}
      </section>
    </div>
  );
}

/* --------------------------------------------------------------- Stats */

function Record({ label, who, value, sub }: { label: string; who: ReactNode; value: string; sub: string }) {
  return (
    <div style={{ display: "grid", gap: "0.35rem", padding: "0.8rem 0", borderBottom: "1px solid var(--line)" }}>
      <span className="cx-eyebrow">{label}</span>
      <div className="cx-between">
        {who}
        <span className="cx-figure" style={{ fontSize: "calc(1.9rem * var(--cx-display-scale))" }}>
          {value}
        </span>
      </div>
      <span className="cx-small cx-muted">{sub}</span>
    </div>
  );
}

export function StatsRecordBook() {
  const t2 = teamById("t2")!;
  const t8 = teamById("t8")!;
  return (
    <div className="cx-page">
      <div className="cx-between">
        <h1 className="cx-display cx-h1">League stats</h1>
        <span className="cx-chip">Season 26–27</span>
      </div>
      <div className="cx-row" style={{ gap: "0.35rem", overflowX: "auto" }}>
        {["Records", "Teams", "Lineups", "Draft", "Players", "Deals"].map((tab, i) => (
          <span key={tab} className="cx-seg" aria-pressed={i === 0} style={{ display: "inline-grid", placeItems: "center" }}>
            {tab}
          </span>
        ))}
      </div>
      <div className="cx-grid-2">
        <section>
          <h2 className="cx-h2">Record book</h2>
          <Record label="Highest round" who={<TeamName team={t2} size={28} />} value="170.0" sub="Round 1" />
          <Record label="Best single night" who={<span className="cx-row"><Disc player={PLAYERS[13]} size={32} /><b>{playerName(PLAYERS[13])}</b></span>} value="57.2" sub="Round 3 · Naktinė Pamaina" />
          <Record label="Biggest winning margin" who={<TeamName team={t2} size={28} />} value="4.3" sub="Round 1, over Vaflių Fabrikas" />
          <Record label="Lowest round" who={<TeamName team={teamById("t7")!} size={28} />} value="73.2" sub="Round 2" />
        </section>
        <section className="cx-stack">
          <h2 className="cx-h2">Badges so far</h2>
          {[
            { icon: "flame" as const, title: "On fire", body: "Top 3 in three straight rounds", team: teamById("t1")! },
            { icon: "crown" as const, title: "Crowned", body: "1 round won", team: t2 },
            { icon: "spoon" as const, title: "Spoon collector", body: "2 wooden spoons", team: t8 },
          ].map((badge) => (
            <div key={badge.title} className="cx-panel cx-row cx-m-flip">
              <span className="cx-crest" data-shape="roundel" data-color="sand" style={{ ["--crest-size" as string]: "44px" }}>
                <Icon name={badge.icon} size={22} />
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontWeight: 700 }}>{badge.title}</span>
                <span className="cx-small cx-muted">{badge.body}</span>
              </span>
              <Crest team={badge.team} size={26} />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

export function StatsProfiles() {
  const efficiency = [92, 81, 77, 88, 70, 74, 68, 83];
  return (
    <div className="cx-page">
      <div className="cx-between">
        <h1 className="cx-display cx-h1">Team profiles</h1>
        <span className="cx-chip">3 rounds</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="cx-table">
          <thead>
            <tr>
              <th>Team</th>
              <th className="cx-num">Avg</th>
              <th className="cx-num">Best</th>
              <th className="cx-num">Wins</th>
              <th className="cx-num">Top 3</th>
              <th className="cx-num">Captain hit</th>
              <th>Form</th>
            </tr>
          </thead>
          <tbody>
            {R3.map((row, i) => (
              <tr key={row.team.id} data-you={row.team.you ? "" : undefined}>
                <td style={{ minWidth: "10rem" }}>
                  <TeamName team={row.team} size={24} />
                </td>
                <td className="cx-num">{fmt(row.sum / 3)}</td>
                <td className="cx-num">{fmt(Math.max(...row.team.rounds))}</td>
                <td className="cx-num">{[0, 1, 2].filter((r) => [...TEAMS].sort((a, b) => b.rounds[r] - a.rounds[r])[0].id === row.team.id).length}</td>
                <td className="cx-num">{[0, 1, 2].filter((r) => [...TEAMS].sort((a, b) => b.rounds[r] - a.rounds[r]).slice(0, 3).some((t) => t.id === row.team.id)).length}</td>
                <td className="cx-num">{efficiency[i]}%</td>
                <td>
                  <Spark values={row.team.rounds} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="cx-grid-2">
        <div className="cx-panel">
          <h2 className="cx-h2" style={{ marginBottom: "0.5rem" }}>
            Points left on the bench
          </h2>
          {R3.slice(0, 5).map((row, i) => (
            <div key={row.team.id} className="cx-row" style={{ padding: "0.3rem 0" }}>
              <Crest team={row.team} size={20} />
              <span className="cx-small" style={{ flex: 1 }}>
                {row.team.name}
              </span>
              <span className="cx-bar" style={{ width: "6rem" }}>
                <i style={{ width: `${[22, 48, 35, 61, 18][i]}%`, background: "var(--loss)" }} />
              </span>
              <span className="cx-mono cx-small" style={{ width: "2.5rem", textAlign: "right" }}>
                {[12.4, 27.0, 19.8, 34.1, 10.2][i]}
              </span>
            </div>
          ))}
        </div>
        <div className="cx-panel">
          <h2 className="cx-h2" style={{ marginBottom: "0.5rem" }}>
            Draft steals
          </h2>
          {PLAYERS.filter((p) => p.pick && p.pick > 50)
            .slice(0, 4)
            .map((p) => (
              <div key={p.id} className="cx-row" style={{ padding: "0.35rem 0" }}>
                <PosTag pos={p.pos} />
                <span style={{ flex: 1, fontSize: "0.875rem" }}>
                  <b>{playerName(p)}</b> <span className="cx-muted">pick #{p.pick}</span>
                </span>
                <span className="cx-mono">{fmt(p.avg)}</span>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
