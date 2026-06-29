"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Calendar, MapPin, Search, Users } from "lucide-react";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { RegistrationWithEvent, User, WorkshopEventWithSeats } from "@/types/domain";

interface EventsResponse {
  events: WorkshopEventWithSeats[];
}

interface RegistrationsResponse {
  registrations: RegistrationWithEvent[];
}

interface MeResponse {
  user: User | null;
}

function StatusPill({ status }: { status: string }) {
  const isOpen = status === "Open";
  const isFew = status === "Few seats left";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        isOpen && "bg-emerald-100 text-emerald-700",
        isFew && "bg-amber-100 text-amber-700",
        !isOpen && !isFew && "bg-red-100 text-red-700",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          isOpen && "bg-emerald-500",
          isFew && "bg-amber-500",
          !isOpen && !isFew && "bg-red-500",
        )}
      />
      {status}
    </span>
  );
}

export default function EventListClient() {
  const [events, setEvents] = useState<WorkshopEventWithSeats[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationWithEvent[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "success">("error");
  const [registrationToCancelId, setRegistrationToCancelId] = useState("");
  const [cancellingRegistrationId, setCancellingRegistrationId] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [location, setLocation] = useState("all");
  const [sortBy, setSortBy] = useState<"date" | "title">("date");

  async function loadOverview() {
    setLoading(true);
    setMessage("");
    try {
      const [eventsResponse, meResponse] = await Promise.all([
        fetch("/api/events", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);
      if (!eventsResponse.ok) {
        throw new Error("Events could not be loaded.");
      }
      const eventsData = (await eventsResponse.json()) as EventsResponse;
      setEvents(eventsData.events);
      if (meResponse.ok) {
        const meData = (await meResponse.json()) as MeResponse;
        setCurrentUser(meData.user);
        if (meData.user) {
          const registrationsResponse = await fetch("/api/registrations", { cache: "no-store" });
          if (!registrationsResponse.ok) {
            throw new Error("Events could not be loaded.");
          }
          const registrationsData = (await registrationsResponse.json()) as RegistrationsResponse;
          setRegistrations(registrationsData.registrations);
        } else {
          setRegistrations([]);
        }
      } else {
        setCurrentUser(null);
        setRegistrations([]);
      }
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Events could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(events.map((e) => e.category))).sort(),
    [events],
  );
  const locations = useMemo(
    () => Array.from(new Set(events.map((e) => e.location))).sort(),
    [events],
  );

  const visibleEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events
      .filter((event) => {
        const matchesQuery =
          !query ||
          event.title.toLowerCase().includes(query) ||
          event.description.toLowerCase().includes(query) ||
          event.speaker.toLowerCase().includes(query);
        const matchesCategory = category === "all" || event.category === category;
        const matchesLocation = location === "all" || event.location === location;
        return matchesQuery && matchesCategory && matchesLocation;
      })
      .sort((l, r) => {
        if (sortBy === "title") return l.title.localeCompare(r.title);
        return `${l.date} ${l.time}`.localeCompare(`${r.date} ${r.time}`);
      });
  }, [category, events, location, search, sortBy]);

  const activeRegistrationByEvent = useMemo(() => {
    const byEvent = new Map<string, RegistrationWithEvent>();
    for (const registration of registrations) {
      if (registration.status === "active" && !byEvent.has(registration.eventId)) {
        byEvent.set(registration.eventId, registration);
      }
    }
    return byEvent;
  }, [registrations]);

  const currentUserId = currentUser?.id;
  const visiblePublicEvents = useMemo(
    () => visibleEvents.filter((event) => !currentUserId || event.ownerId !== currentUserId),
    [currentUserId, visibleEvents],
  );
  const visibleOwnEvents = useMemo(
    () => visibleEvents.filter((event) => event.ownerId === currentUserId),
    [currentUserId, visibleEvents],
  );

  function renderEventCard(event: WorkshopEventWithSeats, isOwnWorkshop: boolean) {
    const activeRegistration = activeRegistrationByEvent.get(event.id);
    const registrationAvailable = event.status === "active" && event.remainingSeats > 0;
    return (
      <article
        key={event.id}
        className="relative flex flex-col rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
      >
        <Link
          href={`/events/${event.id}`}
          className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`View details for ${event.title}`}
        />

        <div className="pointer-events-none relative z-20 flex items-start justify-between gap-2 px-4 pt-4 pb-2">
          <StatusPill status={event.seatStatus} />
          <div className="flex flex-wrap justify-end gap-1.5">
            <span className="rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
              {event.category}
            </span>
          </div>
        </div>

        <div className="pointer-events-none relative z-20 flex-1 px-4 pb-4">
          <h2 className="mt-1 text-[0.95rem] font-semibold leading-snug text-foreground">
            {event.title}
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-primary/60" aria-hidden />
              <span>{event.date} · {event.time}</span>
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/60" aria-hidden />
              <span>{event.location}</span>
            </li>
            <li className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 shrink-0 text-primary/60" aria-hidden />
              <span>
                {event.remainingSeats} seat{event.remainingSeats !== 1 ? "s" : ""} remaining
              </span>
            </li>
          </ul>

          {isOwnWorkshop ? (
            <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
              <p className="font-medium">This is your workshop.</p>
              <p className="mt-0.5 text-xs">You cannot register for workshops you organize.</p>
            </div>
          ) : activeRegistration && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <p className="font-medium">Registered</p>
              <p className="mt-0.5 text-xs">
                {activeRegistration.fullName}, {activeRegistration.participants} participant
                {activeRegistration.participants !== 1 ? "s" : ""}
              </p>
            </div>
          )}
        </div>

        <div className="relative z-30 grid gap-2 border-t px-4 py-3">
          {isOwnWorkshop ? (
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href={`/admin/events/${event.id}/edit`}>Manage workshop</Link>
            </Button>
          ) : activeRegistration ? (
            <>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href={`/registrations/${activeRegistration.id}/edit?returnTo=/events`}>
                  Edit registration
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={cancellingRegistrationId === activeRegistration.id}
                onClick={() => setRegistrationToCancelId(activeRegistration.id)}
              >
                {cancellingRegistrationId === activeRegistration.id ? "Cancelling…" : "Cancel registration"}
              </Button>
            </>
          ) : registrationAvailable ? (
            <Button asChild size="sm" className="w-full">
              <Link href={`/events/${event.id}/register`}>Register</Link>
            </Button>
          ) : (
            <Button disabled size="sm" className="w-full">
              Registration unavailable
            </Button>
          )}
        </div>
      </article>
    );
  }

  async function cancelRegistration(registrationId: string) {
    setCancellingRegistrationId(registrationId);
    setMessage("");
    try {
      const response = await fetch(`/api/registrations/${registrationId}/cancel`, { method: "PATCH" });
      if (!response.ok) {
        throw new Error("Registration could not be cancelled.");
      }
      await loadOverview();
      setMessageKind("success");
      setMessage("Registration cancelled. Event capacity has been restored.");
      setRegistrationToCancelId("");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Registration could not be cancelled.");
    } finally {
      setCancellingRegistrationId("");
    }
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Workshop Events</h1>
        <p className="mt-2 text-muted-foreground">
          Browse workshops, apply filters, and register for the ones that interest you.
        </p>
      </div>

      {/* Filter toolbar */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1 basis-48">
          <Input
            id="event-search"
            type="search"
            placeholder="Search title, description, speaker…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
          />
        </div>
        <div className="h-5 w-px bg-border" aria-hidden />
        <div className="w-42">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 w-full border-0 bg-transparent shadow-none focus:ring-0">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="h-5 w-px bg-border" aria-hidden />
        <div className="w-40">
          <Select value={location} onValueChange={setLocation}>
            <SelectTrigger className="h-9 w-full border-0 bg-transparent shadow-none focus:ring-0">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="h-5 w-px bg-border" aria-hidden />
        <div className="w-36">
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v === "title" ? "title" : "date")}
          >
            <SelectTrigger className="h-9 w-full border-0 bg-transparent shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Sort: Date</SelectItem>
              <SelectItem value="title">Sort: Title</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {message && (
        <div
          className={cn(
            "mb-5 rounded-xl border px-4 py-3 text-sm",
            messageKind === "error"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-emerald-300 bg-emerald-50 text-emerald-800",
          )}
          role="status"
        >
          {message}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 py-12 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm">Loading events…</span>
        </div>
      )}

      {!loading && visibleEvents.length === 0 && (
        <div className="rounded-xl border bg-card px-6 py-16 text-center">
          <p className="text-sm font-medium text-foreground">No events found</p>
          <p className="mt-1 text-sm text-muted-foreground">Try adjusting your search or filters.</p>
        </div>
      )}

      {visiblePublicEvents.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visiblePublicEvents.map((event) => renderEventCard(event, false))}
        </div>
      )}

      {visibleOwnEvents.length > 0 && (
        <section className="mt-10 border-t pt-8" aria-labelledby="own-workshops-heading">
          <div className="mb-4">
            <h2 id="own-workshops-heading" className="text-xl font-semibold tracking-tight">
              Your Workshops
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleOwnEvents.map((event) => renderEventCard(event, true))}
          </div>
        </section>
      )}

      <ConfirmationDialog
        open={Boolean(registrationToCancelId)}
        title="Cancel registration?"
        description="This will cancel the registration and restore the event capacity."
        confirmLabel="Cancel registration"
        cancelLabel="Keep registration"
        isPending={Boolean(cancellingRegistrationId)}
        onConfirm={() => {
          if (registrationToCancelId) {
            void cancelRegistration(registrationToCancelId);
          }
        }}
        onOpenChange={(open) => {
          if (!open && !cancellingRegistrationId) {
            setRegistrationToCancelId("");
          }
        }}
      />
    </>
  );
}
