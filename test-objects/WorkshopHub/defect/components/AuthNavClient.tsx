"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { User } from "@/types/domain";

interface MeResponse {
  user: User | null;
}

const protectedNavLinks = [
  { href: "/registrations", label: "My Registrations" },
  { href: "/admin/events", label: "My Workshops" },
  { href: "/feedback", label: "Feedback" },
];

export default function AuthNavClient() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      setLoading(true);
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as MeResponse;
        setUser(data.user);
      } else {
        setUser(null);
      }
      setLoading(false);
    }
    void loadUser();
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <nav className="flex items-center gap-1">
        <Link
          href="/events"
          className="rounded-lg px-3.5 py-2 text-sm font-medium text-primary-foreground/75 no-underline transition-colors hover:bg-white/15 hover:text-primary-foreground"
        >
          Events
        </Link>
        {user && protectedNavLinks.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-primary-foreground/75 no-underline transition-colors hover:bg-white/15 hover:text-primary-foreground"
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="h-6 w-px bg-primary-foreground/20" aria-hidden />
      {loading ? (
        <span className="px-3 py-2 text-sm text-primary-foreground/70">Checking session…</span>
      ) : user ? (
        <div className="flex items-center gap-2">
          <span className="hidden max-w-40 truncate text-sm font-medium text-primary-foreground/80 sm:inline">
            {user.fullName}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-primary-foreground/75 hover:bg-white/15 hover:text-primary-foreground"
            onClick={logout}
          >
            Log out
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="text-primary-foreground/75 hover:bg-white/15 hover:text-primary-foreground">
            <Link href="/login">Log In</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/register">Register</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
