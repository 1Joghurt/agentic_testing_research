import type { NextRequest } from "next/server";

import { AUTH_COOKIE_NAME, AuthService } from "@/lib/auth";
import { readJson, unauthorized, validationError } from "@/lib/http";
import { createRegistration, listRegistrationsByOwner } from "@/lib/store";
import type { RegistrationInput } from "@/types/domain";

export const runtime = "nodejs";

function getCurrentUser(request: NextRequest) {
  return new AuthService().getUserBySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
}

export function GET(request: NextRequest): Response {
  const user = getCurrentUser(request);
  if (!user) {
    return unauthorized();
  }

  return Response.json({ registrations: listRegistrationsByOwner(user.id) });
}

export async function POST(request: NextRequest): Promise<Response> {
  const user = getCurrentUser(request);
  if (!user) {
    return unauthorized();
  }

  const input = await readJson<RegistrationInput>(request);
  if (!input) {
    return validationError({ request: "Request body must be valid JSON." });
  }

  const result = createRegistration(input, user);
  if (result.errors) {
    return validationError(result.errors);
  }

  return Response.json({ registration: result.registration, event: result.event }, { status: 201 });
}
