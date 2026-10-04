import { getSession } from "@/lib/auth/session";
import { readPlayerProfile } from "@/lib/stats/queries";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await getSession())) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!/^[A-Za-z0-9]{15}$/.test(id)) return new Response(null, { status: 404 });
  const query = new URL(request.url).searchParams;
  const round = Number(query.get("round"));
  const profile = await readPlayerProfile(id, {
    ...(Number.isInteger(round) && round > 0 ? { round } : {}),
    basketNews: query.get("basketnews") === "1",
  });
  return profile
    ? Response.json(profile, { headers: { "Cache-Control": "private, no-store" } })
    : new Response(null, { status: 404 });
}
