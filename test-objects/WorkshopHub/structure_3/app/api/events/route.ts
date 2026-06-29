import type { NextRequest } from "next/server";

import { AUTH_COOKIE_NAME, AuthService } from "@/lib/auth";
import { createEvent, listEvents, listEventsByOwner } from "@/lib/store";
import { readJson, unauthorized, validationError } from "@/lib/http";
import type { EventInput } from "@/types/domain";

export const runtime = "nodejs";

function getCurrentUser(request: NextRequest) {
  return new AuthService().getUserBySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
}

export function GET(request: NextRequest): Response {
  if (request.nextUrl.searchParams.get("owner") === "me") {
    const user = getCurrentUser(request);
    if (!user) {
      return unauthorized();
    }
    return Response.json({ events: listEventsByOwner(user.id) });
  }

  return Response.json({ events: listEvents() });
}

export async function POST(request: NextRequest): Promise<Response> {
  const user = getCurrentUser(request);
  if (!user) {
    return unauthorized();
  }

  const input = await readJson<EventInput>(request);
  if (!input) {
    return validationError({ request: "Request body must be valid JSON." });
  }

  const result = createEvent(input, user.id);
  if (result.errors) {
    return validationError(result.errors);
  }

  return Response.json({ event: result.event }, { status: 201 });
}
