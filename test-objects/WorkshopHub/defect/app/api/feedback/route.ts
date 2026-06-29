import type { NextRequest } from "next/server";

import { AUTH_COOKIE_NAME, AuthService } from "@/lib/auth";
import { notFound, readJson, unauthorized, validationError } from "@/lib/http";
import { createFeedback, listFeedbackByEventOwner } from "@/lib/store";
import type { FeedbackInput } from "@/types/domain";

export const runtime = "nodejs";

function getCurrentUser(request: NextRequest) {
  return new AuthService().getUserBySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
}

export function GET(request: NextRequest): Response {
  const user = getCurrentUser(request);
  if (!user) {
    return unauthorized();
  }

  return Response.json({ feedback: listFeedbackByEventOwner(user.id) });
}

export async function POST(request: NextRequest): Promise<Response> {
  const user = getCurrentUser(request);
  if (!user) {
    return unauthorized();
  }

  const input = await readJson<FeedbackInput>(request);
  if (!input) {
    return validationError({ request: "Request body must be valid JSON." });
  }

  const result = createFeedback(input, user.id);
  if (result.notFound) {
    return notFound("Event was not found.");
  }
  if (result.errors) {
    return validationError(result.errors);
  }

  return Response.json({ feedback: result.feedback }, { status: 201 });
}
