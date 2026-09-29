/*
 * Gallery data. Every team, manager and player here is invented on purpose
 * (PRODUCT.md: nothing about real players or real members may appear in a
 * mockup). The player surnames are the word "example" or "sample" in the
 * languages of the league's clubs, so nobody mistakes them for a real roster.
 */

export type CrestShape = "shield" | "roundel" | "waffle" | "hex";

export type TeamColor =
  | "crimson"
  | "ember"
  | "mustard"
  | "lime"
  | "forest"
  | "teal"
  | "sky"
  | "royal"
  | "violet"
  | "magenta"
  | "slate"
  | "sand";

export const TEAM_COLORS: readonly TeamColor[] = [
  "crimson",
  "ember",
  "mustard",
  "lime",
  "forest",
  "teal",
  "sky",
  "royal",
  "violet",
  "magenta",
  "slate",
  "sand",
];

export const CREST_SHAPES: readonly CrestShape[] = ["shield", "roundel", "waffle", "hex"];

export type Team = {
  id: string;
  name: string;
  manager: string;
  mono: string;
  color: TeamColor;
  shape: CrestShape;
  rounds: number[];
  you?: boolean;
};

export const TEAMS: Team[] = [
  { id: "t1", name: "Vaflių Fabrikas", manager: "Tomas P.", mono: "VF", color: "ember", shape: "waffle", rounds: [165.7, 117.8, 131.2], you: true },
  { id: "t2", name: "Šeštadienio Tritaškiai", manager: "Ignas K.", mono: "ŠT", color: "royal", shape: "shield", rounds: [170.0, 121.6, 118.4] },
  { id: "t3", name: "Kėdainių Kometos", manager: "Rūta M.", mono: "KK", color: "teal", shape: "roundel", rounds: [136.25, 111.65, 128.9] },
  { id: "t4", name: "Blynų Brigada", manager: "Marius V.", mono: "BB", color: "mustard", shape: "hex", rounds: [121.15, 121.1, 140.9] },
  { id: "t5", name: "Naktinė Pamaina", manager: "Paulius Š.", mono: "NP", color: "violet", shape: "shield", rounds: [142.75, 92.15, 110.6] },
  { id: "t6", name: "Kavos Tirščiai", manager: "Jonas B.", mono: "KT", color: "crimson", shape: "roundel", rounds: [123.55, 100.8, 98.25] },
  { id: "t7", name: "Dėdės Zona", manager: "Lukas A.", mono: "DZ", color: "forest", shape: "hex", rounds: [143.0, 73.15, 108.8] },
  { id: "t8", name: "Aikštelės Vilkai", manager: "Andrius N.", mono: "AV", color: "sky", shape: "waffle", rounds: [130.7, 73.45, 91.1] },
];

export type Pos = "G" | "F" | "C";

export type Player = {
  id: string;
  first: string;
  last: string;
  pos: Pos;
  club: string;
  avg: number;
  last5: number[];
  night?: number;
  status?: "out" | "doubtful";
  owner?: string;
  pick?: number;
};

