import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import {
  createUser,
  createUserSession,
  deleteSessionByTokenHash,
  getUserBySessionTokenHash,
  getUserCredentialsByEmail,
} from "@/lib/store";
import { requiredMessages, validateAuthLogin } from "@/lib/validation";
import type { AuthLoginInput, AuthRegisterInput, User } from "@/types/domain";

export const AUTH_COOKIE_NAME = "workshophub_session";
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;

const passwordAlgorithm = "scrypt:16384:8:1:64";

export class PasswordHasher {
  hashPassword(password: string): { hash: string; salt: string; algorithm: string } {
    const salt = randomBytes(16).toString("hex");
    return {
      hash: this.hashWithSalt(password, salt),
      salt,
      algorithm: passwordAlgorithm,
    };
  }

  verifyPassword(password: string, salt: string, expectedHash: string): boolean {
    const actualHash = this.hashWithSalt(password, salt);
    const actual = Buffer.from(actualHash, "hex");
    const expected = Buffer.from(expectedHash, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private hashWithSalt(password: string, salt: string): string {
    return scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  }
}

export class AuthService {
  private readonly passwordHasher = new PasswordHasher();

  register(input: AuthRegisterInput): { user?: User; sessionToken?: string; errors?: Record<string, string> } {
    const password = this.passwordHasher.hashPassword(input.password);
    const result = createUser(input, password.hash, password.salt, password.algorithm);
    if (result.errors || !result.user) {
      return { errors: result.errors ?? { request: "Registration could not be completed." } };
    }

    return this.createSession(result.user);
  }

  login(input: AuthLoginInput): { user?: User; sessionToken?: string; errors?: Record<string, string> } {
    const validation = validateAuthLogin(input);
    if (!validation.valid) {
      return { errors: validation.errors };
    }

    const user = getUserCredentialsByEmail(input.email);
    if (!user || !this.passwordHasher.verifyPassword(input.password, user.passwordSalt, user.passwordHash)) {
      return { errors: { credentials: requiredMessages.credentials } };
    }

    return this.createSession(user);
  }

  getUserBySessionToken(sessionToken: string | undefined): User | null {
    if (!sessionToken) return null;
    return getUserBySessionTokenHash(this.hashSessionToken(sessionToken), new Date().toISOString());
  }

  logout(sessionToken: string | undefined): void {
    if (!sessionToken) return;
    deleteSessionByTokenHash(this.hashSessionToken(sessionToken));
  }

  private createSession(user: User): { user: User; sessionToken: string } {
    const sessionToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + AUTH_COOKIE_MAX_AGE_SECONDS * 1000).toISOString();
    createUserSession(user.id, this.hashSessionToken(sessionToken), expiresAt);
    return { user, sessionToken };
  }

  private hashSessionToken(sessionToken: string): string {
    return createHash("sha256").update(sessionToken).digest("hex");
  }
}
