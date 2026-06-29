"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { withSuccessBanner } from "@/lib/success-banner";
import { validateEvent } from "@/lib/validation";
import type { EventInput, User, WorkshopEventWithSeats } from "@/types/domain";

interface EventResponse {
  event: WorkshopEventWithSeats;
  errors?: Record<string, string>;
  message?: string;
}

interface MeResponse {
  user: User | null;
}

const emptyInput: EventInput = {
  title: "",
  description: "",
  category: "",
  date: "",
  time: "",
  location: "",
  capacity: 1,
  speaker: "",
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

export default function EventFormClient({ eventId }: { eventId?: string }) {
  const router = useRouter();
  const isEditing = Boolean(eventId);
  const [input, setInput] = useState<EventInput>(emptyInput);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);

  function clearFieldError(field: string) {
    setErrors((currentErrors) => {
      if (!currentErrors[field]) return currentErrors;
      return Object.fromEntries(
        Object.entries(currentErrors).filter(([errorField]) => errorField !== field),
      );
    });
  }

  useEffect(() => {
    async function loadForm() {
      setLoading(true);
      setAuthRequired(false);
      const meResponse = await fetch("/api/auth/me", { cache: "no-store" });
      const meData = meResponse.ok ? ((await meResponse.json()) as MeResponse) : { user: null };
      if (!meData.user) {
        setAuthRequired(true);
        setLoading(false);
        return;
      }

      if (!eventId) {
        setLoading(false);
        return;
      }

      const eventResponse = await fetch(`/api/events/${eventId}`, { cache: "no-store" });
      if (!eventResponse.ok) {
        setErrors({ request: "Event was not found." });
        setLoading(false);
        return;
      }
      const data = (await eventResponse.json()) as EventResponse;
      if (data.event.ownerId !== meData.user.id) {
        setErrors({ auth: "You can only manage your own events." });
        setLoading(false);
        return;
      }
      setInput({
        title: data.event.title,
        description: data.event.description,
        category: data.event.category,
        date: data.event.date,
        time: data.event.time,
        location: data.event.location,
        capacity: data.event.capacity,
        speaker: data.event.speaker,
      });
      setLoading(false);
    }
    void loadForm();
  }, [eventId]);

  async function handleSubmit(formEvent: React.SyntheticEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const validation = validateEvent(input);
    setErrors(validation.errors);
    if (!validation.valid) return;

    setSubmitting(true);
    const response = await fetch(eventId ? `/api/events/${eventId}` : "/api/events", {
      method: eventId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = (await response.json()) as EventResponse;
    setSubmitting(false);

    if (!response.ok) {
      if (response.status === 401) {
        setAuthRequired(true);
      }
      setErrors(data.errors ?? { request: data.message ?? "Event could not be saved." });
      return;
    }

    setInput({
      title: data.event.title,
      description: data.event.description,
      category: data.event.category,
      date: data.event.date,
      time: data.event.time,
      location: data.event.location,
      capacity: data.event.capacity,
      speaker: data.event.speaker,
    });
    router.push(withSuccessBanner("/admin/events", isEditing ? "event-updated" : "event-created"));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12 text-muted-foreground">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-sm">Loading event form…</span>
      </div>
    );
  }

  return (
    <>
      <div className="mb-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground hover:text-foreground">
          <Link href="/admin/events">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to My Workshops
          </Link>
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {isEditing ? "Edit Event" : "Create Event"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Fill in the details below. Events are saved to your WorkshopHub account.
        </p>
      </div>

      {authRequired && (
        <div className="rounded-xl border bg-card px-6 py-10 shadow-sm">
          <h2 className="text-lg font-semibold">Log in to manage events</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            You need a WorkshopHub account before you can create or edit events.
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

      {errors.auth && (
        <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errors.auth}
        </div>
      )}
      {errors.request && (
        <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errors.request}
        </div>
      )}
      <form
        className={authRequired || errors.auth ? "hidden" : "rounded-xl border bg-card p-6 shadow-sm"}
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={input.title}
              onChange={(e) => {
                setInput({ ...input, title: e.target.value });
                clearFieldError("title");
              }}
              aria-describedby={errors.title ? "title-error" : undefined}
            />
            <FieldError id="title-error" message={errors.title} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              value={input.category}
              onChange={(e) => {
                setInput({ ...input, category: e.target.value });
                clearFieldError("category");
              }}
              aria-describedby={errors.category ? "category-error" : undefined}
            />
            <FieldError id="category-error" message={errors.category} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={input.description}
              onChange={(e) => {
                setInput({ ...input, description: e.target.value });
                clearFieldError("description");
              }}
              rows={3}
              aria-describedby={errors.description ? "description-error" : undefined}
            />
            <FieldError id="description-error" message={errors.description} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={input.date}
              onChange={(e) => {
                setInput({ ...input, date: e.target.value });
                clearFieldError("date");
              }}
              aria-describedby={errors.date ? "date-error" : undefined}
            />
            <FieldError id="date-error" message={errors.date} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="time">Time</Label>
            <Input
              id="time"
              type="time"
              value={input.time}
              onChange={(e) => {
                setInput({ ...input, time: e.target.value });
                clearFieldError("time");
              }}
              aria-describedby={errors.time ? "time-error" : undefined}
            />
            <FieldError id="time-error" message={errors.time} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={input.location}
              onChange={(e) => {
                setInput({ ...input, location: e.target.value });
                clearFieldError("location");
              }}
              aria-describedby={errors.location ? "location-error" : undefined}
            />
            <FieldError id="location-error" message={errors.location} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="capacity">Capacity</Label>
            <Input
              id="capacity"
              type="number"
              min="1"
              value={input.capacity}
              onChange={(e) => {
                setInput({ ...input, capacity: Number(e.target.value) });
                clearFieldError("capacity");
              }}
              aria-describedby={errors.capacity ? "capacity-error" : undefined}
            />
            <FieldError id="capacity-error" message={errors.capacity} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="speaker">Speaker or organizer</Label>
            <Input
              id="speaker"
              value={input.speaker}
              onChange={(e) => {
                setInput({ ...input, speaker: e.target.value });
                clearFieldError("speaker");
              }}
              aria-describedby={errors.speaker ? "speaker-error" : undefined}
            />
            <FieldError id="speaker-error" message={errors.speaker} />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 border-t pt-5">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : isEditing ? "Save changes" : "Create event"}
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/events">Cancel</Link>
          </Button>
        </div>
      </form>
    </>
  );
}
