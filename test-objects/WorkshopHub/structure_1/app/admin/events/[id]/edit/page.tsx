import EventFormClient from "@/components/EventFormClient";
import { requireAuthenticatedUser } from "@/lib/server-auth";

export const runtime = "nodejs";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditEventPage({ params }: PageProps) {
  const { id } = await params;
  await requireAuthenticatedUser();
  return <EventFormClient eventId={id} />;
}
