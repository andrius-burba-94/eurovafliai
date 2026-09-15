import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { formatTenths } from "@/lib/stats/scoring";

import { FixtureNote, Sparkline } from "./board";

/**
 * The fixture line — and the case where it renders nothing.
 *
 * That case survived 10.7 filling the collection in, and is still the first
 * assertion here: a club knocked out has no next game, no club plays in every
 * playoff round, and a season before its first ingest pass has no schedule at
 * all. A "TBD" in any of those is the app claiming it looked and found no
 * opponent, when the truth is that there is nothing to find.
 *
 * Rendered through `renderToStaticMarkup` rather than a DOM testing library:
 * there is no jsdom in this suite and no reason to add one for a component with
 * no behaviour. `createElement` rather than JSX keeps the file a `.test.ts`, so
 * the Vitest include glob does not have to grow a case for one test.
 */

const render = (props: Parameters<typeof FixtureNote>[0]) =>
  renderToStaticMarkup(createElement(FixtureNote, props));

describe("FixtureNote", () => {
  it("renders nothing at all when there is no fixture", () => {
    expect(render({})).toBe("");
    expect(render({ fixture: null })).toBe("");
  });

  it("says who, and which side of it the club is on", () => {
    expect(render({ fixture: { nextOpponent: "ZAL", atHome: true } })).toContain(
      "vs ZAL",
    );
    expect(render({ fixture: { nextOpponent: "ZAL", atHome: false } })).toContain(
      "at ZAL",
    );
  });

  it("says nothing about the draw when the schedule cannot", () => {
    // An opponent with two games played has a record too thin to describe, and
    // `difficultyOf` returns null for it. The line then names the fixture and
    // stops, rather than calling an unknown draw "even".
    const html = render({ fixture: { nextOpponent: "BAS", atHome: true } });
    expect(html).not.toContain("draw");
  });

  it("says the difficulty as a word", () => {
    const html = render({
      fixture: { nextOpponent: "OLY", atHome: false, difficulty: "hard" },
    });
    expect(html).toContain("Hard draw");
    // Never the marker: it has two jobs already, and a third meaning on a
    // roster is how the marker stops meaning anything.
    expect(html).not.toContain("text-live");
  });
});

const spark = (props: Parameters<typeof Sparkline>[0]) =>
  renderToStaticMarkup(createElement(Sparkline, props));

describe("Sparkline", () => {
  it("draws nothing for fewer than two games", () => {
    expect(spark({ values: [], what: "PIR" })).toBe("");
    expect(spark({ values: [14], what: "PIR" })).toBe("");
  });

  it("hides the marks and says the numbers instead", () => {
    // The whole accessibility argument for this component in one assertion:
    // five marks announced individually are five announcements of nothing, so
    // the picture is hidden and the sentence carries the content.
    const html = spark({ values: [4, 9, 22], what: "PIR" });
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("<polyline");
    expect(html).toContain("4, 9, 22 PIR");
    expect(html).toContain("trending up");
  });

  it("speaks tenths the way the row beside it prints them", () => {
    // Without the formatter a standings sparkline says "120" where the run of
    // rounds above it shows "12.0" — one fact, two numbers, and the spoken one
    // wrong by a factor of ten.
    const html = spark({
      values: [120, 85, 40],
      what: "points",
      format: formatTenths,
    });
    expect(html).toContain("12.0, 8.5, 4.0 points");
    expect(html).not.toContain("120, 85, 40");
  });

  it("lets the caller own the display utility", () => {
    // A hardcoded `inline-flex` here plus a caller's `hidden sm:inline-flex` is
    // two utilities setting one property, and Tailwind v4 emits them
    // alphabetically rather than in source order — the failure `slot-transit`
    // already paid for.
    const html = spark({
      values: [1, 2],
      what: "PIR",
      className: "hidden sm:inline-flex",
    });
    expect(html).toContain("hidden sm:inline-flex");
    expect(html).not.toContain("inline-flex items-center");
  });
});
