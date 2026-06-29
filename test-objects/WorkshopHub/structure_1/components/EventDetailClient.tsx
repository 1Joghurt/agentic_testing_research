"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Calendar, MapPin, Tag, User as UserIcon, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RegistrationWithEvent, User, WorkshopEventWithSeats } from "@/types/domain";

interface EventResponse {
  event: WorkshopEventWithSeats;
}

interface RegistrationsResponse {
  registrations: RegistrationWithEvent[];
}

interface MeResponse {
  user: User | null;
}

function StatusBadge({ status }: { status: string }) {
  const isOpen = status === "Open";
  const isFew = status === "Few seats left";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold",
        isOpen && "bg-emerald-100 text-emerald-700",
        isFew && "bg-amber-100 text-amber-700",
        !isOpen && !isFew && "bg-red-100 text-red-700",
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          isOpen && "bg-emerald-500",
          isFew && "bg-amber-500",
          !isOpen && !isFew && "bg-red-500",
        )}
      />
      {status}
    </span>
  );
}

export default function EventDetailClient({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<WorkshopEventWithSeats | null>(null);
  const [activeRegistration, setActiveRegistration] = useState<RegistrationWithEvent | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadEvent() {
      setLoading(true);
      setError("");
      const [eventResponse, meResponse] = await Promise.all([
        fetch(`/api/events/${eventId}`, { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);
      if (!eventResponse.ok) {
        setError("Event was not found.");
        setLoading(false);
        return;
      }
      const data = (await eventResponse.json()) as EventResponse;
      setEvent(data.event);
      if (meResponse.ok) {
        const meData = (await meResponse.json()) as MeResponse;
        setCurrentUser(meData.user);
        if (meData.user) {
          const registrationsResponse = await fetch("/api/registrations", { cache: "no-store" });
          if (registrationsResponse.ok) {
            const registrationsData = (await registrationsResponse.json()) as RegistrationsResponse;
            setActiveRegistration(
              registrationsData.registrations.find(
                (registration) => registration.eventId === eventId && registration.status === "active",
              ) ?? null,
            );
          } else {
            setActiveRegistration(null);
          }
        } else {
          setActiveRegistration(null);
        }
      } else {
        setCurrentUser(null);
        setActiveRegistration(null);
      }
      setLoading(false);
    }
    void loadEvent();
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12 text-muted-foreground">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-sm">Loading event details…</span>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error || "Event was not found."}
      </div>
    );
  }

  const ownsEvent = event.ownerId === currentUser?.id;
  const registrationBlocked = ownsEvent || event.status !== "active" || event.remainingSeats <= 0;

  return (
    <>
      <div className="mb-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground hover:text-foreground">
          <Link href="/events">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to events
          </Link>
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap items-start gap-3">
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{event.title}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground leading-relaxed">{event.description}</p>
        </div>
        <div className="mt-1">
          <StatusBadge status={event.seatStatus} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Meta card */}
        <div className="lg:col-span-2 rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Event details
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">Date &amp; Time</p>
                <p className="text-sm font-medium text-foreground">{event.date} at {event.time}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">Location</p>
                <p className="text-sm font-medium text-foreground">{event.location}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <UserIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">Speaker / Organizer</p>
                <p className="text-sm font-medium text-foreground">{event.speaker}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Tag className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">Category</p>
                <p className="text-sm font-medium text-foreground">{event.category}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Seats card */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Availability
          </h2>
          <div className="flex items-center gap-3 mb-4">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold text-foreground">{event.remainingSeats}</p>
              <p className="text-xs text-muted-foreground">of {event.capacity} seats remaining</p>
            </div>
          </div>

          {/* Seats progress bar */}
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${Math.max(0, Math.min(100, (event.remainingSeats / event.capacity) * 100))}%`,
              }}
            />
          </div>

          {ownsEvent ? (
            <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm text-primary">
              <p className="font-medium">This is your workshop.</p>
              <p className="mt-1 text-xs">You cannot register for workshops you organize.</p>
              <Button asChild variant="outline" size="sm" className="mt-3 w-full bg-white/70">
                <Link href={`/admin/events/${event.id}/edit`}>Manage workshop</Link>
              </Button>
            </div>
          ) : activeRegistration ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
              <p className="font-medium">You are already registered for this event.</p>
              <Button asChild variant="outline" size="sm" className="mt-3 w-full border-emerald-300 bg-white/70">
                <Link href={`/registrations/${activeRegistration.id}/edit?returnTo=/events/${event.id}`}>
                  Edit registration
                </Link>
              </Button>
            </div>
          ) : registrationBlocked ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              Registration is not available for this event.
            </div>
          ) : (
            <Button asChild className="mt-4 w-full">
              <Link href={`/events/${event.id}/register`}>Register for this event</Link>
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
