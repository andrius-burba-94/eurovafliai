import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { leagueHref, teamHref } from "@/lib/nav/urls";
import { createUserClient } from "@/lib/pb/server";

/**
 * The addresses before S28 — /leagues/<id>/…, with a team at
 * /leagues/<id>/teams/<memberId> — permanently moved to /l/<league>/…. Links
 * already pasted into the league's chat and bookmarks keep working. The
 * league is read with the viewer's token, so a league they cannot see is a
 * 404 here exactly as it is on the page.
 */
export async function GET(request: NextRequest, context: RouteContext<"/leagues/[...rest]">): Promise<Response> {
  const [leagueId, ...rest] = (await context.params).rest;
  const session = await getSession();
  if (!session || !leagueId) return new NextResponse("Not found", { status: 404 });

  const pb = createUserClient(session.token);
  let league: { id: string; slug?: string };
  try {
    league = await pb
      .collection("leagues")
      .getFirstListItem(pb.filter("id = {:ref} || slug = {:ref}", { ref: leagueId }), { fields: "id,slug", requestKey: null });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  let path = leagueHref(league, ...rest);
  if (rest[0] === "teams" && rest[1]) {
    const member = await pb
      .collection("league_members")
      .getFirstListItem<{ id: string; slug?: string }>(pb.filter("league = {:league} && (id = {:ref} || slug = {:ref})", { league: league.id, ref: rest[1] }), {
        fields: "id,slug",
        requestKey: null,
      })
      .catch(() => ({ id: rest[1]!, slug: "" }));
    path = teamHref(league, member);
  }

  const target = new URL(path, request.url);
  target.search = request.nextUrl.search;
  return NextResponse.redirect(target, 308);
}
