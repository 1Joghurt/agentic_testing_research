"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { withSuccessBanner } from "@/lib/success-banner";
import { cn } from "@/lib/utils";
import { validateFeedback } from "@/lib/validation";
import type { FeedbackInput, User, WorkshopEventWithSeats } from "@/types/domain";

interface EventsResponse {
  events: WorkshopEventWithSeats[];
}

interface FeedbackResponse {
  errors?: Record<string, string>;
}

interface MeResponse {
  user: User | null;
}

const emptyInput: FeedbackInput = {
  eventId: "",
  rating: 0,
  comment: "",
  recommend: false,
};

const RATINGS = [1, 2, 3, 4, 5] as const;

export default function FeedbackClient() {
  const router = useRouter();
  const [events, setEvents] = useState<WorkshopEventWithSeats[]>([]);
  const [input, setInput] = useState<FeedbackInput>(emptyInput);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  function clearFieldError(field: string) {
    setErrors((currentErrors) => {
      if (!currentErrors[field]) return currentErrors;
      return Object.fromEntries(
        Object.entries(currentErrors).filter(([errorField]) => errorField !== field),
      );
    });
  }

  useEffect(() => {
    async function loadEvents() {
      const [eventsResponse, meResponse] = await Promise.all([
        fetch("/api/events", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);
      if (!eventsResponse.ok) {
        setErrors({ request: "Events could not be loaded." });
        setLoading(false);
        return;
      }
      const eventsData = (await eventsResponse.json()) as EventsResponse;
      const meData = meResponse.ok ? ((await meResponse.json()) as MeResponse) : { user: null };
      setEvents(eventsData.events.filter((event) => event.ownerId !== meData.user?.id));
      setLoading(false);
    }
    void loadEvents();
  }, []);

  async function handleSubmit(formEvent: React.SyntheticEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const validation = validateFeedback(input);
    setErrors(validation.errors);
    if (!validation.valid) return;

    setSubmitting(true);
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = (await response.json()) as FeedbackResponse;
    setSubmitting(false);

    if (!response.ok) {
      setErrors(data.errors ?? { request: "Feedback could not be submitted." });
      return;
    }

    setInput(emptyInput);
    router.push(withSuccessBanner("/feedback", "feedback-submitted"));
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Event Feedback</h1>
        <p className="mt-2 text-muted-foreground">
          Share your experience with a rating and comment.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-3 py-12 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm">Loading feedback form…</span>
        </div>
      )}
      {errors.request && (
        <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errors.request}
        </div>
      )}
      {!loading && (
        <form
          className="rounded-xl border bg-card p-6 shadow-sm"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Event select */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Event</Label>
              <Select
                value={input.eventId}
                onValueChange={(v) => {
                  setInput({ ...input, eventId: v });
                  clearFieldError("eventId");
                }}
              >
                <SelectTrigger
                  className="w-full"
                  aria-describedby={errors.eventId ? "event-error" : undefined}
                >
                  <SelectValue placeholder="Select an event" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.eventId && (
                <p id="event-error" className="text-xs font-medium text-destructive">
                  {errors.eventId}
                </p>
              )}
            </div>

            {/* Star rating */}
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-sm font-medium">Rating</legend>
              <div className="flex items-center gap-1">
                {RATINGS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setInput({ ...input, rating: r });
                      clearFieldError("rating");
                    }}
                    className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-pressed={input.rating === r}
                    aria-label={`${r} star${r !== 1 ? "s" : ""}`}
                  >
                    <Star
                      className={cn(
                        "h-7 w-7 transition-colors",
                        r <= input.rating
                          ? "fill-amber-400 text-amber-400"
                          : "fill-transparent text-border",
                      )}
                    />
                  </button>
                ))}
                {input.rating > 0 && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    {input.rating} / 5
                  </span>
                )}
              </div>
              {errors.rating && (
                <p className="mt-1.5 text-xs font-medium text-destructive">{errors.rating}</p>
              )}
            </fieldset>

            {/* Comment */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="comment">Comment</Label>
              <Textarea
                id="comment"
                value={input.comment}
                onChange={(e) => {
                  setInput({ ...input, comment: e.target.value });
                  clearFieldError("comment");
                }}
                rows={4}
                placeholder="Share your thoughts (at least 10 characters)…"
                aria-describedby={errors.comment ? "comment-error" : undefined}
              />
              {errors.comment && (
                <p id="comment-error" className="text-xs font-medium text-destructive">
                  {errors.comment}
                </p>
              )}
            </div>

            {/* Recommend */}
            <div className="flex items-center gap-3 sm:col-span-2">
              <Checkbox
                id="recommend"
                checked={input.recommend}
                onCheckedChange={(checked) =>
                  setInput({ ...input, recommend: checked === true })
                }
              />
              <Label htmlFor="recommend" className="cursor-pointer font-normal">
                I would recommend this event to others
              </Label>
            </div>
          </div>

          <div className="mt-6 border-t pt-5">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit feedback"}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
