import { PLAYERS, TEAMS, teamById } from "./data";
import { Crest, Disc, Icon, PosTag, TeamName, fmt, playerName } from "./kit";

const onClock = teamById("t3")!;
const last = PLAYERS.find((p) => p.id === "p14")!;
const lastTeam = teamById("t5")!;
const columns = TEAMS.slice(0, 4);

function PickIsIn() {
  return (
    <div className="cx-lower cx-m-wipe" role="status">
      <div className="cx-lower-tag">
        <span className="cx-display" style={{ fontSize: "calc(1rem * var(--cx-display-scale))", writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
          Pick 17
        </span>
      </div>
      <div className="cx-lower-body cx-teamfield cx-m-rise" data-color={lastTeam.color}>
        <div className="cx-row">
          <Disc player={last} size={44} />
          <span style={{ minWidth: 0 }}>
            <span className="cx-display" style={{ display: "block", fontSize: "calc(1.6rem * var(--cx-display-scale))" }}>
              {playerName(last)}
            </span>
            <span className="cx-small cx-soft">
              <PosTag pos={last.pos} /> {last.club} · to <b>{lastTeam.name}</b>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function Board() {
  const picks = PLAYERS.slice(0, 16);
  return (
    <div className="cx-board" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((team) => (
        <div key={team.id} className="cx-board-head cx-teamfield" data-color={team.color}>
          <Crest team={team} size={26} />
          <span style={{ fontWeight: 700, fontSize: "0.6875rem", lineHeight: 1.1 }}>{team.name.split(" ")[0]}</span>
        </div>
      ))}
      {Array.from({ length: 12 }, (_, i) => {
        const p = picks[i];
        const live = i === 9;
        const empty = i > 9;
        return (
          <div key={i} className="cx-board-cell" data-pos={empty || live ? undefined : p.pos} data-live={live ? "" : undefined} data-empty={empty ? "" : undefined}>
            {live ? (
              <span style={{ fontWeight: 800, color: "var(--accent)" }}>On the clock</span>
            ) : empty ? (
              <span className="cx-muted">{i + 1}</span>
            ) : (
              <>
                <span className="cx-muted cx-mono">{i + 1}</span>
                <span style={{ display: "block", fontWeight: 800, textTransform: "uppercase" }}>{p.last}</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function DraftScorebug() {
  return (
    <div className="cx-page" style={{ paddingTop: 0 }}>
      <section className="cx-teamfield" data-color={onClock.color} style={{ margin: "0 -1rem", padding: "0.9rem 1rem", borderBottom: "2px solid var(--accent)", position: "sticky", top: 0, zIndex: 2 }}>
        <div className="cx-between">
          <span className="cx-row">
            <Crest team={onClock} size={48} />
            <span>
              <span className="cx-eyebrow" style={{ color: "var(--accent)" }}>
                On the clock · round 3, pick 18
              </span>
              <span className="cx-display" style={{ display: "block", fontSize: "calc(1.7rem * var(--cx-display-scale))" }}>
                {onClock.name}
              </span>
            </span>
          </span>
          <span className="cx-figure" style={{ fontSize: "calc(3.2rem * var(--cx-display-scale))", color: "var(--accent)" }}>
            0:47
          </span>
        </div>
        <div className="cx-row cx-small" style={{ marginTop: "0.6rem", gap: "0.4rem" }}>
          <span className="cx-muted">Still needs</span>
          <PosTag pos="G" />
          <span className="cx-mono">3</span>
          <PosTag pos="F" />
          <span className="cx-mono">4</span>
          <PosTag pos="C" />
          <span className="cx-mono">2</span>
        </div>
      </section>
      <PickIsIn />
      <section>
        <div className="cx-section-head">
          <h2 className="cx-h2">The board</h2>
          <span className="cx-small cx-muted">17 of 104</span>
        </div>
        <Board />
      </section>
    </div>
  );
}

export function DraftRing() {
  return (
    <div className="cx-page">
      <section className="cx-panel cx-row" style={{ gap: "1rem" }}>
        <div className="cx-ring">
          <div>
            <span className="cx-figure" style={{ fontSize: "calc(1.9rem * var(--cx-display-scale))" }}>
              47
            </span>
          </div>
        </div>
        <span style={{ minWidth: 0 }}>
          <span className="cx-eyebrow">Pick 18 · round 3</span>
          <TeamName team={onClock} size={34} sub={`${onClock.manager} is picking`} />
        </span>
      </section>
      <section>
        <div className="cx-section-head">
          <h2 className="cx-h2">Best available</h2>
          <span className="cx-small cx-muted">by PIR</span>
        </div>
        {PLAYERS.filter((p) => !p.owner)
          .concat(PLAYERS.slice(5, 7))
          .map((p) => (
            <div key={p.id} className="cx-row" style={{ padding: "0.55rem 0", borderBottom: "1px solid var(--line)" }}>
              <Disc player={p} size={36} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 700, fontSize: "0.9rem" }}>{playerName(p)}</span>
                <span className="cx-small cx-muted">{p.club}</span>
              </span>
              <span className="cx-mono" style={{ fontWeight: 700 }}>
                {fmt(p.avg)}
              </span>
              <span className="cx-btn cx-btn-secondary" style={{ minHeight: "2.25rem", padding: "0 0.75rem", fontSize: "0.8125rem" }}>
                Choose
              </span>
            </div>
          ))}
      </section>
      <PickIsIn />
    </div>
  );
}

/* ---------------------------------------------------------------- Roll */

export function RollStage() {
  const drawn = TEAMS.slice(4);
  return (
    <div className="cx-page cx-lattice" style={{ minHeight: "100%", justifyContent: "center", textAlign: "center" }}>
      <span className="cx-eyebrow">The roll · 8 teams</span>
      <div className="cx-m-count" style={{ display: "grid", justifyItems: "center", gap: "0.75rem", padding: "1.5rem 0" }}>
        <span className="cx-display" style={{ fontSize: "calc(1.1rem * var(--cx-display-scale))", color: "var(--accent)" }}>
          Pick 4 goes to
        </span>
        <Crest team={drawn[0]} size={96} />
        <span className="cx-display" style={{ fontSize: "calc(2.6rem * var(--cx-display-scale))" }}>
          {drawn[0].name}
        </span>
      </div>
      <ol style={{ display: "grid", gap: "0.4rem", textAlign: "left" }}>
        {[8, 7, 6, 5].map((slot, index) => {
          const team = drawn[3 - index];
          return (
            <li key={slot} className="cx-panel cx-row" style={{ padding: "0.55rem 0.8rem" }}>
              <span className="cx-figure" style={{ width: "2rem", fontSize: "calc(1.5rem * var(--cx-display-scale))" }}>
                {slot}
              </span>
              <TeamName team={team} size={28} />
            </li>
          );
        })}
        {[3, 2, 1].map((slot) => (
          <li key={slot} className="cx-row" style={{ padding: "0.55rem 0.8rem", border: "1px dashed var(--line-strong)", borderRadius: "0.875rem" }}>
            <span className="cx-figure cx-muted" style={{ width: "2rem", fontSize: "calc(1.5rem * var(--cx-display-scale))" }}>
              {slot}
            </span>
            <span className="cx-muted">{slot === 1 ? "First pick, still to come" : "Still to draw"}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function RollCards() {
  return (
    <div className="cx-page" style={{ textAlign: "center" }}>
      <span className="cx-eyebrow">Drawing the order</span>
      <span className="cx-figure" style={{ fontSize: "calc(5rem * var(--cx-display-scale))", color: "var(--accent)" }}>
        3
      </span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem" }}>
        {TEAMS.map((team, i) => {
          const revealed = i >= 4;
          return (
            <div key={team.id} className={`cx-panel ${revealed ? "cx-m-flip" : ""}`} style={{ aspectRatio: "3 / 4", display: "grid", placeItems: "center", padding: "0.5rem", background: revealed ? undefined : "var(--bg-high)" }}>
              {revealed ? (
                <span style={{ display: "grid", justifyItems: "center", gap: "0.3rem" }}>
                  <span className="cx-figure" style={{ fontSize: "calc(1.4rem * var(--cx-display-scale))" }}>
                    {12 - i}
                  </span>
                  <Crest team={team} size={34} />
                  <span style={{ fontSize: "0.625rem", fontWeight: 700, lineHeight: 1.1 }}>{team.name}</span>
                </span>
              ) : (
                <span className="cx-lattice" style={{ width: "100%", height: "100%", borderRadius: "0.5rem", display: "grid", placeItems: "center", color: "var(--ink-3)" }}>
                  <Icon name="ball" size={26} />
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="cx-small cx-muted">One card every three seconds. The last card is the first pick.</p>
    </div>
  );
}
