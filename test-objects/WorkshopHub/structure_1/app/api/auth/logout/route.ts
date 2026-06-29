import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE_NAME, AuthService } from "@/lib/auth";

export const runtime = "nodejs";

export function POST(request: NextRequest): Response {
  const sessionToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  new AuthService().logout(sessionToken);

  const response = NextResponse.json({ message: "Logged out." });
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}
