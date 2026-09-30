import {
  Archivo,
  Barlow_Condensed,
  Big_Shoulders,
  Saira_Extra_Condensed,
} from "next/font/google";

/*
 * The four display candidates the gallery compares. Every one of them ships
 * `latin-ext`, checked against Next's font metadata, because a scoreboard face
 * that falls back mid-word on "Fūros" is disqualified before taste comes in.
 * Loaded only by the concepts route, so no production page pays for them.
 */
export const barlow = Barlow_Condensed({
  variable: "--cx-font-barlow",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export const saira = Saira_Extra_Condensed({
  variable: "--cx-font-saira",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export const shoulders = Big_Shoulders({
  variable: "--cx-font-shoulders",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const archivo = Archivo({
  variable: "--cx-font-archivo",
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  display: "swap",
});
