import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEDIA_ROOT = "/srv/eurovafliai-media";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ season: string; kind: string; code: string }> },
): Promise<Response> {
  const { season, kind, code } = await params;
  if (
    season !== "E2026" ||
    (kind !== "players" && kind !== "clubs") ||
    !/^[A-Za-z0-9]{2,12}\.(?:png|webp)$/.test(code) ||
    !code.endsWith(kind === "players" ? ".webp" : ".png")
  ) {
    return new Response(null, { status: 404 });
  }

  try {
    const data = await readFile(path.join(MEDIA_ROOT, season, kind, code));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": kind === "players" ? "image/webp" : "image/png",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return new Response(null, { status: 404 });
    }
    throw error;
  }
}
