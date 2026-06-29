"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageSquare, Plus, Star } from "lucide-react";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FeedbackWithEvent, WorkshopEventWithSeats } from "@/types/domain";

interface EventsResponse {
  events: WorkshopEventWithSeats[];
  message?: string;
}

interface FeedbackResponse {
  feedback: FeedbackWithEvent[];
  message?: string;
}

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        status === "active" && "bg-emerald-100 text-emerald-700",
        status === "cancelled" && "bg-red-100 text-red-700",
        status !== "active" && status !== "cancelled" && "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

export default function AdminEventsClient() {
  const [events, setEvents] = useState<WorkshopEventWithSeats[]>([]);
  const [feedback, setFeedback] = useState<FeedbackWithEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [eventToCancelId, setEventToCancelId] = useState("");
  const [cancellingEventId, setCancellingEventId] = useState("");

  async function loadEvents() {
    setLoading(true);
    setMessage("");
    setAuthRequired(false);
    const [eventsResponse, feedbackResponse] = await Promise.all([
      fetch("/api/events?owner=me", { cache: "no-store" }),
      fetch("/api/feedback", { cache: "no-store" }),
    ]);
    if (eventsResponse.status === 401 || feedbackResponse.status === 401) {
      setAuthRequired(true);
      setEvents([]);
      setFeedback([]);
      setLoading(false);
      return;
    }
    if (!eventsResponse.ok || !feedbackResponse.ok) {
      setMessage("Workshops and feedback could not be loaded.");
      setLoading(false);
      return;
    }
    const eventsData = (await eventsResponse.json()) as EventsResponse;
    const feedbackData = (await feedbackResponse.json()) as FeedbackResponse;
    setEvents(eventsData.events);
    setFeedback(feedbackData.feedback);
    setLoading(false);
  }

  useEffect(() => {
    void loadEvents();
  }, []);

  async function cancelEvent(id: string) {
    setCancellingEventId(id);
    setMessage("");
    try {
      const response = await fetch(`/api/events/${id}/cancel`, { method: "PATCH" });
      if (!response.ok) {
        const data = (await response.json()) as Partial<EventsResponse>;
        setMessage(data.message ?? "Event could not be cancelled.");
        return;
      }
      await loadEvents();
      setMessage("Event cancelled successfully.");
      setEventToCancelId("");
    } finally {
      setCancellingEventId("");
    }
  }

  return (
    <>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Workshops</h1>
          <p className="mt-2 text-muted-foreground">
            Create, edit, and cancel your workshops, and review participant feedback.
          </p>
        </div>
        {!loading && !authRequired && (
          <Button asChild>
            <Link href="/admin/events/new">
              <Plus className="mr-1.5 h-4 w-4" />
              Create event
            </Link>
          </Button>
        )}
      </div>

      {authRequired && (
        <div className="rounded-xl border bg-card px-6 py-10 shadow-sm">
          <h2 className="text-lg font-semibold">Log in to use My Workshops</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            My Workshops only shows events created by your current WorkshopHub account.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/login">Log In</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/register">Register</Link>
            </Button>
          </div>
        </div>
      )}

      {message && (
        <div
          className={cn(
            "mb-5 rounded-xl border px-4 py-3 text-sm",
            message.includes("could not")
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

      {!loading && !authRequired && events.length === 0 && (
        <div className="rounded-xl border bg-card px-6 py-16 text-center">
          <p className="text-sm font-medium text-foreground">No managed events yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create an event to make it appear in My Workshops.
          </p>
        </div>
      )}

      {!loading && !authRequired && events.length > 0 && (
        <>
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    {["Title", "Category", "Date & Time", "Location", "Capacity", "Seats left", "Status", "Actions"].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {events.map((event) => (
                    <tr key={event.id} className="transition-colors hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium text-foreground">{event.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">{event.category}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {event.date} {event.time}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{event.location}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{event.capacity}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{event.remainingSeats}</td>
                      <td className="px-4 py-3">
                        <StatusChip status={event.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/admin/events/${event.id}/edit`}>Edit</Link>
                          </Button>
                          {event.status !== "cancelled" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              disabled={cancellingEventId === event.id}
                              onClick={() => setEventToCancelId(event.id)}
                            >
                              {cancellingEventId === event.id ? "Cancelling..." : "Cancel"}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <section className="mt-10" aria-labelledby="workshop-feedback-heading">
            <div className="mb-4">
              <h2 id="workshop-feedback-heading" className="text-2xl font-bold tracking-tight">
                Workshop feedback
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ratings and comments submitted for workshops you organize.
              </p>
            </div>

            {feedback.length === 0 ? (
              <div className="rounded-xl border bg-card px-6 py-10 text-center">
                <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium text-foreground">No feedback yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Submitted feedback for your workshops will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {events.map((event) => {
                  const eventFeedback = feedback.filter((entry) => entry.eventId === event.id);
                  if (eventFeedback.length === 0) return null;

                  const averageRating =
                    eventFeedback.reduce((total, entry) => total + entry.rating, 0) /
                    eventFeedback.length;
                  const recommendationCount = eventFeedback.filter((entry) => entry.recommend).length;

                  return (
                    <article key={event.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-5 py-4">
                        <div>
                          <h3 className="font-semibold text-foreground">{event.title}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {eventFeedback.length} {eventFeedback.length === 1 ? "response" : "responses"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-sm">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-800">
                            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                            {averageRating.toFixed(1)} / 5
                          </span>
                          <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-800">
                            {recommendationCount} recommend
                          </span>
                        </div>
                      </div>
                      <ul className="divide-y divide-border">
                        {eventFeedback.map((entry) => (
                          <li key={entry.id} className="px-5 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span
                                className="inline-flex items-center gap-1 text-sm font-medium"
                                aria-label={`${entry.rating} out of 5 stars`}
                              >
                                {Array.from({ length: 5 }, (_, index) => (
                                  <Star
                                    key={index}
                                    className={cn(
                                      "h-4 w-4",
                                      index < entry.rating
                                        ? "fill-amber-400 text-amber-400"
                                        : "text-border",
                                    )}
                                  />
                                ))}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {entry.recommend ? "Would recommend" : "Would not recommend"}
                              </span>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-foreground">{entry.comment}</p>
                          </li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      <ConfirmationDialog
        open={Boolean(eventToCancelId)}
        title="Cancel event?"
        description="This will mark the event as cancelled. Existing registrations remain in the system."
        confirmLabel="Cancel event"
        cancelLabel="Keep event"
        isPending={Boolean(cancellingEventId)}
        onConfirm={() => {
          if (eventToCancelId) {
            void cancelEvent(eventToCancelId);
          }
        }}
        onOpenChange={(open) => {
          if (!open && !cancellingEventId) {
            setEventToCancelId("");
          }
        }}
      />
    </>
  );
}
