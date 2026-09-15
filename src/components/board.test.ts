import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FixtureNote } from "./board";

/**
 * The fixture line, which today renders nothing.
 *
 * Worth a test precisely *because* it renders nothing: an affordance that is
 * waiting for data is one refactor away from being deleted as dead, and one
 * careless edit away from shipping a "TBD" placeholder — which would be this
 * app claiming it looked at the schedule and found no opponent, when the truth
 * is that `ingest.ts` throws every unplayed game away and it has never looked.
 * These three cases are the contract PR 7 has to satisfy.
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

  it("names the opponent when there is one", () => {
    const html = render({
      fixture: { nextOpponent: "Žalgiris", doubleRound: false },
    });
    expect(html).toContain("Žalgiris");
    expect(html).not.toContain("Double round");
  });

  it("says double round in words, not in a colour", () => {
    // The Letter-Always Rule, and the one signal here that changes who somebody
    // starts — so it is the last thing that should need a legend to decode.
    const html = render({
      fixture: { nextOpponent: "Baskonia", doubleRound: true },
    });
    expect(html).toContain("Double round");
  });
});
