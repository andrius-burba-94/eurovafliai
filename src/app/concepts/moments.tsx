"use client";

import { useState, type ReactNode } from "react";

import { PLAYERS, TEAMS, teamById } from "./data";
import { Crest, Delta, Disc, Icon, Move, PosTag, TeamName, fmt, playerName } from "./kit";

function Replayable({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  const [run, setRun] = useState(0);
  return (
    <div className="cx-panel" style={{ width: "22rem", display: "grid", gap: "0.75rem", alignContent: "start" }}>
      <div className="cx-between">
        <span className="cx-h2">{title}</span>
        <button type="button" className="cx-btn cx-btn-secondary" style={{ minHeight: "2.25rem" }} onClick={() => setRun((n) => n + 1)}>
          Replay
        </button>
      </div>
      <div key={run} style={{ minHeight: "9rem", display: "grid", alignContent: "center" }}>
        {children}
      </div>
      <p className="cx-small cx-muted">{note}</p>
    </div>
  );
}

export function MomentsSheet() {
  const you = TEAMS[0];
  const rival = TEAMS[1];
  const winner = teamById("t4")!;
  const spoon = teamById("t8")!;
  const pick = PLAYERS.find((p) => p.id === "p14")!;
  return (
    <div className="cx-variants">
      <Replayable title="Overtake" note="Plays once, the first time you open the table after you climbed. Your row slides up past the team you passed and flashes green.">
        <table className="cx-table">
          <tbody>
            <tr data-you="" className="cx-m-overtake-up">
              <td className="cx-mono">
                1 <Move value={1} />
              </td>
              <td>
                <TeamName team={you} size={26} />
              </td>
              <td className="cx-num">414.7</td>
            </tr>
            <tr className="cx-m-overtake-down">
              <td className="cx-mono">
                2 <Move value={-1} />
              </td>
              <td>
                <TeamName team={rival} size={26} />
              </td>
              <td className="cx-num">410.0</td>
            </tr>
          </tbody>
        </table>
      </Replayable>

      <Replayable title="Round winner" note="The crown drops onto the winner's crest on Home and Recap, with a gold sweep across the card.">
        <div className="cx-panel cx-teamfield cx-m-sweep" data-color={winner.color}>
          <div className="cx-between">
            <span className="cx-row">
              <span style={{ position: "relative" }}>
                <Crest team={winner} size={56} />
                <span className="cx-m-crown" style={{ position: "absolute", top: "-1.3rem", left: "0.75rem", color: "var(--gold)" }}>
                  <Icon name="crown" size={28} />
                </span>
              </span>
              <span style={{ fontWeight: 700 }}>{winner.name}</span>
            </span>
            <span className="cx-figure" style={{ fontSize: "2.2rem" }}>
              140.9
            </span>
          </div>
        </div>
      </Replayable>

      <Replayable title="Trade verdict" note="Stamped on a deal card when a deal's running total crosses from losing to winning, or back.">
        <div className="cx-between">
          <span className="cx-row">
            <Disc player={PLAYERS[17]} size={40} />
            <span>
              <b>{playerName(PLAYERS[17])}</b>
              <span className="cx-small cx-muted" style={{ display: "block" }}>
                since round 3
              </span>
            </span>
          </span>
          <span className="cx-row">
            <Delta value={14.3} />
            <span className="cx-stamp cx-m-stamp" style={{ color: "var(--gain)" }}>
              Winning
            </span>
          </span>
        </div>
      </Replayable>

      <Replayable title="Wooden spoon" note="Last place in a round gets the spoon. It swings once, then hangs next to the crest until the next round.">
        <div className="cx-between">
          <TeamName team={spoon} size={40} sub="Round 3 · 91.1" />
          <span className="cx-m-swing" style={{ color: "var(--wood)" }}>
            <Icon name="spoon" size={44} />
          </span>
        </div>
      </Replayable>

      <Replayable title="Streak badge" note="Earned badges flip in once. Three rounds in the top three is 'On fire'.">
        <div className="cx-row cx-m-flip">
          <span className="cx-crest" data-shape="roundel" data-color="ember" style={{ ["--crest-size" as string]: "52px" }}>
            <Icon name="flame" size={26} />
          </span>
          <span>
            <span style={{ display: "block", fontWeight: 800 }}>On fire</span>
            <span className="cx-small cx-muted">Top 3 in three straight rounds</span>
          </span>
        </div>
      </Replayable>

      <Replayable title="Pick is in" note="Draft night only. A lower third wipes across every screen for about two seconds when a pick lands, with an optional sting.">
        <div className="cx-lower cx-m-wipe">
          <div className="cx-lower-tag">
            <span className="cx-figure" style={{ fontSize: "1.6rem" }}>
              17
            </span>
          </div>
          <div className="cx-lower-body cx-teamfield cx-m-rise" data-color="violet">
            <span className="cx-display" style={{ display: "block", fontSize: "calc(1.5rem * var(--cx-display-scale))" }}>
              {playerName(pick)}
            </span>
            <span className="cx-small cx-soft">
              <PosTag pos={pick.pos} /> {pick.club} · to Naktinė Pamaina · {fmt(pick.avg)} avg
            </span>
          </div>
        </div>
      </Replayable>
    </div>
  );
}
