import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_COOKIE_NAME, AuthService } from "@/lib/auth";
import type { User } from "@/types/domain";

export async function requireAuthenticatedUser(): Promise<User> {
  const cookieStore = await cookies();
  const user = new AuthService().getUserBySessionToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  if (!user) {
    redirect("/login");
  }

  return user;
}