export const PLAYERS: Player[] = [
  { id: "p1", first: "Rimas", last: "Pavyzdys", pos: "G", club: "ZAL", avg: 18.4, last5: [14, 22, 17, 25, 19], night: 23.1, owner: "t1", pick: 8 },
  { id: "p2", first: "Marco", last: "Esempio", pos: "G", club: "OLY", avg: 14.9, last5: [11, 9, 18, 16, 20], night: 8.8, owner: "t1", pick: 25 },
  { id: "p3", first: "Luka", last: "Primjer", pos: "F", club: "PAR", avg: 21.3, last5: [24, 19, 26, 22, 20], night: 20.9, owner: "t1", pick: 9 },
  { id: "p4", first: "Nikos", last: "Paradeigma", pos: "F", club: "PAN", avg: 12.2, last5: [8, 14, 10, 15, 9], night: 7.7, owner: "t1", pick: 41 },
  { id: "p5", first: "Mehmet", last: "Örnek", pos: "C", club: "ULK", avg: 16.7, last5: [15, 18, 21, 12, 17], night: 14.0, owner: "t1", pick: 24 },
  { id: "p6", first: "Diego", last: "Ejemplo", pos: "G", club: "MAD", avg: 11.1, last5: [7, 12, 9, 14, 13], night: 3.0, owner: "t1", pick: 56 },
  { id: "p7", first: "Jean", last: "Exemple", pos: "F", club: "ASV", avg: 13.8, last5: [16, 12, 11, 17, 15], night: 15.4, owner: "t1", pick: 57 },
  { id: "p8", first: "Pau", last: "Mostra", pos: "C", club: "BAR", avg: 10.4, last5: [12, 8, 9, 11, 10], owner: "t1", pick: 72, status: "doubtful" },
  { id: "p9", first: "Nik", last: "Beispiel", pos: "F", club: "MUN", avg: 9.6, last5: [6, 11, 8, 12, 10], night: 14.3, owner: "t1", pick: 73 },
  { id: "p10", first: "Ivan", last: "Primer", pos: "G", club: "PRS", avg: 8.9, last5: [9, 7, 10, 8, 11], owner: "t1", pick: 88, status: "out" },
  { id: "p11", first: "Kęstas", last: "Maketas", pos: "C", club: "ZAL", avg: 9.2, last5: [10, 9, 7, 11, 8], night: 7.7, owner: "t1", pick: 89 },
  { id: "p12", first: "Ben", last: "Sample", pos: "G", club: "DUB", avg: 7.8, last5: [5, 9, 8, 6, 10], owner: "t1", pick: 104 },
  { id: "p13", first: "Juan", last: "Muestra", pos: "F", club: "BAS", avg: 8.1, last5: [7, 8, 10, 6, 9], owner: "t1", pick: 97 },
  { id: "p14", first: "Aras", last: "Bandymas", pos: "F", club: "RED", avg: 24.6, last5: [28, 21, 30, 19, 27], night: 57.2, owner: "t5", pick: 1 },
  { id: "p15", first: "Tadas", last: "Šablonas", pos: "C", club: "HTA", avg: 19.9, last5: [18, 24, 16, 22, 21], owner: "t2", pick: 2 },
  { id: "p16", first: "Hugo", last: "Muster", pos: "G", club: "MIL", avg: 15.2, last5: [12, 17, 19, 13, 16], owner: "t3", pick: 3 },
  { id: "p17", first: "Oskar", last: "Przykład", pos: "G", club: "VIR", avg: 13.3, last5: [15, 12, 16, 11, 14], pick: undefined },
  { id: "p18", first: "Emre", last: "Taslak", pos: "F", club: "IST", avg: 12.7, last5: [10, 14, 15, 12, 13] },
  { id: "p19", first: "Dino", last: "Uzorak", pos: "C", club: "PAM", avg: 11.9, last5: [13, 12, 9, 14, 12] },
];

export const YOU = TEAMS[0];

export function teamById(id: string | undefined): Team | undefined {
  return TEAMS.find((team) => team.id === id);
}

export function total(team: Team): number {
  return team.rounds.reduce((sum, value) => sum + value, 0);
}

/** Table order after `upTo` rounds, with each team's rank the round before. */
export function table(upTo = 3) {
  const rankAfter = (rounds: number) =>
    [...TEAMS]
      .map((team) => ({ team, sum: team.rounds.slice(0, rounds).reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.sum - a.sum)
      .map((row, index) => ({ ...row, rank: index + 1 }));
  const now = rankAfter(upTo);
  const before = rankAfter(upTo - 1);
  return now.map((row) => ({
    ...row,
    last: row.team.rounds[upTo - 1],
    moved: (before.find((b) => b.team.id === row.team.id)?.rank ?? row.rank) - row.rank,
    gap: now[0].sum - row.sum,
  }));
}

export const FIXTURES = [
  { home: "ZAL", away: "OLY", hs: 91, as: 93, state: "final" as const, time: "19:00" },
  { home: "PAR", away: "PAN", hs: 72, as: 70, state: "live" as const, time: "Q4 3:41" },
  { home: "ULK", away: "MUN", hs: 100, as: 76, state: "final" as const, time: "19:45" },
  { home: "MAD", away: "IST", hs: 58, as: 61, state: "live" as const, time: "Q3 0:12" },
  { home: "ASV", away: "BAR", hs: 0, as: 0, state: "scheduled" as const, time: "21:30" },
  { home: "PRS", away: "RED", hs: 0, as: 0, state: "scheduled" as const, time: "21:45" },
];

export const DEALS = [
  { round: 3, team: "t2", out: ["p17"], in: ["p18"], delta: 14.3, kind: "trade" as const, with: "t4" },
  { round: 3, team: "t6", out: ["p19"], in: ["p16"], delta: -6.1, kind: "trade" as const, with: "t3" },
  { round: 2, team: "t1", out: ["p12"], in: ["p13"], delta: 3.4, kind: "free" as const },
  { round: 2, team: "t7", out: ["p4"], in: ["p9"], delta: -2.2, kind: "free" as const },
];
