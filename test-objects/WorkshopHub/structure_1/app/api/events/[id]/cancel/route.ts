import type { NextRequest } from "next/server";

import { AUTH_COOKIE_NAME, AuthService } from "@/lib/auth";
import { forbidden, notFound, unauthorized } from "@/lib/http";
import { cancelEvent } from "@/lib/store";

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
  const result = cancelEvent(id, user.id);
  if (result.notFound) {
    return notFound("Event was not found.");
  }
  if (result.forbidden) {
    return forbidden();
  }

  return Response.json({ event: result.event });
}
