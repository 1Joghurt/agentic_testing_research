import type { NextRequest } from "next/server";

import { AUTH_COOKIE_NAME, AuthService } from "@/lib/auth";
import { notFound, unauthorized } from "@/lib/http";
import { cancelRegistration } from "@/lib/store";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function getCurrentUser(request: NextRequest) {
  return new AuthService().getUserBySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  const user = getCurrentUser(request);
  if (!user) {
    return unauthorized();
  }

  const { id } = await context.params;
  const result = cancelRegistration(id, user.id);
  if (result.notFound) {
    return notFound("Registration was not found.");
  }

  return Response.json({ registration: result.registration, event: result.event });
}
