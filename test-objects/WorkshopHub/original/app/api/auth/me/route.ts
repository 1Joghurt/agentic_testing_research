import type { NextRequest } from "next/server";

import { AUTH_COOKIE_NAME, AuthService } from "@/lib/auth";

export const runtime = "nodejs";

export function GET(request: NextRequest): Response {
  const user = new AuthService().getUserBySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
  return Response.json({ user });
}
