import { CREST_SHAPES, PLAYERS, TEAM_COLORS, TEAMS } from "./data";
import { Crest, Delta, Disc, Icon, Move, PosTag, Stepper } from "./kit";

const FONTS = [
  { key: "barlow", name: "Barlow Condensed", note: "Jersey lettering. Wide weight range, calm figures." },
  { key: "saira", name: "Saira Extra Condensed", note: "Scoreboard LED geometry. The most 'broadcast'." },
  { key: "shoulders", name: "Big Shoulders", note: "Arena signage. Loud, very tall, a lot of character." },
  { key: "archivo", name: "Archivo (condensed + regular)", note: "One family: condensed for scores, regular for the UI." },
] as const;

export function TypeSheet() {
  return (
    <div className="cx-variants">
      {FONTS.map((font) => (
        <div key={font.key} className="cx-panel" style={{ width: "22rem", display: "grid", gap: "0.6rem" }}>
          <span className="cx-eyebrow">{font.name}</span>
          <span
            style={{
              fontFamily: `var(--cx-font-${font.key})`,
              fontStretch: font.key === "archivo" ? "64%" : undefined,
              fontWeight: 800,
              fontSize: "3.2rem",
              lineHeight: 0.9,
              textTransform: "uppercase",
            }}
          >
            Vaflių Fabrikas
          </span>
          <span
            style={{
              fontFamily: `var(--cx-font-${font.key})`,
              fontStretch: font.key === "archivo" ? "64%" : undefined,
              fontWeight: 800,
              fontSize: "4.5rem",
              lineHeight: 0.85,
            }}
          >
            #1 414.7
          </span>
          <span
            style={{
              fontFamily: `var(--cx-font-${font.key})`,
              fontStretch: font.key === "archivo" ? "64%" : undefined,
              fontWeight: 700,
              fontSize: "1.5rem",
              textTransform: "uppercase",
            }}
          >
            Šeštadienio Tritaškiai · Kėdainių Kometos
          </span>
          <span className="cx-small cx-soft">{font.note}</span>
        </div>
      ))}
    </div>
  );
}

const SWATCHES = [
  ["bg", "Ground"],
  ["bg-raised", "Panel"],
  ["bg-high", "Raised"],
  ["line", "Rule"],
  ["ink", "Ink"],
  ["ink-2", "Ink 2"],
  ["ink-3", "Ink 3"],
  ["accent", "Accent: the one act"],
  ["live", "Live"],
  ["gain", "Gain"],
  ["loss", "Loss / out"],
  ["gold", "Crown / captain"],
  ["pos-g", "Guard"],
  ["pos-f", "Forward"],
  ["pos-c", "Center"],
  ["wood", "Hardwood"],
] as const;

export function PaletteSheet() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(9rem, 1fr))", gap: "0.75rem", maxWidth: "70rem" }}>
      {SWATCHES.map(([token, label]) => (
        <div key={token} style={{ display: "grid", gap: "0.35rem" }}>
          <span style={{ height: "3.5rem", borderRadius: "0.6rem", background: `var(--${token})`, border: "1px solid var(--line)" }} />
          <span className="cx-small" style={{ fontWeight: 600 }}>
            {label}
          </span>
          <span className="cx-mono cx-muted" style={{ fontSize: "0.6875rem" }}>
            --{token}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CrestSheet() {
  return (
    <div className="cx-stack" style={{ gap: "1.5rem", maxWidth: "70rem" }}>
      <div className="cx-row" style={{ flexWrap: "wrap", gap: "0.9rem" }}>
        {TEAM_COLORS.map((color, index) => (
          <span key={color} style={{ display: "grid", justifyItems: "center", gap: "0.3rem" }}>
            <Crest team={{ mono: "EV", color, shape: CREST_SHAPES[index % 4] }} size={52} />
            <span className="cx-small cx-muted">{color}</span>
          </span>
        ))}
      </div>
      <div className="cx-panel" style={{ maxWidth: "26rem", display: "grid", gap: "0.9rem" }}>
        <span className="cx-h2">Your team</span>
        <span className="cx-row">
          <Crest team={TEAMS[0]} size={64} />
          <span>
            <span style={{ display: "block", fontWeight: 700 }}>{TEAMS[0].name}</span>
            <span className="cx-small cx-muted">Monogram VF · change it any time</span>
          </span>
        </span>
        <span className="cx-eyebrow">Colour</span>
        <span className="cx-row" style={{ flexWrap: "wrap", gap: "0.4rem" }}>
          {TEAM_COLORS.map((color) => (
            <span
              key={color}
              aria-label={color}
              style={{
                width: "2rem",
                height: "2rem",
                borderRadius: "50%",
                background: `var(--t-${color})`,
                outline: color === TEAMS[0].color ? "2px solid var(--ink)" : undefined,
                outlineOffset: 2,
              }}
            />
          ))}
        </span>
        <span className="cx-eyebrow">Shape</span>
        <span className="cx-row" style={{ gap: "0.6rem" }}>
          {CREST_SHAPES.map((shape) => (
            <span key={shape} className="cx-seg" aria-pressed={shape === TEAMS[0].shape} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", minHeight: "2.75rem" }}>
              <Crest team={{ mono: "VF", color: TEAMS[0].color, shape }} size={26} />
              {shape}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

export function ComponentSheet() {
  return (
    <div className="cx-stack" style={{ gap: "1.25rem", maxWidth: "46rem" }}>
      <div className="cx-row" style={{ flexWrap: "wrap" }}>
        <span className="cx-btn cx-btn-primary">Save lineup</span>
        <span className="cx-btn cx-btn-secondary">Compare</span>
        <span className="cx-btn cx-btn-quiet">Cancel</span>
        <Stepper label="Round 4" />
      </div>
      <div className="cx-row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <span className="cx-badge cx-badge-live">Live</span>
        <span className="cx-badge cx-badge-final">Final</span>
        <span className="cx-badge cx-badge-prov">Provisional</span>
        <span className="cx-badge cx-badge-out">Out</span>
        <span className="cx-badge cx-badge-doubt">Doubtful</span>
        <span className="cx-chip cx-chip-gold">
          <Icon name="crown" size={12} /> Round winner
        </span>
        <span className="cx-chip">
          <Icon name="lock" size={12} /> Locks Thu 19:00
        </span>
        <span className="cx-chip cx-chip-accent">Free agent</span>
      </div>
      <div className="cx-row" style={{ flexWrap: "wrap", gap: "1rem" }}>
        <PosTag pos="G" />
        <PosTag pos="F" />
        <PosTag pos="C" />
        <Delta value={14.3} />
        <Delta value={-6.1} />
        <Move value={2} />
        <Move value={-1} />
        <Disc player={PLAYERS[0]} size={48} captain />
        <Disc player={PLAYERS[2]} size={48} />
        <Disc player={PLAYERS[4]} size={48} />
      </div>
    </div>
  );
}
