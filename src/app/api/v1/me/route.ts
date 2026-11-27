import { ok, withSession } from "@/lib/api/http";

export function GET(): Promise<Response> {
  return withSession(async ({ user }) => ok({ id: user.id, name: user.name, email: user.email }));
}
