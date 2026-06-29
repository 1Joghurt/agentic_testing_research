import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE_MAX_AGE_SECONDS, AUTH_COOKIE_NAME, AuthService } from "@/lib/auth";
import { readJson, validationError } from "@/lib/http";
import type { AuthLoginInput } from "@/types/domain";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  const input = await readJson<AuthLoginInput>(request);
  if (!input) {
    return validationError({ request: "Request body must be valid JSON." });
  }

  const result = new AuthService().login(input);
  if (result.errors || !result.user || !result.sessionToken) {
    return validationError(result.errors ?? { request: "Login could not be completed." });
  }

  const response = NextResponse.json({ user: result.user });
  response.cookies.set(AUTH_COOKIE_NAME, result.sessionToken, {
    httpOnly: true,
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
    sameSite: "lax",
    secure: false,
    path: "/",
  });
  return response;
}
