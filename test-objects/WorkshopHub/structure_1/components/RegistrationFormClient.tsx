"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { ArrowLeft } from "lucide-react";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { withSuccessBanner } from "@/lib/success-banner";
import { validateRegistration, validateRegistrationUpdate } from "@/lib/validation";
import type { RegistrationInput, RegistrationWithEvent, User, WorkshopEventWithSeats } from "@/types/domain";

interface EventResponse {
  event: WorkshopEventWithSeats;
}

interface RegistrationResponse {
  event: WorkshopEventWithSeats;
  registration?: RegistrationWithEvent;
  errors?: Record<string, string>;
}

interface RegistrationsResponse {
  registrations: RegistrationWithEvent[];
}

interface MeResponse {
  user: User | null;
}

const emptyInput: RegistrationInput = {
  eventId: "",
  fullName: "",
  email: "",
  phone: "",
  participants: 1,
  note: "",
  termsAccepted: false,
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

interface RegistrationFormClientProps {
  eventId?: string;
  registrationId?: string;
  returnTo?: string;
}

export default function RegistrationFormClient({
  eventId = "",
  registrationId,
  returnTo,
}: RegistrationFormClientProps) {
  const router = useRouter();
  const [event, setEvent] = useState<WorkshopEventWithSeats | null>(null);
  const [input, setInput] = useState<RegistrationInput>({ ...emptyInput, eventId });
  const [registration, setRegistration] = useState<RegistrationWithEvent | null>(null);
  const [existingRegistration, setExistingRegistration] = useState<RegistrationWithEvent | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const isEditing = Boolean(registrationId);

  function validationErrorsForCurrentInput(): Record<string, string> {
    const eventForValidation =
      isEditing && event && registration
        ? { ...event, remainingSeats: event.remainingSeats + registration.participants }
        : event;
    const validation = isEditing
      ? validateRegistrationUpdate(input, eventForValidation)
      : validateRegistration(input, eventForValidation);
    return validation.errors;
  }

  function validateField(field: keyof RegistrationInput) {
    const validationErrors = validationErrorsForCurrentInput();
    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      if (validationErrors[field]) {
        nextErrors[field] = validationErrors[field];
        return nextErrors;
      }
      return Object.fromEntries(
        Object.entries(currentErrors).filter(([errorField]) => errorField !== field),
      );
    });
  }

  useEffect(() => {
    async function loadRegistration(user: User) {
      if (!registrationId) return false;

      const response = await fetch(`/api/registrations/${registrationId}`, { cache: "no-store" });
      if (!response.ok) {
        setErrors({ registration: "Registration was not found." });
        setLoading(false);
        return true;
      }

      const data = (await response.json()) as RegistrationResponse;
      if (!data.registration) {
        setErrors({ registration: "Registration was not found." });
        setLoading(false);
        return true;
      }

      setRegistration(data.registration);
      setEvent(data.event);
      setInput({
        eventId: data.registration.eventId,
        fullName: user.fullName,
        email: user.email,
        phone: data.registration.phone,
        participants: data.registration.participants,
        note: data.registration.note,
        termsAccepted: true,
      });
      setLoading(false);
      return true;
    }

    async function loadEvent() {
      const meResponse = await fetch("/api/auth/me", { cache: "no-store" });
      const meData = meResponse.ok ? ((await meResponse.json()) as MeResponse) : { user: null };
      if (!meData.user) {
        setErrors({ request: "You must be logged in." });
        setLoading(false);
        return;
      }

      const user = meData.user;
      setCurrentUser(user);
      setInput((currentInput) => ({
        ...currentInput,
        fullName: user.fullName,
        email: user.email,
      }));

      const loadedRegistration = await loadRegistration(user);
      if (loadedRegistration) return;

      const response = await fetch(`/api/events/${eventId}`, { cache: "no-store" });
      if (!response.ok) {
        setErrors({ event: "Event was not found." });
        setLoading(false);
        return;
      }
      const data = (await response.json()) as EventResponse;
      setEvent(data.event);
      if (data.event.ownerId === user.id) {
        setLoading(false);
        return;
      }
      const registrationsResponse = await fetch("/api/registrations", { cache: "no-store" });
      if (registrationsResponse.ok) {
        const registrationsData = (await registrationsResponse.json()) as RegistrationsResponse;
        setExistingRegistration(
          registrationsData.registrations.find(
            (candidate) => candidate.eventId === eventId && candidate.status === "active",
          ) ?? null,
        );
      }
      setLoading(false);
    }

    void loadEvent();
  }, [eventId, registrationId]);

  function validateForm(): boolean {
    const validation = { errors: validationErrorsForCurrentInput() };
    setErrors(validation.errors);
    return Object.keys(validation.errors).length === 0;
  }

  async function submitRegistration() {
    if (!validateForm()) return;

    setSubmitting(true);
    const submitUrl =
      isEditing && registrationId ? `/api/registrations/${registrationId}` : "/api/registrations";
    const response = await fetch(submitUrl, {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = (await response.json()) as RegistrationResponse;
    setSubmitting(false);

    if (!response.ok) {
      setConfirmCancelOpen(false);
      setErrors(data.errors ?? { request: "Registration could not be completed." });
      return;
    }

    setEvent(data.event);
    if (data.registration) {
      setRegistration(data.registration);
      setInput({
        eventId: data.registration.eventId,
        fullName: currentUser?.fullName ?? data.registration.fullName,
        email: currentUser?.email ?? data.registration.email,
        phone: data.registration.phone,
        participants: data.registration.participants,
        note: data.registration.note,
        termsAccepted: true,
      });
    } else {
      setInput({
        ...emptyInput,
        eventId,
        fullName: currentUser?.fullName ?? "",
        email: currentUser?.email ?? "",
      });
    }
    setConfirmCancelOpen(false);
    router.push(
      withSuccessBanner(
        returnTo ?? `/events/${data.event.id}`,
        isEditing ? "registration-updated" : "registration-created",
      ),
    );
  }

  async function handleSubmit(formEvent: React.SyntheticEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (cancelsRegistration) {
      if (validateForm()) {
        setConfirmCancelOpen(true);
      }
      return;
    }

    await submitRegistration();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12 text-muted-foreground">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-sm">Loading registration form…</span>
      </div>
    );
  }

  const seatsAvailableForThisRegistration =
    isEditing && event && registration
      ? event.remainingSeats + registration.participants
      : event?.remainingSeats;
  const ownsEvent = Boolean(currentUser && event?.ownerId === currentUser.id);
  const unavailable =
    ownsEvent ||
    event?.status !== "active" ||
    !seatsAvailableForThisRegistration ||
    seatsAvailableForThisRegistration <= 0 ||
    registration?.status === "cancelled";
  const backHref = returnTo ?? (isEditing ? "/registrations" : `/events/${eventId}`);
  const cancelHref = returnTo ?? (isEditing ? "/registrations" : `/events/${eventId}`);
  const cancelsRegistration = isEditing && input.participants === 0;
  const duplicateRegistration = !isEditing && existingRegistration;
  const participantMinimum = isEditing ? 0 : 1;
  const participantMaximum = seatsAvailableForThisRegistration ?? participantMinimum;

  return (
    <>
      <div className="mb-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground hover:text-foreground">
          <Link href={backHref}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {isEditing ? "Back to registrations" : "Back to event"}
          </Link>
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {isEditing ? "Edit registration" : "Register"} for {event?.title ?? "event"}
        </h1>
        {event && seatsAvailableForThisRegistration !== undefined && (
          <p className="mt-2 text-muted-foreground">
            {isEditing
              ? `${seatsAvailableForThisRegistration} seat${
                  seatsAvailableForThisRegistration !== 1 ? "s" : ""
                } available for this registration`
              : `${event.remainingSeats} seat${event.remainingSeats !== 1 ? "s" : ""} remaining`}
          </p>
        )}
      </div>

      {errors.registration && (
        <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errors.registration}
        </div>
      )}
      {errors.event && (
        <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errors.event}
        </div>
      )}
      {errors.request && (
        <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errors.request}
        </div>
      )}
      {unavailable && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {ownsEvent
            ? "You cannot register for your own workshop."
            : "Registration is not available for this event."}
        </div>
      )}
      {duplicateRegistration && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-medium">You are already registered for this event.</p>
          <Button asChild variant="outline" size="sm" className="mt-3 border-emerald-300 bg-white/70">
            <Link href={`/registrations/${existingRegistration.id}/edit?returnTo=/events/${eventId}`}>
              Edit registration
            </Link>
          </Button>
        </div>
      )}

      {!duplicateRegistration && !unavailable && (
      <form
        className="rounded-xl border bg-card p-6 shadow-sm"
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="full-name">Full name</Label>
            <Input
              id="full-name"
              value={input.fullName}
              disabled
              aria-describedby={errors.fullName ? "full-name-error" : undefined}
            />
            <FieldError id="full-name-error" message={errors.fullName} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              value={input.email}
              disabled
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            <FieldError id="email-error" message={errors.email} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">
              Phone number{" "}
              <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="phone"
              value={input.phone}
              onChange={(e) => {
                setInput({ ...input, phone: e.target.value });
              }}
              onBlur={() => validateField("phone")}
              aria-describedby={errors.phone ? "phone-error" : undefined}
            />
            <FieldError id="phone-error" message={errors.phone} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="participants">Number of participants</Label>
            <Input
              id="participants"
              type="number"
              min={participantMinimum}
              max={participantMaximum}
              value={input.participants}
              onChange={(e) => {
                setInput({ ...input, participants: Number(e.target.value) });
              }}
              onBlur={() => validateField("participants")}
              aria-describedby={errors.participants ? "participants-error" : undefined}
              aria-invalid={Boolean(errors.participants) || undefined}
            />
            <FieldError id="participants-error" message={errors.participants} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="note">
              Note{" "}
              <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="note"
              value={input.note}
              onChange={(e) => setInput({ ...input, note: e.target.value })}
              rows={3}
              placeholder="Any specific requirements or questions…"
            />
          </div>

          <div className="flex items-start gap-3 sm:col-span-2">
            <Checkbox
              id="terms"
              checked={input.termsAccepted}
              onCheckedChange={(checked) => {
                setInput({ ...input, termsAccepted: checked === true });
              }}
              onBlur={() => validateField("termsAccepted")}
              aria-describedby={errors.termsAccepted ? "terms-error" : undefined}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="terms" className="font-normal">
                I accept the{" "}
                <button
                  type="button"
                  className="font-medium text-primary underline underline-offset-4"
                  onClick={() => setTermsOpen(true)}
                >
                  participation terms
                </button>
              </Label>
              <FieldError id="terms-error" message={errors.termsAccepted} />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 border-t pt-5">
          <Button
            type="submit"
            disabled={submitting}
            variant={cancelsRegistration ? "destructive" : "default"}
          >
            {submitting
              ? cancelsRegistration
                ? "Cancelling..."
                : isEditing
                  ? "Saving…"
                  : "Submitting…"
              : cancelsRegistration
                ? "Cancel registration"
                : isEditing
                  ? "Update registration"
                  : "Submit registration"}
          </Button>
          <Button asChild variant="outline">
            <Link href={cancelHref}>Cancel</Link>
          </Button>
        </div>
      </form>
      )}

      <ConfirmationDialog
        open={confirmCancelOpen}
        title="Cancel registration?"
        description="This will cancel the registration and restore the event capacity."
        confirmLabel="Cancel registration"
        cancelLabel="Keep registration"
        isPending={submitting}
        onConfirm={() => {
          void submitRegistration();
        }}
        onOpenChange={(open) => {
          if (!open && !submitting) {
            setConfirmCancelOpen(false);
          }
        }}
      />

      <AlertDialog.Root open={termsOpen} onOpenChange={setTermsOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-popover p-5 text-popover-foreground shadow-xl">
            <AlertDialog.Title className="text-base font-semibold text-foreground">
              Participation terms
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
              Please arrive on time, keep participant information accurate, and notify the organizer if you cannot attend. Workshop materials are for personal learning use. The organizer may contact you about schedule changes, room updates, or event-specific preparation.
            </AlertDialog.Description>
            <div className="mt-5 flex justify-end">
              <AlertDialog.Cancel asChild>
                <Button variant="outline">Close</Button>
              </AlertDialog.Cancel>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
