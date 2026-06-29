import EventDetailClient from "@/components/EventDetailClient";

export const runtime = "nodejs";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EventDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <EventDetailClient eventId={id} />;
}
