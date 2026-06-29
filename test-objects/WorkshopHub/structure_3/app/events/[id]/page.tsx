import EventDetailClient from "@/components/EventDetailClient";
import { requireAuthenticatedUser } from "@/lib/server-auth";

export const runtime = "nodejs";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EventDetailPage({ params }: PageProps) {
  const { id } = await params;
  await requireAuthenticatedUser();
  return <EventDetailClient eventId={id} />;
}
