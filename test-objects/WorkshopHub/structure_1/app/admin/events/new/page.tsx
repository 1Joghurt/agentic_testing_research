import EventFormClient from "@/components/EventFormClient";
import { requireAuthenticatedUser } from "@/lib/server-auth";

export const runtime = "nodejs";

export default async function NewEventPage() {
  await requireAuthenticatedUser();
  return <EventFormClient />;
}
