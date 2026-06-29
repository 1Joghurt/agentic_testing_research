"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RegistrationWithEvent } from "@/types/domain";

interface RegistrationsResponse {
  registrations: RegistrationWithEvent[];
}

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        status === "active"
          ? "bg-emerald-100 text-emerald-700"
          : "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

function formatRegisteredAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

export default function RegistrationsClient() {
  const [registrations, setRegistrations] = useState<RegistrationWithEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [registrationToCancelId, setRegistrationToCancelId] = useState("");
  const [cancellingRegistrationId, setCancellingRegistrationId] = useState("");

  async function loadRegistrations() {
    setLoading(true);
    const response = await fetch("/api/registrations", { cache: "no-store" });
    if (!response.ok) {
      setMessage("Registrations could not be loaded.");
      setLoading(false);
      return;
    }
    const data = (await response.json()) as RegistrationsResponse;
    setRegistrations(data.registrations);
    setLoading(false);
  }

  useEffect(() => {
    void loadRegistrations();
  }, []);

  async function cancelRegistration(id: string) {
    setCancellingRegistrationId(id);
    setMessage("");
    try {
      const response = await fetch(`/api/registrations/${id}/cancel`, { method: "PATCH" });
      if (!response.ok) {
        setMessage("Registration could not be cancelled.");
        return;
      }
      await loadRegistrations();
      setMessage("Registration cancelled. Event capacity has been restored.");
      setRegistrationToCancelId("");
    } finally {
      setCancellingRegistrationId("");
    }
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">My Registrations</h1>
        <p className="mt-2 text-muted-foreground">
          View your registered events and cancel active registrations.
        </p>
      </div>

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
          <span className="text-sm">Loading registrations…</span>
        </div>
      )}

      {!loading && registrations.length === 0 && (
        <div className="rounded-xl border bg-card px-6 py-16 text-center">
          <p className="text-sm font-medium text-foreground">No registrations yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse events and register for the ones you are interested in.
          </p>
        </div>
      )}

      {!loading && registrations.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  {["Event", "Name", "Email", "Participants", "Status", "Registered on", ""].map((h) => (
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
                {registrations.map((reg) => (
                  <tr key={reg.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium text-foreground">{reg.eventTitle}</td>
                    <td className="px-4 py-3 text-muted-foreground">{reg.fullName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{reg.email}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{reg.phone}</td>
                    <td className="px-4 py-3">
                      <StatusChip status={reg.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatRegisteredAt(reg.registeredAt)}
                    </td>
                    <td className="px-4 py-3">
                      {reg.status !== "cancelled" && (
                        <div className="flex items-center gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/registrations/${reg.id}/edit?returnTo=/registrations`}>Edit</Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={cancellingRegistrationId === reg.id}
                            onClick={() => setRegistrationToCancelId(reg.id)}
                          >
                            {cancellingRegistrationId === reg.id ? "Cancelling..." : "Cancel"}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
