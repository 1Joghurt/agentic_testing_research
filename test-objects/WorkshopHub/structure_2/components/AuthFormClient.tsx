"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { withSuccessBanner } from "@/lib/success-banner";
import { validateAuthLogin, validateAuthRegistration } from "@/lib/validation";
import type { AuthLoginInput, AuthRegisterInput, User } from "@/types/domain";

interface AuthResponse {
  user?: User;
  errors?: Record<string, string>;
}

interface AuthFormClientProps {
  mode: "login" | "register";
}

const emptyRegisterInput: AuthRegisterInput = {
  fullName: "",
  email: "",
  password: "",
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

export default function AuthFormClient({ mode }: AuthFormClientProps) {
  const router = useRouter();
  const [input, setInput] = useState<AuthRegisterInput>(emptyRegisterInput);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const isRegistering = mode === "register";

  function clearFieldError(field: string) {
    setErrors((currentErrors) => {
      if (!currentErrors[field]) return currentErrors;
      return Object.fromEntries(
        Object.entries(currentErrors).filter(([errorField]) => errorField !== field),
      );
    });
  }

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const loginInput: AuthLoginInput = {
      email: input.email,
      password: input.password,
    };
    const validation = isRegistering
      ? validateAuthRegistration(input)
      : validateAuthLogin(loginInput);
    setErrors(validation.errors);
    if (!validation.valid) return;

    setSubmitting(true);
    const response = await fetch(isRegistering ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isRegistering ? input : loginInput),
    });
    const data = (await response.json()) as AuthResponse;
    setSubmitting(false);

    if (!response.ok) {
      setErrors(data.errors ?? { request: "Authentication could not be completed." });
      return;
    }

    router.push(withSuccessBanner("/events", isRegistering ? "registration-completed" : "login-completed"));
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {isRegistering ? "Register" : "Log In"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {isRegistering
            ? "Create a local WorkshopHub account to manage your own events."
            : "Use your WorkshopHub account to continue."}
        </p>
      </div>

      {errors.request && (
        <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errors.request}
        </div>
      )}
      {errors.credentials && (
        <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errors.credentials}
        </div>
      )}

      <form className="rounded-xl border bg-card p-6 shadow-sm" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-5">
          {isRegistering && (
            <div className="space-y-1.5">
              <Label htmlFor="full-name">Full name</Label>
              <Input
                id="full-name"
                value={input.fullName}
                onChange={(event) => {
                  setInput({ ...input, fullName: event.target.value });
                  clearFieldError("fullName");
                }}
                aria-describedby={errors.fullName ? "full-name-error" : undefined}
              />
              <FieldError id="full-name-error" message={errors.fullName} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              value={input.email}
              onChange={(event) => {
                setInput({ ...input, email: event.target.value });
                clearFieldError("email");
              }}
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            <FieldError id="email-error" message={errors.email} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={input.password}
              onChange={(event) => {
                setInput({ ...input, password: event.target.value });
                clearFieldError("password");
              }}
              aria-describedby={errors.password ? "password-error" : undefined}
            />
            <FieldError id="password-error" message={errors.password} />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-5">
          <Button type="submit" disabled={submitting}>
            {submitting
              ? isRegistering
                ? "Creating…"
                : "Logging in…"
              : isRegistering
                ? "Register"
                : "Log In"}
          </Button>
          <Button asChild variant="outline">
            <Link href="/events">Cancel</Link>
          </Button>
        </div>
      </form>

      <p className="mt-5 text-sm text-muted-foreground">
        {isRegistering ? "Already have an account?" : "Need an account?"}{" "}
        <Link
          href={isRegistering ? "/login" : "/register"}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {isRegistering ? "Log In" : "Register"}
        </Link>
      </p>
    </div>
  );
}
