import type { NextRequest } from "next/server";

import { AUTH_COOKIE_NAME, AuthService } from "@/lib/auth";
import { forbidden, notFound, readJson, unauthorized, validationError } from "@/lib/http";
import { getEventById, updateEvent } from "@/lib/store";
import type { EventInput } from "@/types/domain";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const user = getCurrentUser(request);
  if (!user) {
    return unauthorized();
  }

  const { id } = await context.params;
  const event = getEventById(id);
  if (!event) {
    return notFound("Event was not found.");
  }

  return Response.json({ event });
}

function getCurrentUser(request: NextRequest) {
  return new AuthService().getUserBySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
}

export async function PUT(request: NextRequest, context: RouteContext): Promise<Response> {
  const user = getCurrentUser(request);
  if (!user) {
    return unauthorized();
  }

  const { id } = await context.params;
  const input = await readJson<EventInput>(request);
  if (!input) {
    return validationError({ request: "Request body must be valid JSON." });
  }

  const result = updateEvent(id, input, user.id);
  if (result.notFound) {
    return notFound("Event was not found.");
  }
  if (result.forbidden) {
    return forbidden();
  }
  if (result.errors) {
    return validationError(result.errors);
  }

  return Response.json({ event: result.event });
}
