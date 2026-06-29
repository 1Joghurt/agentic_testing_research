import type { NextRequest } from "next/server";

import { AUTH_COOKIE_NAME, AuthService } from "@/lib/auth";
import { notFound, readJson, unauthorized, validationError } from "@/lib/http";
import { getEventById, getRegistrationById, updateRegistration } from "@/lib/store";
import type { RegistrationInput } from "@/types/domain";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function getCurrentUser(request: NextRequest) {
  return new AuthService().getUserBySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const user = getCurrentUser(request);
  if (!user) {
    return unauthorized();
  }

  const { id } = await context.params;
  const registration = getRegistrationById(id, user.id);
  if (!registration) {
    return notFound("Registration was not found.");
  }

  const event = getEventById(registration.eventId);
  return Response.json({ registration, event });
}

export async function PUT(request: NextRequest, context: RouteContext): Promise<Response> {
  const user = getCurrentUser(request);
  if (!user) {
    return unauthorized();
  }

  const { id } = await context.params;
  const input = await readJson<RegistrationInput>(request);
  if (!input) {
    return validationError({ request: "Request body must be valid JSON." });
  }

  const result = updateRegistration(id, input, user);
  if (result.notFound) {
    return notFound("Registration was not found.");
  }
  if (result.errors) {
    return validationError(result.errors);
  }

  return Response.json({ registration: result.registration, event: result.event });
}
