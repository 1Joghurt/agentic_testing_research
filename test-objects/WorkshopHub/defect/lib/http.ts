export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function validationError(errors: Record<string, string>): Response {
  return Response.json({ message: "Validation failed.", errors }, { status: 400 });
}

export function notFound(message: string): Response {
  return Response.json({ message }, { status: 404 });
}

export function unauthorized(message = "You must be logged in."): Response {
  return Response.json({ message, errors: { auth: message } }, { status: 401 });
}

export function forbidden(message = "You can only manage your own events."): Response {
  return Response.json({ message, errors: { auth: message } }, { status: 403 });
}
