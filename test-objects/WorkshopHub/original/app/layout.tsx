import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import AuthNavClient from "@/components/AuthNavClient";
import SuccessBannerClient from "@/components/SuccessBannerClient";
import "./globals.css";

export const metadata: Metadata = {
  title: "WorkshopHub",
  description: "Deterministic workshop and event management test application.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background antialiased">
        <header className="sticky top-0 z-50 border-b border-primary/30 bg-primary shadow-md">
          <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-6 lg:px-10">
            <Link
              href="/events"
              className="flex items-center gap-2 text-primary-foreground no-underline hover:opacity-90 transition-opacity"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-sm font-black tracking-tight">
                W
              </span>
              <span className="text-base font-bold tracking-tight">WorkshopHub</span>
            </Link>
            <AuthNavClient />
          </div>
        </header>
        <main className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-10">
          <Suspense fallback={null}>
            <SuccessBannerClient />
          </Suspense>
          {children}
        </main>
      </body>
    </html>
  );
}
